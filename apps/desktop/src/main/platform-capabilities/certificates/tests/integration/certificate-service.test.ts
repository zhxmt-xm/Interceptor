import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import * as x509 from '@peculiar/x509';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CertificateService } from '../../entry';
import { CertificateError } from '../../internal/errors';
import { MacosHelperServiceClient } from '../../../helper/macos/helper-client';
import { TrustStoreService } from '../../internal/trust-store-service';
import { MacosHelperServiceError } from '../../../helper/macos/internal/errors';
import type { SecureStore } from '../../../interfaces';
import { CoreRuntime } from '../../../../core/core-runtime';
import { MainDiagnostics } from '../../../../diagnostics/main-diagnostics';
import { HelperService } from '../../../helper/entry';

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
  let coreRuntime: CoreRuntime;
  let diagnostics: MainDiagnostics;
  let helperService: HelperService;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-ca-'));
    secureStore = new FakeSecureStore();
    coreRuntime = new CoreRuntime();
    diagnostics = new MainDiagnostics(coreRuntime);
    helperService = new HelperService({ nativeDirectory: dataDir });
    vi.spyOn(coreRuntime, 'ingestDiagnostic').mockResolvedValue();
    vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({
      type: command.type,
      payload: command.type === 'tls.getDecryptionPreference' ? { enabled: false }
        : { decrypting: command.type === 'tls.startDecryption' },
    }) as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function createService(platform: NodeJS.Platform = process.platform): CertificateService {
    return new CertificateService({ dataDir, secureStore, coreRuntime, diagnostics, helperService, platform });
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

  it.runIf(process.platform !== 'win32')('creates shared CA material with private file permissions', async () => {
    await createService().ensure();
    for (const name of ['root-cert.pem', 'root-key.enc', 'ca-meta.json']) {
      expect((await fs.stat(path.join(dataDir, name))).mode & 0o777).toBe(0o600);
    }
  });

  it('is idempotent: ensure keeps the same CA fingerprint', async () => {
    const service = createService();
    const first = await service.ensure();
    const second = await service.ensure();
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it.each(['root-cert.pem', 'root-key.enc', 'ca-meta.json'])('does not replace partial shared CA material when %s is missing', async (fileName) => {
    const certificateService = createService();
    await certificateService.ensure();
    await fs.rm(path.join(dataDir, fileName));
    const remainingFiles = (await fs.readdir(dataDir)).sort();
    const before = await Promise.all(remainingFiles.map((name) => fs.readFile(path.join(dataDir, name))));

    await expect(certificateService.ensure()).rejects.toBeInstanceOf(CertificateError);
    expect((await fs.readdir(dataDir)).sort()).toEqual(remainingFiles);
    expect(await Promise.all(remainingFiles.map((name) => fs.readFile(path.join(dataDir, name))))).toEqual(before);
  });

  it('does not replace shared CA material when metadata is corrupt', async () => {
    const certificateService = createService();
    await certificateService.ensure();
    const certificateBefore = await fs.readFile(path.join(dataDir, 'root-cert.pem'));
    const encryptedKeyBefore = await fs.readFile(path.join(dataDir, 'root-key.enc'));
    await fs.writeFile(path.join(dataDir, 'ca-meta.json'), 'invalid-json', 'utf8');

    await expect(certificateService.ensure()).rejects.toBeInstanceOf(CertificateError);
    expect(await fs.readFile(path.join(dataDir, 'root-cert.pem'))).toEqual(certificateBefore);
    expect(await fs.readFile(path.join(dataDir, 'root-key.enc'))).toEqual(encryptedKeyBefore);
    expect(await fs.readFile(path.join(dataDir, 'ca-meta.json'), 'utf8')).toBe('invalid-json');
  });

  it.each(['certificate', 'encrypted-key', 'metadata-fields', 'fingerprint', 'key-pair', 'expired'])(
    'refuses unusable shared CA %s without changing material', async (failure) => {
      const certificateService = new CertificateService({
        dataDir, secureStore, coreRuntime, diagnostics, helperService,
        ...(failure === 'expired' ? { now: () => new Date('2020-01-01T00:00:00Z') } : {}),
      });
      await certificateService.ensure();
      const certificatePath = path.join(dataDir, 'root-cert.pem');
      const keyPath = path.join(dataDir, 'root-key.enc');
      const metaPath = path.join(dataDir, 'ca-meta.json');
      if (failure === 'certificate') await fs.writeFile(certificatePath, 'invalid-certificate', 'utf8');
      if (failure === 'encrypted-key') await fs.writeFile(keyPath, 'invalid-encrypted-key', 'utf8');
      if (failure === 'metadata-fields') await fs.writeFile(metaPath, JSON.stringify({ fingerprint: 'invalid' }), 'utf8');
      if (failure === 'fingerprint') {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        await fs.writeFile(metaPath, JSON.stringify({ ...meta, sha1: '0'.repeat(40) }), 'utf8');
      }
      if (failure === 'key-pair') {
        const certificate = await fs.readFile(certificatePath);
        const meta = await fs.readFile(metaPath);
        await certificateService.regenerate();
        await fs.writeFile(certificatePath, certificate);
        await fs.writeFile(metaPath, meta);
      }
      const filePaths = [certificatePath, keyPath, metaPath];
      const before = await Promise.all(filePaths.map((filePath) => fs.readFile(filePath)));

      await expect(createService().ensure()).rejects.toBeInstanceOf(CertificateError);
      expect(await Promise.all(filePaths.map((filePath) => fs.readFile(filePath)))).toEqual(before);
    },
  );

  it('regenerate replaces the CA with a new fingerprint', async () => {
    const service = createService();
    const first = await service.ensure();
    const regenerated = await service.regenerate();
    expect(regenerated.present).toBe(true);
    expect(regenerated.fingerprint).not.toBe(first.fingerprint);
  });

  it('rejects Delete while Install is running without deleting material or deferring the request', async () => {
    const certificateService = createService();
    await certificateService.ensure();
    const before = await certificateService.getThumbprints();
    let finishInstall!: () => void;
    const installed = new Promise<void>((resolve) => { finishInstall = resolve; });
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockReturnValue(installed);
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const running = certificateService.install();
    try {
      await expect.poll(() => install.mock.calls.length).toBe(1);
      await expect(certificateService.delete()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'certificate.install',
      });
      expect(await certificateService.getThumbprints()).toEqual(before);
    } finally {
      finishInstall();
      await running;
    }
    expect(await certificateService.getThumbprints()).toEqual(before);
    await certificateService.delete();
    expect((await certificateService.getStatus()).present).toBe(false);
  });

  it('keeps the certificate operation busy until the module finishes Core synchronization', async () => {
    let finishSynchronization!: () => void;
    const synchronized = new Promise<void>((resolve) => { finishSynchronization = resolve; });
    const onChanged = vi.fn();
    const request = vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => {
      if (command.type === 'tls.useCertificate') await synchronized;
      return { type: command.type, payload: { decrypting: false } } as never;
    });
    const certificateService = new CertificateService({ dataDir, secureStore, coreRuntime, diagnostics, helperService, onChanged });
    await certificateService.ensure();
    vi.spyOn(TrustStoreService.prototype, 'install').mockResolvedValue();
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const running = certificateService.install();
    try {
      await expect.poll(() => request.mock.calls.some(([command]) => command.type === 'tls.useCertificate')).toBe(true);
      expect(onChanged).not.toHaveBeenCalled();
      await expect(certificateService.regenerate()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'certificate.install',
      });
    } finally {
      finishSynchronization();
      await running;
    }
    expect(certificateService.getActiveOperation()).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('waits for an accepted certificate operation before synchronizing a restarted Core', async () => {
    const certificateService = createService('darwin');
    await certificateService.ensure();
    let finishInstall!: () => void;
    const installation = new Promise<void>((resolve) => { finishInstall = resolve; });
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockReturnValue(installation);
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const running = certificateService.install();
    await expect.poll(() => install.mock.calls.length).toBe(1);
    let synchronizationFinished = false;
    const synchronizing = certificateService.synchronizeCore().then(
      () => { synchronizationFinished = true; return null; },
      (error: unknown) => { synchronizationFinished = true; return error; },
    );
    try {
      await Promise.resolve();
      expect(synchronizationFinished).toBe(false);
      expect(coreRuntime.request).not.toHaveBeenCalled();
      await expect(certificateService.delete()).rejects.toMatchObject({ code: 'operation_in_progress' });
    } finally {
      finishInstall();
      await running;
      expect(await synchronizing).toBeNull();
    }
    expect(vi.mocked(coreRuntime.request).mock.calls.map(([command]) => command.type)).toEqual([
      'tls.useCertificate', 'tls.stopDecryption', 'tls.getDecryptionPreference', 'tls.useCertificate', 'tls.stopDecryption',
    ]);
    expect(certificateService.getActiveOperation()).toBeNull();
  });

  it.each([false, true])('restores the Core decryption preference without decrypting an untrusted CA: trusted=%s', async (trusted) => {
    const certificateService = createService();
    await certificateService.ensure();
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(trusted);
    const request = vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({
      type: command.type, payload: command.type === 'tls.getDecryptionPreference'
        ? { enabled: true } : { decrypting: command.type === 'tls.startDecryption' },
    }) as never);

    await certificateService.synchronizeCore();

    expect(request.mock.calls.map(([command]) => command.type)).toEqual([
      'tls.getDecryptionPreference', 'tls.useCertificate', trusted ? 'tls.startDecryption' : 'tls.stopDecryption',
    ]);
    expect(request.mock.calls[1]![0]).toEqual({
      type: 'tls.useCertificate', payload: { ca: trusted ? await certificateService.getMaterial() : null },
    });
    expect(await certificateService.getInfo()).toMatchObject({ trusted, mitmEnabled: true });
    expect(certificateService.getActiveOperation()).toBeNull();
  });

  it('owns explicit HTTPS decryption changes and publishes the completed state', async () => {
    const certificateService = createService();
    await certificateService.ensure();
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(true);

    await expect(certificateService.enableHttpsDecryption()).resolves.toMatchObject({ mitmEnabled: true, decrypting: true });
    await expect(certificateService.disableHttpsDecryption()).resolves.toMatchObject({ mitmEnabled: false, decrypting: false });
    expect(vi.mocked(coreRuntime.request).mock.calls.map(([command]) => command)).toEqual([
      { type: 'tls.saveDecryptionPreference', payload: { enabled: true } },
      { type: 'tls.startDecryption', payload: {} },
      { type: 'tls.saveDecryptionPreference', payload: { enabled: false } },
      { type: 'tls.stopDecryption', payload: {} },
    ]);
  });

  it.each(['timeout', 'unavailable', 'invalid-response', 'certificate-state-uncertain'] as const)(
    'preserves the certificate operation and material after an uncertain helper outcome: %s', async (code) => {
      const certificateService = createService('darwin');
      await certificateService.ensure();
      const before = await certificateService.getThumbprints();
      const failure = new MacosHelperServiceError(code);
      vi.spyOn(TrustStoreService.prototype, 'install').mockRejectedValue(failure);

      await expect(certificateService.install()).rejects.toBe(failure);
      expect(certificateService.getActiveOperation()).toEqual({ operation: 'certificate.install', state: 'uncertain' });
      await expect(certificateService.delete()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'certificate.install',
      });
      expect(await certificateService.getThumbprints()).toEqual(before);
    },
  );

  it.each(['timeout', 'unavailable', 'invalid-response', 'verification-failed', 'certificate-state-uncertain'] as const)(
    'releases a confirmed completed %s failure without deleting or replacing certificate material', async (code) => {
      const onChanged = vi.fn();
      const certificateService = new CertificateService({ dataDir, secureStore, coreRuntime, diagnostics, helperService, onChanged, platform: 'darwin' });
      await certificateService.ensure();
      const before = await certificateService.getThumbprints();
      const failure = new MacosHelperServiceError(code, 'completed');
      vi.spyOn(TrustStoreService.prototype, 'install').mockRejectedValue(failure);
      vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(true);

      await expect(certificateService.install()).rejects.toBe(failure);

      expect(certificateService.getActiveOperation()).toBeNull();
      expect(await certificateService.getThumbprints()).toEqual(before);
      expect(coreRuntime.request).toHaveBeenCalledWith({ type: 'tls.useCertificate', payload: { ca: await certificateService.getMaterial() } });
      expect(onChanged).toHaveBeenCalledOnce();
      await expect(certificateService.regenerate()).rejects.toThrow('Uninstall the trusted Root CA');
    },
  );

  it('keeps ownership through Core reconciliation after a confirmed native failure', async () => {
    const certificateService = createService('darwin');
    await certificateService.ensure();
    const failure = new MacosHelperServiceError('invalid-response', 'completed');
    vi.spyOn(TrustStoreService.prototype, 'install').mockRejectedValue(failure);
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(true);
    let finishSynchronization!: () => void;
    const synchronized = new Promise<void>((resolve) => { finishSynchronization = resolve; });
    const request = vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => {
      if (command.type === 'tls.useCertificate') await synchronized;
      return { type: command.type, payload: { decrypting: false } } as never;
    });
    const running = certificateService.install().catch((error: unknown) => error);
    try {
      await expect.poll(() => request.mock.calls.some(([command]) => command.type === 'tls.useCertificate')).toBe(true);
      await expect(certificateService.delete()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'certificate.install',
      });
    } finally {
      finishSynchronization();
      expect(await running).toBe(failure);
    }
    expect(certificateService.getActiveOperation()).toBeNull();
  });

  it('does not retain a mutation lock after a read-only certificate viewer fails', async () => {
    const certificateService = createService('darwin');
    await certificateService.ensure();
    vi.spyOn(MacosHelperServiceClient.prototype, 'viewCertificate').mockRejectedValue(new MacosHelperServiceError('timeout'));

    await expect(certificateService.view(vi.fn())).rejects.toMatchObject({ code: 'timeout' });

    expect(certificateService.getActiveOperation()).toBeNull();
    expect((await certificateService.getStatus()).present).toBe(true);
  });

  it('releases a certificate operation after a definite authorization cancellation', async () => {
    const certificateService = createService('darwin');
    await certificateService.ensure();
    vi.spyOn(TrustStoreService.prototype, 'install').mockRejectedValue(new MacosHelperServiceError('authorization-cancelled'));
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);

    await expect(certificateService.install()).rejects.toMatchObject({ code: 'authorization-cancelled' });
    expect(certificateService.getActiveOperation()).toBeNull();
    await certificateService.delete();
    expect((await certificateService.getStatus()).present).toBe(false);
  });

  it('refuses to generate when OS secure storage is unavailable', async () => {
    secureStore.available = false;
    await expect(createService().ensure()).rejects.toBeInstanceOf(CertificateError);
  });

  it('returns null material when no CA is present', async () => {
    expect(await createService().getMaterial()).toBeNull();
  });

  it('views the macOS public certificate without decrypting private material or importing a file', async () => {
    const certificateService = createService('darwin');
    await certificateService.ensure();
    const certificate = new X509Certificate(await fs.readFile(certificateService.getCertificatePath()));
    const view = vi.spyOn(MacosHelperServiceClient.prototype, 'viewCertificate').mockResolvedValue();
    const decrypt = vi.spyOn(secureStore, 'decryptString');
    const openPath = vi.fn(async (_filePath: string) => '');
    await certificateService.view(openPath);

    expect(view).toHaveBeenCalledWith({ certificate: certificate.raw.toString('base64'),
      sha256: certificate.fingerprint256.replaceAll(':', '') });
    expect(decrypt).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
    expect((await fs.readdir(dataDir)).sort()).toEqual(['ca-meta.json', 'root-cert.pem', 'root-key.enc']);
  });

  it.each([false, true])('preserves the Windows certificate viewer and PEM retry with failed DER open=%s', async (failedDerOpen) => {
    const certificateService = createService('win32');
    await certificateService.ensure();
    const certificate = new X509Certificate(await fs.readFile(certificateService.getCertificatePath()));
    const openPath = vi.fn(async (_filePath: string) => '').mockResolvedValueOnce(failedDerOpen ? 'open failed' : '');
    await certificateService.view(openPath);

    const cerPath = path.join(dataDir, 'root-cert.cer');
    expect(await fs.readFile(cerPath)).toEqual(certificate.raw);
    expect(openPath.mock.calls.map(([filePath]) => filePath)).toEqual(failedDerOpen
      ? [cerPath, certificateService.getCertificatePath()] : [cerPath]);
  });

  it.runIf(process.platform === 'darwin')('recognizes a macOS system root through native trust evaluation', async () => {
    const systemKeychainPath = '/System/Library/Keychains/SystemRootCertificates.keychain';
    const { stdout } = await promisify(execFile)('security', [
      'find-certificate', '-c', 'DigiCert Global Root G2', '-p', systemKeychainPath,
    ], { encoding: 'utf8' });
    const certificate = new X509Certificate(stdout);
    const trustStoreService = new TrustStoreService({ systemKeychainPath });

    expect(await trustStoreService.isTrusted(certificate.fingerprint.replaceAll(':', ''))).toBe(true);
  });

  it.runIf(process.platform === 'darwin')('does not implicitly trust a newly generated macOS CA', async () => {
    const certificateService = createService();
    await certificateService.ensure();
    const thumbprints = await certificateService.getThumbprints();
    expect(thumbprints).not.toBeNull();
    expect(await new TrustStoreService().isTrusted(thumbprints!.sha1)).toBe(false);

    const result = await promisify(execFile)('security', [
      'verify-cert', '-c', certificateService.getCertificatePath(),
      '-p', 'basic', '-L', '-q', '-k', '/Library/Keychains/System.keychain',
    ], { encoding: 'utf8' }).then(
      () => ({ trusted: true }),
      (error: { code?: unknown }) => ({ trusted: false, exitCode: error.code }),
    );
    expect(result).toMatchObject({ trusted: false, exitCode: 1 });
  });
});