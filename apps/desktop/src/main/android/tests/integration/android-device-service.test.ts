import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdbRunner, resolveAdbExecutable } from '../../adb';
import { AndroidApplicationPackage } from '../../apk';
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

const serial = process.env.INTERCEPTOR_ANDROID_SERIAL;
const runtimeDirectory = process.env.INTERCEPTOR_ANDROID_RUNTIME;

describe.runIf(Boolean(serial && runtimeDirectory))('AndroidDeviceService ADB integration', () => {
  const adb = createAdbRunner(resolveAdbExecutable(
    false,
    '',
    process.env.ANDROID_HOME,
    process.platform,
  ));
  const listener = net.createServer(socket => socket.end('reverse-ok'));
  let directory: string;
  let service: AndroidDeviceService;
  let androidApplicationPackage: AndroidApplicationPackage;
  let listenerPort: number | null = null;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-android-adb-'));
    androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory: runtimeDirectory as string,
      temporaryDirectory: path.join(directory, 'packages'),
      runAdb: adb,
    });
    service = new AndroidDeviceService({
      dataDirectory: directory,
      secureStore: new TestSecureStore(),
      applicationPackage: androidApplicationPackage,
      runAdb: adb,
      requestCore: async <T extends CoreCommand>(command: T): Promise<CoreResultForCommand<T>> => {
        if (command.type === 'android.start') {
          await new Promise<void>((resolve, reject) => {
            listener.once('error', reject);
            listener.listen(0, '127.0.0.1', () => {
              listener.off('error', reject);
              resolve();
            });
          });
          const address = listener.address();
          if (!address || typeof address === 'string') throw new Error('Test listener did not bind TCP.');
          listenerPort = address.port;
          return {
            type: 'android.status',
            payload: {
              listening: true,
              connected: false,
              host: '127.0.0.1',
              port: address.port,
              recording: true,
              captureSessionId: 'android-adb-integration',
            },
          } as CoreResultForCommand<T>;
        }
        if (command.type === 'android.stop') {
          if (listener.listening) {
            await new Promise<void>((resolve, reject) => listener.close(error => {
              if (error) reject(error);
              else resolve();
            }));
          }
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
  });

  afterAll(async () => {
    await service.stop();
    if (listener.listening) {
      await new Promise<void>((resolve, reject) => listener.close(error => {
        if (error) reject(error);
        else resolve();
      }));
    }
    await rm(directory, { recursive: true, force: true });
  });

  it('opens the app and owns one reachable reverse mapping until disconnect', async () => {
    const deviceSerial = serial as string;
    const initial = await service.status();
    expect(initial.devices).toContainEqual(expect.objectContaining({
      serial: deviceSerial,
      state: 'ready',
    }));
    expect(await adb(['-s', deviceSerial, 'reverse', '--list'])).not.toContain('tcp:39080');

    await service.openDeviceApplication(deviceSerial);
    const connected = await service.connectDevice(
      deviceSerial,
      Array.from({ length: 16 }, (_, index) => (index + 1).toString(16).padStart(4, '0'))
        .join(' ')
        .toUpperCase(),
    );
    expect(connected.connectedSerial).toBe(deviceSerial);
    expect(listenerPort).not.toBeNull();
    const reverseFields = (await adb(['-s', deviceSerial, 'reverse', '--list']))
      .trim()
      .split(/\s+/);
    expect(reverseFields).toEqual([expect.any(String), 'tcp:39080', `tcp:${listenerPort}`]);
    expect(await adb([
      '-s', deviceSerial, 'shell', 'toybox', 'nc', '-w', '2', '127.0.0.1', '39080',
    ])).toBe('reverse-ok');

    const disconnected = await service.disconnectDevice();
    expect(disconnected.connectedSerial).toBeNull();
    expect(await adb(['-s', deviceSerial, 'reverse', '--list'])).not.toContain('tcp:39080');
  }, 60_000);

  it.runIf(process.env.INTERCEPTOR_ANDROID_INSTALL === 'true')(
    'installs the verified APK on a device where the app is absent',
    async () => {
      const deviceSerial = serial as string;
      await adb(['-s', deviceSerial, 'uninstall', 'com.zhxmt.interceptor.android']);
      await expect(androidApplicationPackage.status(deviceSerial)).resolves.toMatchObject({
        state: 'missing',
        installedVersion: null,
      });

      const installed = await service.installDeviceApplication(deviceSerial);

      expect(installed.devices.find(device => device.serial === deviceSerial)?.application)
        .toMatchObject({
          state: 'current',
          bundledVersion: '0.1.0',
          installedVersion: '0.1.0',
        });
    },
    60_000,
  );
});
