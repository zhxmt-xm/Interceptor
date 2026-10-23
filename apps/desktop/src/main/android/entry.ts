import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  X509Certificate,
} from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AndroidStatusResult } from '@interceptor/core-protocol';
import type {
  AndroidApplicationInfo,
  AndroidDesktopStatus,
  AndroidDeviceInfo,
  AndroidDeviceState,
} from '../../shared/desktop-api';
import type {
  AndroidDesktopIdentity,
  AndroidDeviceServiceOptions,
  AndroidOwnedMapping,
} from '../interfaces';

interface StoredIdentity {
  readonly version: 1;
  readonly key: string;
  readonly cert: string;
}

type AdbDeviceInfo = Omit<AndroidDeviceInfo, 'application'>;

/** Main对单台USB Android设备、PC身份、Core入口及本轮reverse的唯一owner。 */
export class AndroidDeviceService {
  private static readonly DEVICE_PORT = 39_080;
  private static readonly IDENTITY_FILE = 'identity.enc';
  private readonly now: () => Date;
  private identity: Promise<AndroidDesktopIdentity> | null = null;
  private mapping: AndroidOwnedMapping | null = null;
  private operation = Promise.resolve();

  constructor(private readonly options: AndroidDeviceServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** 返回ADB实际设备状态及公开PC指纹，不返回pin、证书或私钥。 */
  async status(): Promise<AndroidDesktopStatus> {
    const [identity, devices] = await Promise.all([this.loadIdentity(), this.listDevices()]);
    return {
      devices,
      computerFingerprint: identity.fingerprint,
      connectedSerial: this.mapping?.serial ?? null,
      deviceFingerprint: this.mapping?.deviceFingerprint ?? null,
      ingressListening: this.mapping?.coreStatus.listening ?? false,
      phoneConnected: this.mapping?.coreStatus.connected ?? false,
    };
  }

  /** 启动唯一Core入口后建立本轮`--no-rebind` reverse。 */
  connectDevice(serial: string, deviceFingerprint: string): Promise<AndroidDesktopStatus> {
    return this.queue(async () => {
      if (this.mapping) throw new Error('An Android device is already connected.');
      const devices = await this.listAdbDevices();
      const device = devices.find(candidate => candidate.serial === serial);
      if (!device) throw new Error('Android device is not attached.');
      if (device.state === 'unauthorized') throw new Error('Authorize USB debugging on the Android device.');
      if (device.state === 'offline') throw new Error('Android device is offline.');
      const application = await this.options.applicationPackage.status(serial);
      if (application.state !== 'current') {
        throw new Error('Install or update the verified Android app before connecting.');
      }
      const identity = await this.loadIdentity();
      const normalizedFingerprint = AndroidDeviceService.normalizeFingerprint(deviceFingerprint);
      const devicePin = AndroidDeviceService.pinFromFingerprint(normalizedFingerprint);
      const deviceId = `android:${createHash('sha256').update(Buffer.from(
        normalizedFingerprint.replaceAll(' ', ''),
        'hex',
      )).digest('hex')}`;
      const result = await this.options.requestCore({
        type: 'android.start',
        payload: {
          identity: { key: identity.key, cert: identity.cert },
          devicePin,
          device: { id: deviceId, name: `Android · ${device.model ?? device.serial}` },
        },
      });
      if (!result.payload.listening || result.payload.host !== '127.0.0.1' || result.payload.port === null) {
        await this.options.requestCore({ type: 'android.stop', payload: {} });
        throw new Error('Core did not start the Android inspection listener.');
      }
      try {
        await this.options.runAdb([
          '-s', serial, 'reverse', '--no-rebind',
          `tcp:${AndroidDeviceService.DEVICE_PORT}`, `tcp:${result.payload.port}`,
        ]);
      } catch (error) {
        try {
          await this.options.requestCore({ type: 'android.stop', payload: {} });
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Android reverse failed and Core cleanup also failed.');
        }
        throw error;
      }
      this.mapping = {
        serial,
        deviceFingerprint: normalizedFingerprint,
        devicePort: AndroidDeviceService.DEVICE_PORT,
        corePort: result.payload.port,
        coreStatus: result.payload,
      };
      return this.status();
    });
  }

  /** 先停止Core业务，再核对并只删除本service拥有的reverse。 */
  disconnectDevice(): Promise<AndroidDesktopStatus> {
    return this.queue(async () => {
      const mapping = this.mapping;
      if (!mapping) return this.status();
      const stopped = await this.options.requestCore({ type: 'android.stop', payload: {} });
      this.mapping = { ...mapping, coreStatus: stopped.payload };
      await this.removeOwnedReverse(mapping);
      this.mapping = null;
      return this.status();
    });
  }

  private async removeOwnedReverse(mapping: AndroidOwnedMapping): Promise<void> {
    const device = (await this.listAdbDevices()).find(candidate => candidate.serial === mapping.serial);
    if (!device || device.state !== 'ready') return;
    try {
      const reverseList = await this.options.runAdb(['-s', mapping.serial, 'reverse', '--list']);
      const expectedDevice = `tcp:${mapping.devicePort}`;
      const expectedCore = `tcp:${mapping.corePort}`;
      const ownsMapping = reverseList.split(/\r?\n/).some((line) => {
        const fields = line.trim().split(/\s+/);
        return fields.length === 3 && fields[1] === expectedDevice && fields[2] === expectedCore;
      });
      if (!ownsMapping) {
        throw new Error('Owned Android reverse mapping changed before cleanup.');
      }
      await this.options.runAdb([
        '-s', mapping.serial, 'reverse', '--remove', `tcp:${mapping.devicePort}`,
      ]);
    } catch (error) {
      let devices: AdbDeviceInfo[];
      try {
        devices = await this.listAdbDevices();
      } catch (refreshError) {
        throw new AggregateError(
          [error, refreshError],
          'Android reverse cleanup failed and the device state could not be refreshed.',
        );
      }
      const current = devices.find(candidate => candidate.serial === mapping.serial);
      if (!current || current.state !== 'ready') return;
      throw error;
    }
  }

  /** 安装或升级经过版本、签名与摘要校验的随包APK。 */
  installDeviceApplication(serial: string): Promise<AndroidDesktopStatus> {
    return this.queue(async () => {
      if (this.mapping) throw new Error('Disconnect the Android device before installing the app.');
      const device = (await this.listAdbDevices()).find(candidate => candidate.serial === serial);
      if (!device) throw new Error('Android device is not attached.');
      if (device.state !== 'ready') throw new Error('Authorize the Android device before installing the app.');
      await this.options.applicationPackage.install(serial);
      return this.status();
    });
  }

  /** 只对已授权的目标设备打开正式Launcher，不注入配对或VPN状态。 */
  openDeviceApplication(serial: string): Promise<void> {
    return this.queue(async () => {
      const device = (await this.listAdbDevices()).find(candidate => candidate.serial === serial);
      if (!device) throw new Error('Android device is not attached.');
      if (device.state !== 'ready') throw new Error('Authorize the Android device before opening the app.');
      const application = await this.options.applicationPackage.status(serial);
      if (application.state !== 'current') {
        throw new Error('Install or update the verified Android app before opening it.');
      }
      await this.options.runAdb([
        '-s', serial, 'shell', 'am', 'start', '-n',
        'com.zhxmt.interceptor.android/.ui.InterceptorActivity',
      ]);
    });
  }

  /** 应用退出与显式断开共用同一确定性清理。 */
  async stop(): Promise<void> {
    await this.disconnectDevice();
  }

  /** 合并Core实时listener/control状态；VPN状态仍由Android独立报告。 */
  async updateCoreStatus(coreStatus: AndroidStatusResult['payload']): Promise<AndroidDesktopStatus> {
    if (this.mapping) this.mapping = { ...this.mapping, coreStatus };
    return this.status();
  }

  private async listDevices(): Promise<AndroidDeviceInfo[]> {
    const devices = await this.listAdbDevices();
    return Promise.all(devices.map(async (device) => ({
      ...device,
      application: device.state === 'ready'
        ? await this.options.applicationPackage.status(device.serial)
        : AndroidDeviceService.unavailableApplication(device.state),
    })));
  }

  private async listAdbDevices(): Promise<AdbDeviceInfo[]> {
    const output = await this.options.runAdb(['devices', '-l']);
    const devices: AdbDeviceInfo[] = [];
    for (const rawLine of output.split(/\r?\n/).slice(1)) {
      const line = rawLine.trim();
      if (!line) continue;
      const fields = line.split(/\s+/);
      const [serial, rawState] = fields;
      if (!serial || !rawState) throw new Error('ADB returned an invalid device row.');
      const state = AndroidDeviceService.deviceState(rawState);
      const modelField = fields.slice(2).find(field => field.startsWith('model:'));
      devices.push({
        serial,
        state,
        model: state === 'ready' && modelField
          ? modelField.slice('model:'.length).replaceAll('_', ' ')
          : null,
      });
    }
    return devices;
  }

  private static unavailableApplication(state: Exclude<AndroidDeviceState, 'ready'>): AndroidApplicationInfo {
    return {
      state: 'unavailable',
      bundledVersion: null,
      installedVersion: null,
      detail: state === 'unauthorized'
        ? 'USB debugging authorization is required before checking the Android app.'
        : 'The Android device is offline.',
    };
  }

  private loadIdentity(): Promise<AndroidDesktopIdentity> {
    this.identity ??= this.readOrCreateIdentity();
    return this.identity;
  }

  private async readOrCreateIdentity(): Promise<AndroidDesktopIdentity> {
    if (!this.options.secureStore.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable for the Android desktop identity.');
    }
    const identityPath = path.join(this.options.dataDirectory, AndroidDeviceService.IDENTITY_FILE);
    let stored: StoredIdentity;
    try {
      const encrypted = await readFile(identityPath);
      stored = AndroidDeviceService.parseStoredIdentity(this.options.secureStore.decryptString(encrypted));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      stored = await this.generateIdentity();
      await mkdir(this.options.dataDirectory, { recursive: true, mode: 0o700 });
      const temporary = path.join(this.options.dataDirectory, `.${AndroidDeviceService.IDENTITY_FILE}.${randomBytes(8).toString('hex')}.tmp`);
      try {
        await writeFile(temporary, this.options.secureStore.encryptString(JSON.stringify(stored)), { mode: 0o600 });
        await rename(temporary, identityPath);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return AndroidDeviceService.validateIdentity(stored);
  }

  private async generateIdentity(): Promise<StoredIdentity> {
    await import('reflect-metadata');
    const x509 = await import('@peculiar/x509');
    x509.cryptoProvider.set(globalThis.crypto);
    const algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
    const keys = await globalThis.crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    if (!('privateKey' in keys)) throw new Error('Android desktop identity generation returned no key pair.');
    const now = this.now();
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: randomBytes(16).toString('hex'),
      name: 'CN=Interceptor Desktop Android',
      notBefore: new Date(now.getTime() - 5 * 60 * 1000),
      notAfter: new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000),
      keys,
      signingAlgorithm: algorithm,
      extensions: [await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)],
    });
    const key = await globalThis.crypto.subtle.exportKey('pkcs8', keys.privateKey);
    return {
      version: 1,
      key: AndroidDeviceService.pem(Buffer.from(key), 'PRIVATE KEY'),
      cert: certificate.toString('pem'),
    };
  }

  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operation.then(operation, operation);
    this.operation = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private static deviceState(value: string): AndroidDeviceState {
    if (value === 'device') return 'ready';
    if (value === 'unauthorized' || value === 'offline') return value;
    throw new Error(`Unsupported ADB device state: ${value}`);
  }

  private static normalizeFingerprint(value: string): string {
    const hexadecimal = value.replaceAll(/\s/g, '').toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hexadecimal)) throw new Error('Android device fingerprint is invalid.');
    return hexadecimal.match(/.{1,4}/g)!.join(' ');
  }

  private static pinFromFingerprint(value: string): string {
    return `sha256/${Buffer.from(value.replaceAll(' ', ''), 'hex').toString('base64')}`;
  }

  private static parseStoredIdentity(value: string): StoredIdentity {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'cert,key,version') {
      throw new Error('Android desktop identity fields are invalid.');
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || typeof record.key !== 'string' || typeof record.cert !== 'string') {
      throw new Error('Android desktop identity is invalid.');
    }
    return { version: 1, key: record.key, cert: record.cert };
  }

  private static validateIdentity(stored: StoredIdentity): AndroidDesktopIdentity {
    const certificate = new X509Certificate(stored.cert);
    const privateKey = createPrivateKey(stored.key);
    const certificateSpki = certificate.publicKey.export({ type: 'spki', format: 'der' });
    const keySpki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    if (!certificateSpki.equals(keySpki) || !certificate.verify(certificate.publicKey)) {
      throw new Error('Android desktop identity key and certificate do not match.');
    }
    const now = Date.now();
    if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
      throw new Error('Android desktop identity certificate is not currently valid.');
    }
    const fingerprint = createHash('sha256').update(certificateSpki).digest('hex').toUpperCase()
      .match(/.{1,4}/g)!.join(' ');
    return { ...stored, fingerprint };
  }

  private static pem(value: Buffer, label: string): string {
    const content = value.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
    return `-----BEGIN ${label}-----\n${content}\n-----END ${label}-----\n`;
  }
}
