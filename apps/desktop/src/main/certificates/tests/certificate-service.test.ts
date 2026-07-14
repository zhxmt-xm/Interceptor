import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as x509 from '@peculiar/x509';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CertificateError,
  CertificateService,
  type SecureStore,
} from '../certificate-service';

/** 明文前缀“加密”，用于断言私钥确实经 SecureStore 加密后落盘。 */
class FakeSecureStore implements SecureStore {
  available = true;

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(plaintext: string): Buffer {
    return Buffer.from(`enc:${plaintext}`, 'utf8');
  }

  decryptString(data: Buffer): string {
    const text = data.toString('utf8');
    return text.startsWith('enc:') ? text.slice(4) : text;
  }
}

describe('CertificateService', () => {
  let dataDir: string;
  let secureStore: FakeSecureStore;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-ca-'));
    secureStore = new FakeSecureStore();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function createService(): CertificateService {
    return new CertificateService({ dataDir, secureStore });
  }

  it('reports absent status before any CA exists', async () => {
    const status = await createService().getStatus();
    expect(status).toEqual({
      present: false,
      fingerprint: null,
      subject: null,
      createdAt: null,
      expiresAt: null,
    });
  });

  it('generates a compatible RSA CA with basic constraints and key usage', async () => {
    const service = createService();
    const status = await service.ensure();

    expect(status.present).toBe(true);
    expect(status.subject).toBe('CN=Interceptor CA, O=Interceptor');
    expect(status.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(new Date(status.expiresAt ?? '').getTime()).toBeGreaterThan(Date.now());

    const material = await service.getMaterial();
    expect(material?.cert).toContain('BEGIN CERTIFICATE');
    expect(material?.key).toContain('BEGIN PRIVATE KEY');

    const certificate = new x509.X509Certificate(material!.cert);
    const basicConstraints = certificate.getExtension(x509.BasicConstraintsExtension);
    expect(basicConstraints?.ca).toBe(true);
    const keyUsage = certificate.getExtension(x509.KeyUsagesExtension);
    expect((keyUsage?.usages ?? 0) & x509.KeyUsageFlags.keyCertSign).toBeTruthy();
  });

  it('stores the private key only through the secure store, never in plaintext', async () => {
    await createService().ensure();
    const encrypted = await fs.readFile(path.join(dataDir, 'root-key.enc'), 'utf8');
    expect(encrypted.startsWith('enc:')).toBe(true);
    // 明文私钥不得直接落盘（除加密文件外目录内无 PRIVATE KEY 文本）。
    const certPem = await fs.readFile(path.join(dataDir, 'root-cert.pem'), 'utf8');
    expect(certPem).not.toContain('PRIVATE KEY');
  });

  it('is idempotent: ensure keeps the same CA fingerprint', async () => {
    const service = createService();
    const first = await service.ensure();
    const second = await service.ensure();
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('regenerate replaces the CA with a new fingerprint', async () => {
    const service = createService();
    const first = await service.ensure();
    const regenerated = await service.regenerate();
    expect(regenerated.present).toBe(true);
    expect(regenerated.fingerprint).not.toBe(first.fingerprint);
  });

  it('refuses to generate when OS secure storage is unavailable', async () => {
    secureStore.available = false;
    await expect(createService().ensure()).rejects.toBeInstanceOf(CertificateError);
  });

  it('returns null material when no CA is present', async () => {
    expect(await createService().getMaterial()).toBeNull();
  });
});
