import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AndroidApplicationPackage } from '../../apk';

describe('AndroidApplicationPackage', () => {
  let directory: string;
  let runtimeDirectory: string;
  let temporaryDirectory: string;
  let bundledApk: Buffer;
  let bundledSha256: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-android-apk-'));
    runtimeDirectory = path.join(directory, 'runtime');
    temporaryDirectory = path.join(directory, 'temporary');
    await mkdir(runtimeDirectory, { recursive: true });
    bundledApk = syntheticApk(Buffer.from('bundled-signer-certificate'));
    bundledSha256 = sha256(bundledApk);
    await writeFile(path.join(runtimeDirectory, 'Interceptor-Android.apk'), bundledApk);
    await writeFile(path.join(runtimeDirectory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      applicationId: 'com.zhxmt.interceptor.android',
      versionCode: 2,
      versionName: '0.2.0',
      apkFile: 'Interceptor-Android.apk',
      apkSha256: bundledSha256,
      signerSha256: sha256(Buffer.from('bundled-signer-certificate')),
    }));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('recognizes the exact verified bundled APK already installed on a device', async () => {
    const androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory,
      temporaryDirectory,
      runAdb: async (args) => installedPackageCommand(args, {
        versionCode: 2,
        versionName: '0.2.0',
        sha256: bundledSha256,
      }),
    });

    await expect(androidApplicationPackage.status('SERIAL')).resolves.toEqual({
      state: 'current',
      bundledVersion: '0.2.0',
      installedVersion: '0.2.0',
      detail: null,
    });
  });

  it('installs a missing package and verifies the exact installed bytes afterward', async () => {
    let installed = false;
    const calls: string[][] = [];
    const androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory,
      temporaryDirectory,
      runAdb: async (args) => {
        calls.push([...args]);
        if (args.includes('install')) {
          installed = true;
          return 'Success\n';
        }
        if (!installed && args.includes('list')) return '';
        return installedPackageCommand(args, {
          versionCode: 2,
          versionName: '0.2.0',
          sha256: bundledSha256,
        });
      },
    });

    await expect(androidApplicationPackage.install('SERIAL')).resolves.toEqual({
      state: 'current',
      bundledVersion: '0.2.0',
      installedVersion: '0.2.0',
      detail: null,
    });
    expect(calls).toContainEqual([
      '-s', 'SERIAL', 'install', '-r',
      path.join(runtimeDirectory, 'Interceptor-Android.apk'),
    ]);
  });

  it('rejects an installed package with another signer before adb install runs', async () => {
    const installedApk = syntheticApk(Buffer.from('different-signer-certificate'));
    const calls: string[][] = [];
    const installedPath = '/data/app/com.zhxmt.interceptor.android/base.apk';
    const androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory,
      temporaryDirectory,
      runAdb: async (args) => {
        calls.push([...args]);
        if (args.includes('list')) {
          return 'package:com.zhxmt.interceptor.android versionCode:1\n';
        }
        if (args.includes('dumpsys')) return 'versionName=0.1.0\n';
        if (args.includes('path')) return `package:${installedPath}\n`;
        if (args.includes('sha256sum')) return `${sha256(installedApk)}  ${installedPath}\n`;
        if (args.includes('pull')) {
          const destination = args.at(-1);
          if (!destination) throw new Error('Missing adb pull destination.');
          await writeFile(destination, installedApk);
          return '1 file pulled\n';
        }
        throw new Error(`Unexpected adb call: ${args.join(' ')}`);
      },
    });

    await expect(androidApplicationPackage.install('SERIAL')).rejects.toThrow(/signing identity/i);
    expect(calls.some(args => args.includes('install'))).toBe(false);
  });

  it('upgrades an older same-signer APK and verifies the replacement bytes', async () => {
    const oldApk = syntheticApk(Buffer.from('bundled-signer-certificate'), 0x31);
    let upgraded = false;
    const calls: string[][] = [];
    const installedPath = '/data/app/com.zhxmt.interceptor.android/base.apk';
    const androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory,
      temporaryDirectory,
      runAdb: async (args) => {
        calls.push([...args]);
        if (args.includes('install')) {
          upgraded = true;
          return 'Success\n';
        }
        if (upgraded) {
          return installedPackageCommand(args, {
            versionCode: 2,
            versionName: '0.2.0',
            sha256: bundledSha256,
          });
        }
        if (args.includes('list')) return 'package:com.zhxmt.interceptor.android versionCode:1\n';
        if (args.includes('dumpsys')) return 'versionName=0.1.0\n';
        if (args.includes('path')) return `package:${installedPath}\n`;
        if (args.includes('sha256sum')) return `${sha256(oldApk)}  ${installedPath}\n`;
        if (args.includes('pull')) {
          const destination = args.at(-1);
          if (!destination) throw new Error('Missing adb pull destination.');
          await writeFile(destination, oldApk);
          return '1 file pulled\n';
        }
        throw new Error(`Unexpected adb call: ${args.join(' ')}`);
      },
    });

    await expect(androidApplicationPackage.install('SERIAL')).resolves.toMatchObject({
      state: 'current',
      installedVersion: '0.2.0',
    });
    expect(calls.some(args => args.includes('install'))).toBe(true);
  });

  it('rejects a newer installed version without requesting a downgrade', async () => {
    const newerApk = syntheticApk(Buffer.from('bundled-signer-certificate'), 0x32);
    const calls: string[][] = [];
    const installedPath = '/data/app/com.zhxmt.interceptor.android/base.apk';
    const androidApplicationPackage = new AndroidApplicationPackage({
      runtimeDirectory,
      temporaryDirectory,
      runAdb: async (args) => {
        calls.push([...args]);
        if (args.includes('list')) return 'package:com.zhxmt.interceptor.android versionCode:3\n';
        if (args.includes('dumpsys')) return 'versionName=0.3.0\n';
        if (args.includes('path')) return `package:${installedPath}\n`;
        if (args.includes('sha256sum')) return `${sha256(newerApk)}  ${installedPath}\n`;
        if (args.includes('pull')) {
          const destination = args.at(-1);
          if (!destination) throw new Error('Missing adb pull destination.');
          await writeFile(destination, newerApk);
          return '1 file pulled\n';
        }
        throw new Error(`Unexpected adb call: ${args.join(' ')}`);
      },
    });

    await expect(androidApplicationPackage.install('SERIAL')).rejects.toThrow(/downgrade/i);
    expect(calls.some(args => args.includes('install'))).toBe(false);
  });
});

function installedPackageCommand(args: readonly string[], metadata: {
  readonly versionCode: number;
  readonly versionName: string;
  readonly sha256: string;
}): string {
  const installedPath = '/data/app/com.zhxmt.interceptor.android/base.apk';
  if (args.includes('list')) {
    return `package:com.zhxmt.interceptor.android versionCode:${metadata.versionCode}\n`;
  }
  if (args.includes('dumpsys')) return `versionName=${metadata.versionName}\n`;
  if (args.includes('path')) return `package:${installedPath}\n`;
  if (args.includes('sha256sum')) return `${metadata.sha256}  ${installedPath}\n`;
  throw new Error(`Unexpected adb call: ${args.join(' ')}`);
}

function syntheticApk(certificate: Buffer, prefixByte = 0x5a): Buffer {
  const lengthPrefixed = (value: Buffer): Buffer => {
    const result = Buffer.alloc(4 + value.length);
    result.writeUInt32LE(value.length, 0);
    value.copy(result, 4);
    return result;
  };
  const signedData = Buffer.concat([
    lengthPrefixed(Buffer.alloc(0)),
    lengthPrefixed(lengthPrefixed(certificate)),
    lengthPrefixed(Buffer.alloc(0)),
  ]);
  const signer = Buffer.concat([
    lengthPrefixed(signedData),
    lengthPrefixed(Buffer.alloc(0)),
    lengthPrefixed(Buffer.from([1])),
  ]);
  const value = lengthPrefixed(lengthPrefixed(signer));
  const pair = Buffer.alloc(8 + 4 + value.length);
  pair.writeBigUInt64LE(BigInt(4 + value.length), 0);
  pair.writeUInt32LE(0x7109871a, 8);
  value.copy(pair, 12);
  const blockSize = pair.length + 24;
  const signingBlock = Buffer.alloc(blockSize + 8);
  signingBlock.writeBigUInt64LE(BigInt(blockSize), 0);
  pair.copy(signingBlock, 8);
  signingBlock.writeBigUInt64LE(BigInt(blockSize), 8 + pair.length);
  Buffer.from('APK Sig Block 42').copy(signingBlock, 16 + pair.length);
  const prefix = Buffer.alloc(32, prefixByte);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt32LE(prefix.length + signingBlock.length, 16);
  return Buffer.concat([prefix, signingBlock, eocd]);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
