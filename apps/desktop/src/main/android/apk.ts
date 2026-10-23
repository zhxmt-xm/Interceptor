import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import type { AndroidApplicationInfo } from '../../shared/desktop-api';

interface AndroidRuntimeManifest {
  readonly schemaVersion: 1;
  readonly applicationId: 'com.zhxmt.interceptor.android';
  readonly versionCode: number;
  readonly versionName: string;
  readonly apkFile: 'Interceptor-Android.apk';
  readonly apkSha256: string;
  readonly signerSha256: string;
}

interface VerifiedAndroidRuntime {
  readonly manifest: AndroidRuntimeManifest;
  readonly apkPath: string;
}

export interface AndroidApplicationPackageOptions {
  readonly runtimeDirectory: string;
  readonly temporaryDirectory: string;
  readonly runAdb: (args: readonly string[]) => Promise<string>;
}

/** Main-owned bundled APK verification, installed-version inspection and transactional upgrade. */
export class AndroidApplicationPackage {
  private runtime: Promise<VerifiedAndroidRuntime> | null = null;

  constructor(private readonly options: AndroidApplicationPackageOptions) {}

  /** Inspect one ready device without changing its installed package. */
  async status(serial: string): Promise<AndroidApplicationInfo> {
    let runtime: VerifiedAndroidRuntime;
    try {
      runtime = await this.loadRuntime();
    } catch (error) {
      if (AndroidApplicationPackage.isMissingFile(error)) {
        return {
          state: 'unavailable',
          bundledVersion: null,
          installedVersion: null,
          detail: 'The bundled Android runtime is unavailable.',
        };
      }
      throw error;
    }
    return this.inspectInstalled(serial, runtime);
  }

  /** Install or upgrade only after the bundled bytes and installed signing identity are verified. */
  async install(serial: string): Promise<AndroidApplicationInfo> {
    const runtime = await this.loadRuntime();
    const current = await this.inspectInstalled(serial, runtime);
    switch (current.state) {
      case 'current':
        return current;
      case 'missing':
      case 'update-available':
      case 'reinstall-required':
        break;
      case 'signature-mismatch':
        throw new Error('The installed Android app has a different signing identity.');
      case 'newer-installed':
        throw new Error('A newer Android app version is already installed; downgrade is not allowed.');
      case 'unavailable':
        throw new Error(current.detail ?? 'The Android app package state is unavailable.');
    }
    await this.options.runAdb(['-s', serial, 'install', '-r', runtime.apkPath]);
    const installed = await this.inspectInstalled(serial, runtime);
    if (installed.state !== 'current') {
      throw new Error(`Android reported ${installed.state} after APK installation.`);
    }
    return installed;
  }

  private loadRuntime(): Promise<VerifiedAndroidRuntime> {
    this.runtime ??= this.readAndVerifyRuntime().catch((error: unknown) => {
      this.runtime = null;
      throw error;
    });
    return this.runtime;
  }

  private async readAndVerifyRuntime(): Promise<VerifiedAndroidRuntime> {
    const manifestPath = path.join(this.options.runtimeDirectory, 'manifest.json');
    const manifest = AndroidApplicationPackage.parseManifest(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    );
    const apkPath = path.join(this.options.runtimeDirectory, manifest.apkFile);
    const bytes = await readFile(apkPath);
    const apkSha256 = AndroidApplicationPackage.sha256(bytes);
    if (apkSha256 !== manifest.apkSha256) {
      throw new Error('Bundled Android APK checksum does not match its release manifest.');
    }
    const signerSha256 = AndroidApplicationPackage.apkSignerSha256(bytes);
    if (signerSha256 !== manifest.signerSha256) {
      throw new Error('Bundled Android APK signing identity does not match its release manifest.');
    }
    return { manifest, apkPath };
  }

  private async inspectInstalled(
    serial: string,
    runtime: VerifiedAndroidRuntime,
  ): Promise<AndroidApplicationInfo> {
    const { manifest } = runtime;
    const packages = await this.options.runAdb([
      '-s', serial, 'shell', 'pm', 'list', 'packages', '--show-versioncode', manifest.applicationId,
    ]);
    const packageLine = packages.split(/\r?\n/).find(line =>
      line.startsWith(`package:${manifest.applicationId} `));
    if (!packageLine) {
      return {
        state: 'missing',
        bundledVersion: manifest.versionName,
        installedVersion: null,
        detail: null,
      };
    }
    const versionCodeMatch = / versionCode:(\d+)$/.exec(packageLine.trim());
    if (!versionCodeMatch) throw new Error('Android returned an invalid installed version code.');
    const versionCode = Number(versionCodeMatch[1]);
    const details = await this.options.runAdb([
      '-s', serial, 'shell', 'dumpsys', 'package', manifest.applicationId,
    ]);
    const versionNameMatch = /^\s*versionName=(.+)$/m.exec(details);
    const installedVersion = versionNameMatch?.[1]?.trim();
    if (!installedVersion) throw new Error('Android returned no installed version name.');
    const packagePaths = await this.options.runAdb([
      '-s', serial, 'shell', 'pm', 'path', manifest.applicationId,
    ]);
    const installedPath = packagePaths.split(/\r?\n/)
      .find(line => line.startsWith('package:'))
      ?.slice('package:'.length)
      .trim();
    if (!installedPath) throw new Error('Android returned no installed base APK path.');
    const checksums = await this.options.runAdb([
      '-s', serial, 'shell', 'sha256sum', installedPath,
    ]);
    const installedSha256 = /^([0-9a-f]{64})\s/.exec(checksums.trim())?.[1];
    if (!installedSha256) throw new Error('Android returned an invalid installed APK checksum.');
    if (installedSha256 === manifest.apkSha256) {
      if (versionCode !== manifest.versionCode || installedVersion !== manifest.versionName) {
        throw new Error('Installed Android metadata does not match the verified APK bytes.');
      }
      return {
        state: 'current',
        bundledVersion: manifest.versionName,
        installedVersion,
        detail: null,
      };
    }
    const installedSigner = await this.readInstalledSigner(serial, installedPath);
    if (installedSigner !== manifest.signerSha256) {
      return {
        state: 'signature-mismatch',
        bundledVersion: manifest.versionName,
        installedVersion,
        detail: 'The installed app was signed by another identity.',
      };
    }
    if (versionCode > manifest.versionCode) {
      return {
        state: 'newer-installed',
        bundledVersion: manifest.versionName,
        installedVersion,
        detail: 'The installed app is newer than the bundled version.',
      };
    }
    return {
      state: versionCode < manifest.versionCode ? 'update-available' : 'reinstall-required',
      bundledVersion: manifest.versionName,
      installedVersion,
      detail: null,
    };
  }

  private async readInstalledSigner(serial: string, installedPath: string): Promise<string> {
    await mkdir(this.options.temporaryDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(
      this.options.temporaryDirectory,
      `${createHash('sha256').update(serial).digest('hex')}.${randomUUID()}.apk`,
    );
    try {
      await this.options.runAdb(['-s', serial, 'pull', installedPath, temporaryPath]);
      return AndroidApplicationPackage.apkSignerSha256(await readFile(temporaryPath));
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private static parseManifest(value: unknown): AndroidRuntimeManifest {
    if (!value || typeof value !== 'object') throw new Error('Invalid Android runtime manifest.');
    const record = value as Record<string, unknown>;
    const {
      schemaVersion,
      applicationId,
      versionCode,
      versionName,
      apkFile,
      apkSha256,
      signerSha256,
    } = record;
    if (
      schemaVersion !== 1 ||
      applicationId !== 'com.zhxmt.interceptor.android' ||
      typeof versionCode !== 'number' ||
      !Number.isSafeInteger(versionCode) ||
      versionCode < 1 ||
      typeof versionName !== 'string' ||
      versionName.length === 0 ||
      apkFile !== 'Interceptor-Android.apk' ||
      !AndroidApplicationPackage.isSha256(apkSha256) ||
      !AndroidApplicationPackage.isSha256(signerSha256)
    ) {
      throw new Error('Invalid Android runtime manifest.');
    }
    return {
      schemaVersion,
      applicationId,
      versionCode,
      versionName,
      apkFile,
      apkSha256,
      signerSha256,
    };
  }

  private static apkSignerSha256(apk: Buffer): string {
    const eocd = AndroidApplicationPackage.findEocd(apk);
    const centralDirectoryOffset = apk.readUInt32LE(eocd + 16);
    if (centralDirectoryOffset < 32 || centralDirectoryOffset > apk.length) {
      throw new Error('APK central directory offset is invalid.');
    }
    const magicOffset = centralDirectoryOffset - 16;
    if (apk.subarray(magicOffset, centralDirectoryOffset).toString('ascii') !== 'APK Sig Block 42') {
      throw new Error('APK has no supported signing block.');
    }
    const size = AndroidApplicationPackage.safeSize(apk.readBigUInt64LE(centralDirectoryOffset - 24));
    const blockOffset = centralDirectoryOffset - size - 8;
    if (blockOffset < 0 || apk.readBigUInt64LE(blockOffset) !== BigInt(size)) {
      throw new Error('APK signing block size is invalid.');
    }
    let offset = blockOffset + 8;
    const pairsEnd = centralDirectoryOffset - 24;
    const schemes = new Map<number, Buffer>();
    while (offset < pairsEnd) {
      if (offset + 12 > pairsEnd) throw new Error('APK signing pair is truncated.');
      const pairSize = AndroidApplicationPackage.safeSize(apk.readBigUInt64LE(offset));
      const pairEnd = offset + 8 + pairSize;
      if (pairSize < 4 || pairEnd > pairsEnd) throw new Error('APK signing pair size is invalid.');
      schemes.set(apk.readUInt32LE(offset + 8), apk.subarray(offset + 12, pairEnd));
      offset = pairEnd;
    }
    const scheme = schemes.get(0x1b93ad61) ?? schemes.get(0xf05368c0) ?? schemes.get(0x7109871a);
    if (!scheme) throw new Error('APK has no v2 or v3 signing identity.');
    const signers = AndroidApplicationPackage.lengthPrefixed(scheme, 0, scheme.length);
    let signerOffset = 0;
    const certificates: Buffer[] = [];
    while (signerOffset < signers.value.length) {
      const signer = AndroidApplicationPackage.lengthPrefixed(
        signers.value,
        signerOffset,
        signers.value.length,
      );
      signerOffset = signer.next;
      const signedData = AndroidApplicationPackage.lengthPrefixed(signer.value, 0, signer.value.length);
      const digests = AndroidApplicationPackage.lengthPrefixed(
        signedData.value,
        0,
        signedData.value.length,
      );
      const certificateSequence = AndroidApplicationPackage.lengthPrefixed(
        signedData.value,
        digests.next,
        signedData.value.length,
      );
      const certificate = AndroidApplicationPackage.lengthPrefixed(
        certificateSequence.value,
        0,
        certificateSequence.value.length,
      );
      certificates.push(certificate.value);
    }
    if (certificates.length !== 1) throw new Error('APK must contain exactly one signing identity.');
    const certificate = certificates[0];
    if (!certificate) throw new Error('APK signing identity is missing.');
    return AndroidApplicationPackage.sha256(certificate);
  }

  private static findEocd(apk: Buffer): number {
    const minimum = Math.max(0, apk.length - 65_557);
    for (let offset = apk.length - 22; offset >= minimum; offset -= 1) {
      if (
        apk.readUInt32LE(offset) === 0x06054b50 &&
        offset + 22 + apk.readUInt16LE(offset + 20) === apk.length
      ) {
        return offset;
      }
    }
    throw new Error('APK end of central directory is missing.');
  }

  private static lengthPrefixed(
    bytes: Buffer,
    offset: number,
    end: number,
  ): { readonly value: Buffer; readonly next: number } {
    if (offset + 4 > end) throw new Error('APK signing sequence is truncated.');
    const length = bytes.readUInt32LE(offset);
    const valueOffset = offset + 4;
    const next = valueOffset + length;
    if (next > end) throw new Error('APK signing sequence length is invalid.');
    return { value: bytes.subarray(valueOffset, next), next };
  }

  private static safeSize(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('APK signing block is too large.');
    return Number(value);
  }

  private static sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private static isSha256(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  private static isMissingFile(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }
}
