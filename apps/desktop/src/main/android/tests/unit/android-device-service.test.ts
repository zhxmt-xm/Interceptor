import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AndroidApplicationInfo } from '../../../../shared/desktop-api';
import { AndroidDeviceService } from '../../entry';

class TestSecureStore {
  isEncryptionAvailable(): boolean { return true; }
  encryptString(value: string): Buffer { return Buffer.from(`enc:${value}`, 'utf8'); }
  decryptString(value: Buffer): string {
    const text = value.toString('utf8');
    if (!text.startsWith('enc:')) throw new Error('Invalid encrypted value');
    return text.slice(4);
  }
}

describe('AndroidDeviceService', () => {
  let directory: string;
  let adbOutput: string;
  let reverseList: string;
  let adbCalls: string[][];
  let coreCommands: CoreCommand[];
  let failReverse: boolean;
  let applicationInfo: AndroidApplicationInfo;
  let applicationInstallCalls: string[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-android-device-'));
    adbOutput = [
      'List of devices attached',
      'SERIAL-READY device product:husky model:Pixel_8 device:husky transport_id:1',
      'SERIAL-PENDING unauthorized usb:1-2 transport_id:2',
      'SERIAL-OFFLINE offline usb:1-3 transport_id:3',
      '',
    ].join('\n');
    reverseList = '';
    adbCalls = [];
    coreCommands = [];
    failReverse = false;
    applicationInfo = {
      state: 'current',
      bundledVersion: '0.1.0',
      installedVersion: '0.1.0',
      detail: null,
    };
    applicationInstallCalls = [];
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function createService(): AndroidDeviceService {
    return new AndroidDeviceService({
      dataDirectory: directory,
      secureStore: new TestSecureStore(),
      applicationPackage: {
        status: async () => applicationInfo,
        install: async (serial) => {
          applicationInstallCalls.push(serial);
          applicationInfo = {
            state: 'current',
            bundledVersion: '0.1.0',
            installedVersion: '0.1.0',
            detail: null,
          };
          return applicationInfo;
        },
      },
      runAdb: async (args) => {
        adbCalls.push([...args]);
        if (args.at(-2) === 'devices' && args.at(-1) === '-l') return adbOutput;
        if (args.includes('--list')) return reverseList;
        if (args.includes('--no-rebind')) {
          if (failReverse) throw new Error('reverse conflict');
          reverseList = 'SERIAL-READY tcp:39080 tcp:43123\n';
          return '';
        }
        if (args.includes('--remove')) {
          reverseList = '';
          return '';
        }
        if (args.includes('am') && args.includes('start')) return 'Starting: Intent';
        throw new Error(`Unexpected adb call: ${args.join(' ')}`);
      },
      requestCore: async <T extends CoreCommand>(command: T): Promise<CoreResultForCommand<T>> => {
        coreCommands.push(command);
        if (command.type === 'android.start') {
          return {
            type: 'android.status',
            payload: {
              listening: true,
              connected: false,
              host: '127.0.0.1',
              port: 43_123,
              recording: true,
              captureSessionId: 'android-session',
            },
          } as CoreResultForCommand<T>;
        }
        if (command.type === 'android.stop' || command.type === 'android.status') {
          return {
            type: 'android.status',
            payload: {
              listening: false,
              connected: false,
              host: null,
              port: null,
              recording: true,
              captureSessionId: null,
            },
          } as CoreResultForCommand<T>;
        }
        throw new Error(`Unexpected Core command: ${command.type}`);
      },
    });
  }

  it('lists exact adb states without treating USB authorization as pairing', async () => {
    const status = await createService().status();
    expect(status.devices).toEqual([
      {
        serial: 'SERIAL-READY',
        state: 'ready',
        model: 'Pixel 8',
        application: {
          state: 'current',
          bundledVersion: '0.1.0',
          installedVersion: '0.1.0',
          detail: null,
        },
      },
      {
        serial: 'SERIAL-PENDING',
        state: 'unauthorized',
        model: null,
        application: {
          state: 'unavailable',
          bundledVersion: null,
          installedVersion: null,
          detail: 'USB debugging authorization is required before checking the Android app.',
        },
      },
      {
        serial: 'SERIAL-OFFLINE',
        state: 'offline',
        model: null,
        application: {
          state: 'unavailable',
          bundledVersion: null,
          installedVersion: null,
          detail: 'The Android device is offline.',
        },
      },
    ]);
    expect(status.connectedSerial).toBeNull();
    expect(status.computerFingerprint).toMatch(/^(?:[0-9A-F]{4} ){15}[0-9A-F]{4}$/);
    expect(adbCalls).toEqual([['devices', '-l']]);
    await createService().openDeviceApplication('SERIAL-READY');
    expect(adbCalls).toContainEqual([
      '-s', 'SERIAL-READY', 'shell', 'am', 'start', '-n',
      'com.zhxmt.interceptor.android/.ui.InterceptorActivity',
    ]);
  });

  it('starts Core once then creates and removes only its confirmed reverse mapping', async () => {
    const service = createService();
    const phoneFingerprint = Array.from({ length: 16 }, (_, index) =>
      index.toString(16).padStart(4, '0')).join(' ').toUpperCase();
    const connected = await service.connectDevice('SERIAL-READY', phoneFingerprint);
    expect(connected.connectedSerial).toBe('SERIAL-READY');
    expect(coreCommands[0]).toMatchObject({
      type: 'android.start',
      payload: { devicePin: 'sha256/AAAAAQACAAMABAAFAAYABwAIAAkACgALAAwADQAOAA8=' },
    });
    expect((coreCommands[0] as Extract<CoreCommand, { type: 'android.start' }>).payload.identity)
      .toMatchObject({ key: expect.stringContaining('PRIVATE KEY'), cert: expect.stringContaining('CERTIFICATE') });
    expect(adbCalls).toContainEqual([
      '-s', 'SERIAL-READY', 'reverse', '--no-rebind', 'tcp:39080', 'tcp:43123',
    ]);

    const disconnected = await service.disconnectDevice();
    expect(disconnected.connectedSerial).toBeNull();
    expect(coreCommands.at(-1)).toEqual({ type: 'android.stop', payload: {} });
    expect(adbCalls).toContainEqual([
      '-s', 'SERIAL-READY', 'reverse', '--remove', 'tcp:39080',
    ]);
  });

  it('refuses unauthorized devices and rolls back Core when reverse creation fails', async () => {
    const service = createService();
    const fingerprint = '0000 '.repeat(15) + '0000';
    await expect(service.connectDevice('SERIAL-PENDING', fingerprint)).rejects.toThrow(/authorize/i);
    expect(coreCommands).toEqual([]);

    failReverse = true;
    await expect(service.connectDevice('SERIAL-READY', fingerprint)).rejects.toThrow('reverse conflict');
    expect(coreCommands.map(command => command.type)).toEqual(['android.start', 'android.stop']);
    expect((await service.status()).connectedSerial).toBeNull();
  });

  it('requires the verified app before connecting and returns the installed status', async () => {
    const service = createService();
    const fingerprint = '0000 '.repeat(15) + '0000';
    applicationInfo = {
      state: 'missing',
      bundledVersion: '0.1.0',
      installedVersion: null,
      detail: null,
    };

    await expect(service.connectDevice('SERIAL-READY', fingerprint)).rejects.toThrow(/install or update/i);
    expect(coreCommands).toEqual([]);

    const installed = await service.installDeviceApplication('SERIAL-READY');
    expect(applicationInstallCalls).toEqual(['SERIAL-READY']);
    expect(installed.devices.find(device => device.serial === 'SERIAL-READY')?.application.state)
      .toBe('current');
  });

  it.each([
    ['detached', 'List of devices attached\n'],
    ['offline', 'List of devices attached\nSERIAL-READY offline usb:1-1 transport_id:1\n'],
  ])('releases local ownership when the connected device is %s', async (_, disconnectedDevices) => {
    const service = createService();
    await service.connectDevice('SERIAL-READY', '0000 '.repeat(15) + '0000');
    adbOutput = disconnectedDevices;
    adbCalls = [];

    const disconnected = await service.disconnectDevice();

    expect(disconnected.connectedSerial).toBeNull();
    expect(coreCommands.at(-1)).toEqual({ type: 'android.stop', payload: {} });
    expect(adbCalls.some(args => args.includes('reverse'))).toBe(false);
  });
});
