import { createHash, createPrivateKey, randomBytes, webcrypto, X509Certificate } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PlatformOperationInProgressError } from '@interceptor/tools';

import type { CertificateInfo } from '../../../shared/desktop-api';
import type { CoreRuntime } from '../../core/core-runtime';
import type { MainDiagnostics } from '../../diagnostics/main-diagnostics';
import type { HelperService } from '../helper/entry';
import { readErrorMessage, readErrorName } from '../../utils';
import type { CaMaterial, CaMeta, CertificateServiceOptions, CertificateStatus, X509Module } from './interfaces';
import type { SecureStore } from '../interfaces';
import { commandRunner } from '../internal/command-runners';
import { CertificateError } from './internal/errors';
import { TrustStoreService } from './internal/trust-store-service';
import { MacosHelperServiceClient } from '../helper/macos/helper-client';
import { MacosHelperServiceError } from '../helper/macos/internal/errors';
import type { CertificateOperation, CertificateOperationStatus } from './interfaces';

/**
 * Root CA 生命周期所有者（平台能力模块内，运行于 Main）。
 *
 * 生成兼容性优先的 RSA/SHA-256 Root CA，私钥经 OS 安全存储加密后落盘，
 * 明文证书与公开元数据（fingerprint/subject/有效期）单独保存。CA 材料只在
 * Main 内解密，供下发 Core 做 HTTPS MITM；Leaf 证书由 Core 的 Mockttp 用该 CA
 * 动态签发。材料与系统信任通过同一个入口管理，平台TrustStore只供模块内部使用。
 */
export class CertificateService {
  /** RSA/SHA-256 签名算法参数（兼容性优先）。 */
  private static readonly SIGNING_ALGORITHM = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  } as const;
  /** Root CA 主题。 */
  private static readonly CA_SUBJECT = 'CN=Interceptor CA, O=Interceptor';
  /** Root CA 有效期（天）。 */
  private static readonly CA_VALIDITY_DAYS = 3 * 365;
  /** 证书 PEM 文件名。 */
  private static readonly CERT_FILE = 'root-cert.pem';
  /** 加密私钥文件名。 */
  private static readonly KEY_FILE = 'root-key.enc';
  /** 公开元数据文件名。 */
  private static readonly META_FILE = 'ca-meta.json';
  /** 懒加载的 @peculiar/x509 单例；仅在生成 CA 时加载以避免顶层副作用。 */
  private static x509Promise: Promise<X509Module> | null = null;

  private readonly dataDir: string;
  private readonly secureStore: SecureStore;
  private readonly now: () => Date;
  private readonly platform: NodeJS.Platform;
  private readonly trustStoreService: TrustStoreService;
  private readonly macosHelperServiceClient: MacosHelperServiceClient | null;
  private activeOperation: CertificateOperationStatus | null = null;
  private operationCompleted: Promise<void> | null = null;
  private mitmEnabled = false;
  private readonly coreRuntime: CoreRuntime;
  private readonly diagnostics: MainDiagnostics;
  private readonly helperService: HelperService;
  private readonly onChanged: (() => void) | undefined;

  constructor(options: CertificateServiceOptions) {
    this.dataDir = options.dataDir;
    this.secureStore = options.secureStore;
    this.now = options.now ?? (() => new Date());
    this.coreRuntime = options.coreRuntime;
    this.diagnostics = options.diagnostics;
    this.helperService = options.helperService;
    this.onChanged = options.onChanged;
    this.platform = options.platform ?? process.platform;
    this.macosHelperServiceClient = this.platform === 'darwin'
      ? options.macosHelperServiceClient ?? new MacosHelperServiceClient() : null;
    this.trustStoreService = new TrustStoreService({
      ...options, macosHelperServiceClient: this.macosHelperServiceClient ?? undefined,
    });
  }

  supported(): boolean {
    return this.trustStoreService.supported();
  }

  getActiveOperation(): CertificateOperationStatus | null {
    return this.activeOperation ? { ...this.activeOperation } : null;
  }

  private async runOperation<Result>(operation: CertificateOperation, perform: () => Promise<Result>, notify = false): Promise<Result> {
    if (this.activeOperation) throw new PlatformOperationInProgressError(this.activeOperation.operation);
    this.helperService.assertNotPreparing();
    this.activeOperation = { operation, state: 'running' };
    let complete!: () => void;
    this.operationCompleted = new Promise<void>((resolve) => { complete = resolve; });
    let operationFinished = false;
    try {
      const result = await perform();
      operationFinished = true;
      if (notify) await this.finishCertificateChange();
      return result;
    } catch (error) {
      if (!operationFinished && (notify || operation === 'certificate.prepare') && CertificateService.hasUncertainOutcome(error)) {
        this.activeOperation = { operation, state: 'uncertain' };
      } else if (notify && !operationFinished && !(error instanceof PlatformOperationInProgressError)) {
        try {
          await this.finishCertificateChange();
        } catch (synchronizationError) {
          throw new AggregateError([error, synchronizationError], 'Certificate operation failed and Core certificate synchronization also failed.');
        }
      }
      throw error;
    } finally {
      if (this.activeOperation.state === 'running') this.activeOperation = null;
      this.operationCompleted = null;
      complete();
    }
  }

  private async finishCertificateChange(): Promise<void> {
    try {
      await this.syncCoreCertificate();
    } finally {
      this.onChanged?.();
    }
  }

  private static hasUncertainOutcome(error: unknown): boolean {
    if (error instanceof AggregateError) return error.errors.some((cause) => CertificateService.hasUncertainOutcome(cause));
    return error instanceof MacosHelperServiceError && error.hasUnconfirmedMutation();
  }

  async prepare(): Promise<void> {
    await this.runOperation('certificate.prepare', () => this.helperService.runAuthorization('certificate.prepare', async () => {
      await this.ensure();
      const thumbprints = await this.getThumbprints();
      if (!thumbprints) throw new CertificateError('Root CA material is unavailable.');
      if (!await this.trustStoreService.isTrusted(thumbprints.sha1)) {
        await this.trustStoreService.install(this.getCertificatePath());
        if (!await this.trustStoreService.isTrusted(thumbprints.sha1)) {
          throw new CertificateError('Shared Root CA is not trusted after installation.');
        }
      }
    }));
  }

  async install(): Promise<void> {
    await this.runOperation('certificate.install', async () => {
      if (!(await this.getStatus()).present) throw new CertificateError('Root CA has not been generated yet.');
      await this.helperService.runAuthorization('certificate.install', () => this.trustStoreService.install(this.getCertificatePath()));
    }, true);
  }

  async uninstall(): Promise<void> {
    await this.runOperation('certificate.uninstall', async () => {
      const thumbprints = await this.getThumbprints();
      if (thumbprints) await this.helperService.runAuthorization('certificate.uninstall', () => this.trustStoreService.uninstall(thumbprints.sha1));
    }, true);
  }

  async isTrusted(): Promise<boolean> {
    const thumbprints = await this.getThumbprints();
    return thumbprints ? this.trustStoreService.isTrusted(thumbprints.sha1) : false;
  }

  async getInfo(): Promise<CertificateInfo> {
    const status = await this.getStatus();
    return {
      ...status,
      trusted: status.present ? await this.isTrusted() : false,
      supported: this.supported(),
      mitmEnabled: this.mitmEnabled,
      path: status.present ? this.getCertificatePath() : null,
    };
  }

  async view(openPath: (filePath: string) => Promise<string>): Promise<void> {
    return this.runOperation('certificate.view', () => this.openCertificateView(openPath));
  }

  private async openCertificateView(openPath: (filePath: string) => Promise<string>): Promise<void> {
    if (!(await this.getStatus()).present) throw new CertificateError('Root CA has not been generated yet.');
    const certificatePath = this.getCertificatePath();
    const certificate = new X509Certificate(await fs.readFile(certificatePath, 'utf8'));
    if (this.platform === 'darwin') {
      await this.macosHelperServiceClient!.viewCertificate({
        certificate: certificate.raw.toString('base64'), sha256: certificate.fingerprint256.replaceAll(':', ''),
      });
      return;
    }
    const cerPath = certificatePath.replace(/\.pem$/i, '.cer');
    await fs.writeFile(cerPath, certificate.raw);
    const error = await openPath(cerPath);
    if (error && await openPath(certificatePath)) throw new CertificateError('Unable to open the system certificate viewer.');
  }

  async reveal(showItemInFolder: (filePath: string) => void): Promise<void> {
    await this.runOperation('certificate.reveal', async () => {
      if (!(await this.getStatus()).present) throw new CertificateError('Root CA has not been generated yet.');
      showItemInFolder(this.getCertificatePath());
    });
  }

  async openManager(): Promise<void> {
    const command = this.platform === 'win32' ? 'cmd.exe' : 'open';
    const args = this.platform === 'win32' ? ['/c', 'start', '', 'certmgr.msc'] : ['-a', 'Keychain Access'];
    const result = await commandRunner.run(command, args);
    if (result.code !== 0) throw new CertificateError(result.stderr || 'Unable to open the system certificate manager.');
  }

  async synchronizeCore(): Promise<void> {
    await this.operationCompleted;
    await this.runOperation('certificate.sync', async () => {
      const result = await this.coreRuntime.request({ type: 'tls.getDecryptionPreference', payload: {} });
      this.mitmEnabled = result.payload.enabled;
      await this.syncCoreCertificate();
    });
  }

  private async syncCoreCertificate(): Promise<void> {
    try {
      const trusted = await this.isTrusted();
      await this.coreRuntime.request({
        type: 'tls.useCertificate', payload: { ca: trusted ? await this.getMaterial() : null },
      });
      await this.syncCoreDecryption();
    } catch (error) {
      this.diagnostics.warn('main.tls.certificate-sync-failed', {
        errorCode: readErrorName(error), outcome: 'failed', attributes: { message: readErrorMessage(error) },
      });
      throw error;
    }
  }

  private async syncCoreDecryption(): Promise<boolean> {
    const decrypting = (await this.isTrusted()) && this.mitmEnabled;
    const result = await this.coreRuntime.request(decrypting
      ? { type: 'tls.startDecryption', payload: {} } : { type: 'tls.stopDecryption', payload: {} });
    return result.payload.decrypting;
  }

  async enableHttpsDecryption(): Promise<CertificateInfo & { decrypting: boolean }> {
    return this.runOperation('https-decryption.enable', async () => {
      this.mitmEnabled = true;
      await this.coreRuntime.request({ type: 'tls.saveDecryptionPreference', payload: { enabled: true } });
      const decrypting = await this.syncCoreDecryption();
      const certificateInfo = await this.getInfo();
      this.onChanged?.();
      return { ...certificateInfo, decrypting };
    });
  }

  async disableHttpsDecryption(): Promise<CertificateInfo & { decrypting: boolean }> {
    return this.runOperation('https-decryption.disable', async () => {
      this.mitmEnabled = false;
      await this.coreRuntime.request({ type: 'tls.saveDecryptionPreference', payload: { enabled: false } });
      const decrypting = await this.syncCoreDecryption();
      const certificateInfo = await this.getInfo();
      this.onChanged?.();
      return { ...certificateInfo, decrypting };
    });
  }

  /** 返回 CA 公开状态（不含私钥）。调用方：ca.status 命令与 Settings。 */
  async getStatus(): Promise<CertificateStatus> {
    const meta = await this.readMeta();
    if (!meta || !(await this.hasKeyAndCert())) {
      return {
        present: false,
        fingerprint: null,
        subject: null,
        createdAt: null,
        expiresAt: null,
      };
    }
    return {
      present: true,
      fingerprint: meta.fingerprint,
      subject: meta.subject,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
    };
  }

  /** 确保 CA 存在；缺失时生成并加密存储。返回状态（不含私钥）。 */
  async ensure(): Promise<CertificateStatus> {
    const presentFiles = await Promise.all([this.certPath, this.keyPath, this.metaPath]
      .map((filePath) => CertificateService.exists(filePath)));
    if (presentFiles.every((present) => !present)) {
      await this.generate();
    } else if (presentFiles.some((present) => !present) || !await this.readMeta()) {
      throw new CertificateError('Shared Root CA material is incomplete or invalid; existing files were preserved.');
    }
    await this.validateMaterial();
    return this.getStatus();
  }

  private async validateMaterial(): Promise<void> {
    try {
      const meta = await this.readMeta();
      const material = await this.getMaterial();
      if (!meta || !material || !this.secureStore.isEncryptionAvailable()) throw new CertificateError('Root CA material is unavailable.');
      const certificate = new X509Certificate(material.cert);
      const validFrom = Date.parse(certificate.validFrom);
      const validTo = Date.parse(certificate.validTo);
      const currentTime = this.now().getTime();
      if (!certificate.ca || !certificate.checkIssued(certificate) || !certificate.verify(certificate.publicKey)
        || !certificate.checkPrivateKey(createPrivateKey(material.key))
        || meta.fingerprint !== certificate.fingerprint256 || meta.sha1 !== certificate.fingerprint.replaceAll(':', '')
        || meta.subject !== CertificateService.CA_SUBJECT
        || typeof meta.createdAt !== 'string' || typeof meta.expiresAt !== 'string'
        || Math.floor(Date.parse(meta.createdAt) / 1000) !== validFrom / 1000
        || Math.floor(Date.parse(meta.expiresAt) / 1000) !== validTo / 1000
        || currentTime < validFrom || currentTime >= validTo) {
        throw new CertificateError('Root CA material failed validation.');
      }
    } catch {
      throw new CertificateError('Shared Root CA material is invalid, expired or unavailable; existing files were preserved.');
    }
  }

  /** 强制重新生成并覆盖现有 CA。调用方：用户在设置里“重新生成 CA”。 */
  async regenerate(): Promise<CertificateStatus> {
    return this.runOperation('certificate.generate', async () => {
      if (await this.isTrusted()) throw new CertificateError('Uninstall the trusted Root CA before generating a replacement.');
      await this.generate();
      return this.getStatus();
    }, true);
  }

  /** 删除本地 CA 材料（证书/私钥/元数据），回到“未生成”状态。调用方：ca.delete。 */
  async delete(): Promise<void> {
    await this.runOperation('certificate.delete', async () => {
      const thumbprints = await this.getThumbprints();
      const trusted = thumbprints !== null && await this.trustStoreService.isTrusted(thumbprints.sha1);
      if (trusted && thumbprints) await this.helperService.runAuthorization('certificate.delete', () => this.trustStoreService.uninstall(thumbprints.sha1));
      await Promise.all([
        fs.rm(this.certPath, { force: true }),
        fs.rm(this.keyPath, { force: true }),
        fs.rm(this.metaPath, { force: true }),
      ]);
    }, true);
  }

  /**
   * 解密并返回 CA 材料，供下发 Core 做 MITM；私钥只在 Main 内存。
   * 无 CA 时返回 null。调用方：Main 在启动/配置 Core MITM 时。
   */
  async getMaterial(): Promise<CaMaterial | null> {
    if (!(await this.hasKeyAndCert())) {
      return null;
    }
    const cert = await fs.readFile(this.certPath, 'utf8');
    const encryptedKey = await fs.readFile(this.keyPath);
    const key = this.secureStore.decryptString(encryptedKey);
    return { key, cert };
  }

  /** 证书 PEM 文件路径，供信任库安装命令使用。 */
  getCertificatePath(): string {
    return this.certPath;
  }

  /** 返回 CA 的 SHA-256（展示）与 SHA-1（信任库定位）指纹，无 CA 时 null。 */
  async getThumbprints(): Promise<{ sha256: string; sha1: string } | null> {
    const meta = await this.readMeta();
    return meta ? { sha256: meta.fingerprint, sha1: meta.sha1 } : null;
  }

  private async generate(): Promise<void> {
    if (!this.secureStore.isEncryptionAvailable()) {
      throw new CertificateError(
        'OS secure storage is unavailable; refusing to store the CA private key in plaintext.',
      );
    }

    const x509 = await CertificateService.loadX509();
    const keys = (await webcrypto.subtle.generateKey(
      CertificateService.SIGNING_ALGORITHM,
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;

    const notBefore = new Date(this.now().getTime() - 5 * 60 * 1000);
    const notAfter = new Date(
      this.now().getTime() +
        CertificateService.CA_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    );

    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: CertificateService.randomSerial(),
      name: CertificateService.CA_SUBJECT,
      notBefore,
      notAfter,
      keys,
      signingAlgorithm: CertificateService.SIGNING_ALGORITHM,
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
          true,
        ),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      ],
    });

    const certPem = certificate.toString('pem');
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const keyPem = CertificateService.toPem(Buffer.from(pkcs8), 'PRIVATE KEY');
    const fingerprint = CertificateService.formatFingerprint(
      createHash('sha256').update(Buffer.from(certificate.rawData)).digest(),
    );
    const sha1 = createHash('sha1')
      .update(Buffer.from(certificate.rawData))
      .digest('hex')
      .toUpperCase();
    const meta: CaMeta = {
      fingerprint,
      sha1,
      subject: CertificateService.CA_SUBJECT,
      createdAt: notBefore.toISOString(),
      expiresAt: notAfter.toISOString(),
    };

    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.certPath, certPem, { encoding: 'utf8', mode: 0o600 });
    await fs.writeFile(this.keyPath, this.secureStore.encryptString(keyPem), { mode: 0o600 });
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  private get certPath(): string {
    return path.join(this.dataDir, CertificateService.CERT_FILE);
  }

  private get keyPath(): string {
    return path.join(this.dataDir, CertificateService.KEY_FILE);
  }

  private get metaPath(): string {
    return path.join(this.dataDir, CertificateService.META_FILE);
  }

  private async hasKeyAndCert(): Promise<boolean> {
    return (
      (await CertificateService.exists(this.certPath)) &&
      (await CertificateService.exists(this.keyPath))
    );
  }

  private async readMeta(): Promise<CaMeta | null> {
    try {
      return JSON.parse(await fs.readFile(this.metaPath, 'utf8')) as CaMeta;
    } catch {
      return null;
    }
  }

  /**
   * 懒加载 @peculiar/x509（其 tsyringe/reflect-metadata 有全局副作用），
   * 只在生成 CA 时加载，避免顶层副作用阻塞 Main/Chromium/CDP 启动。
   */
  private static async loadX509(): Promise<X509Module> {
    if (!CertificateService.x509Promise) {
      CertificateService.x509Promise = (async () => {
        await import('reflect-metadata');
        const module = await import('@peculiar/x509');
        module.cryptoProvider.set(webcrypto as unknown as Crypto);
        return module;
      })();
    }
    return CertificateService.x509Promise;
  }

  /** 16 字节随机 serial（首位清高位保证正数），hex 字符串。 */
  private static randomSerial(): string {
    const bytes = randomBytes(16);
    bytes.writeUInt8(bytes.readUInt8(0) & 0x7f, 0);
    return bytes.toString('hex');
  }

  /** DER 缓冲编码为 PEM 文本块。 */
  private static toPem(der: Buffer, label: string): string {
    const lines = der.toString('base64').match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
  }

  /** SHA-256 fingerprint 格式化为大写冒号分隔 hex。 */
  private static formatFingerprint(digest: Buffer): string {
    return (digest.toString('hex').toUpperCase().match(/.{2}/g) ?? []).join(':');
  }

  /** 文件是否存在（access 检测）。 */
  private static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}