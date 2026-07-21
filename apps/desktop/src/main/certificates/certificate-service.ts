import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  CaMaterial,
  CaMeta,
  CertificateServiceOptions,
  CertificateStatus,
  SecureStore,
  X509Module,
} from '../interfaces';
import { CertificateError } from './certificate-error';

/**
 * Root CA 生命周期所有者（仅 Main）。
 *
 * 生成兼容性优先的 RSA/SHA-256 Root CA，私钥经 OS 安全存储加密后落盘，
 * 明文证书与公开元数据（fingerprint/subject/有效期）单独保存。CA 材料只在
 * Main 内解密，供下发 Core 做 HTTPS MITM；Leaf 证书由 Core 的 Mockttp 用该 CA
 * 动态签发。CertificateService 不触达系统信任库（由 TrustStoreService 负责）。
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

  constructor(options: CertificateServiceOptions) {
    this.dataDir = options.dataDir;
    this.secureStore = options.secureStore;
    this.now = options.now ?? (() => new Date());
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
    if (!((await this.readMeta()) && (await this.hasKeyAndCert()))) {
      await this.generate();
    }
    return this.getStatus();
  }

  /** 强制重新生成并覆盖现有 CA。调用方：用户在设置里“重新生成 CA”。 */
  async regenerate(): Promise<CertificateStatus> {
    await this.generate();
    return this.getStatus();
  }

  /** 删除本地 CA 材料（证书/私钥/元数据），回到“未生成”状态。调用方：ca.delete。 */
  async delete(): Promise<void> {
    await Promise.all([
      fs.rm(this.certPath, { force: true }),
      fs.rm(this.keyPath, { force: true }),
      fs.rm(this.metaPath, { force: true }),
    ]);
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

    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.certPath, certPem, 'utf8');
    await fs.writeFile(this.keyPath, this.secureStore.encryptString(keyPem));
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2), 'utf8');
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
    } catch {
      return false;
    }
  }
}
