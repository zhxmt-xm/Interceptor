import { webcrypto, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as x509 from '@peculiar/x509';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrustStoreService } from '../../internal/trust-store-service';
import { MacosHelperServiceError, TrustStoreError } from '../../internal/errors';
import { MacosHelperServiceClient } from '../../macos/helper-client';
import type { CommandResult, CommandRunner, ElevatedRunner } from '../../interfaces';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

/** 记录只读命令（isTrusted）；绝不真实执行平台命令。 */
class RecordingRunner implements CommandRunner {
  readonly calls: { command: string; args: string[]; input?: string }[] = [];
  readonly results: CommandResult[] = [];
  result: CommandResult = { code: 0, stdout: '', stderr: '' };

  run(command: string, args: string[], input?: string): Promise<CommandResult> {
    this.calls.push({ command, args, ...(input === undefined ? {} : { input }) });
    return Promise.resolve(this.results.shift() ?? this.result);
  }
}

/** 记录提权命令行（install/uninstall）；绝不真实提权。 */
class RecordingElevatedRunner implements ElevatedRunner {
  readonly calls: string[] = [];
  result: CommandResult = { code: 0, stdout: '', stderr: '' };

  run(command: string): Promise<CommandResult> {
    this.calls.push(command);
    return Promise.resolve(this.result);
  }
}

const SHA1 = 'AABBCCDDEEFF00112233445566778899AABBCCDD';

describe('TrustStoreService', () => {
  let certificatePem: string;
  let certificateFingerprint: string;
  let certificatePayload: { certificate: string; sha256: string };

  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from(certificatePem));
    vi.spyOn(MacosHelperServiceClient.prototype, 'importCertificate').mockResolvedValue();
    vi.spyOn(MacosHelperServiceClient.prototype, 'trustCertificate').mockResolvedValue();
    vi.spyOn(MacosHelperServiceClient.prototype, 'untrustCertificate').mockResolvedValue();
    vi.spyOn(MacosHelperServiceClient.prototype, 'removeCertificate').mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  beforeAll(async () => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    const algorithm = {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
      publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048,
    };
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']) as CryptoKeyPair;
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: '01', name: 'CN=Interceptor CA, O=Interceptor', keys,
      signingAlgorithm: algorithm,
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 86_400_000),
      extensions: [new x509.BasicConstraintsExtension(true, 0, true)],
    });
    certificatePem = new X509Certificate(Buffer.from(certificate.rawData)).toString();
    certificateFingerprint = new X509Certificate(certificatePem).fingerprint.replaceAll(':', '');
    certificatePayload = {
      certificate: Buffer.from(certificate.rawData).toString('base64'),
      sha256: new X509Certificate(certificatePem).fingerprint256.replaceAll(':', ''),
    };
  });

  it('installs into the local machine root store on Windows via elevated certutil', async () => {
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({ platform: 'win32', elevatedRunner: recordingElevatedRunner });
    await trustStoreService.install('C:/certs/root.pem');
    expect(recordingElevatedRunner.calls[0]).toBe('certutil -addstore -f Root "C:/certs/root.pem"');
  });

  it('imports and trusts only the public certificate through the helper', async () => {
    const recordingRunner = new RecordingRunner();
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({
      platform: 'darwin',
      runner: recordingRunner,
      elevatedRunner: recordingElevatedRunner,
      systemKeychainPath: '/Library/Keychains/System.keychain',
    });
    await trustStoreService.install('/certs/root.pem');
    expect(recordingRunner.calls).toEqual([
      { command: 'security', args: ['find-certificate', '-a', '-p', '/Library/Keychains/System.keychain'] },
    ]);
    expect(MacosHelperServiceClient.prototype.importCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(MacosHelperServiceClient.prototype.trustCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(MacosHelperServiceClient.prototype.importCertificate)
      .toHaveBeenCalledBefore(vi.mocked(MacosHelperServiceClient.prototype.trustCertificate));
    expect(recordingElevatedRunner.calls).toEqual([]);
  });

  it('routes macOS trust changes through the helper instead of security commands in Main', async () => {
    const recordingRunner = new RecordingRunner();
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner });

    await trustStoreService.install('/certs/root.pem');
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    await trustStoreService.uninstall(certificateFingerprint);

    expect(recordingRunner.calls.filter(({ args }) =>
      args[0] === 'add-trusted-cert' || args[0] === 'remove-trusted-cert')).toEqual([]);
  });

  it('does not request macOS trust if the certificate import fails', async () => {
    const recordingRunner = new RecordingRunner();
    const recordingElevatedRunner = new RecordingElevatedRunner();
    vi.mocked(MacosHelperServiceClient.prototype.importCertificate).mockRejectedValueOnce(new MacosHelperServiceError('operation-failed'));
    const trustStoreService = new TrustStoreService({
      platform: 'darwin', runner: recordingRunner, elevatedRunner: recordingElevatedRunner,
    });

    await expect(trustStoreService.install('/certs/root.pem')).rejects.toMatchObject({ code: 'operation-failed' });
    expect(recordingRunner.calls).toEqual([
      { command: 'security', args: ['find-certificate', '-a', '-p', '/Library/Keychains/System.keychain'] },
    ]);
    expect(MacosHelperServiceClient.prototype.trustCertificate).not.toHaveBeenCalled();
    expect(recordingElevatedRunner.calls).toHaveLength(0);
  });

  it.each(['authorization-required', 'authorization-cancelled', 'operation-failed'] as const)(
    'reports macOS trust failure %s without retrying through a root shell', async (code) => {
    const recordingRunner = new RecordingRunner();
    const trustError = new MacosHelperServiceError(code);
    vi.mocked(MacosHelperServiceClient.prototype.trustCertificate).mockRejectedValueOnce(trustError);
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({
      platform: 'darwin', runner: recordingRunner, elevatedRunner: recordingElevatedRunner,
    });

    await expect(trustStoreService.install('/certs/root.pem')).rejects.toBe(trustError);
    expect(recordingRunner.calls).toHaveLength(1);
    expect(MacosHelperServiceClient.prototype.importCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(MacosHelperServiceClient.prototype.trustCertificate).toHaveBeenCalledTimes(1);
    expect(MacosHelperServiceClient.prototype.removeCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(recordingElevatedRunner.calls).toEqual([]);
    },
  );

  it('preserves an already installed macOS CA when trust authorization fails', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    const trustError = new MacosHelperServiceError('operation-failed');
    vi.mocked(MacosHelperServiceClient.prototype.trustCertificate).mockRejectedValueOnce(trustError);
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner });

    await expect(trustStoreService.install('/certs/root.pem')).rejects.toBe(trustError);
    expect(MacosHelperServiceClient.prototype.removeCertificate).not.toHaveBeenCalled();
  });

  it('does not import a macOS CA when the original certificate inventory cannot be read', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 1, stdout: '', stderr: 'Certificate inventory unavailable' };
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner });

    await expect(trustStoreService.install('/certs/root.pem')).rejects.toThrow('Certificate inventory unavailable');
    expect(MacosHelperServiceClient.prototype.importCertificate).not.toHaveBeenCalled();
    expect(MacosHelperServiceClient.prototype.trustCertificate).not.toHaveBeenCalled();
    expect(MacosHelperServiceClient.prototype.removeCertificate).not.toHaveBeenCalled();
    expect(recordingRunner.calls).toHaveLength(1);
  });

  it('retains both the trust failure and the new-certificate cleanup failure', async () => {
    const recordingRunner = new RecordingRunner();
    const trustError = new MacosHelperServiceError('operation-failed');
    vi.mocked(MacosHelperServiceClient.prototype.trustCertificate).mockRejectedValueOnce(trustError);
    const cleanupError = new MacosHelperServiceError('verification-failed');
    vi.mocked(MacosHelperServiceClient.prototype.removeCertificate).mockRejectedValueOnce(cleanupError);
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner });

    await expect(trustStoreService.install('/certs/root.pem')).rejects.toMatchObject({
      errors: [trustError, cleanupError],
    });
  });

  it('uninstalls by SHA-1 thumbprint on Windows (elevated)', async () => {
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({ platform: 'win32', elevatedRunner: recordingElevatedRunner });
    await trustStoreService.uninstall(SHA1);
    expect(recordingElevatedRunner.calls[0]).toBe(`certutil -delstore Root ${SHA1}`);
  });

  it('removes macOS admin trust before deleting the certificate from the system keychain', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({
      platform: 'darwin',
      runner: recordingRunner,
      elevatedRunner: recordingElevatedRunner,
      systemKeychainPath: '/kc',
    });
    await trustStoreService.uninstall(certificateFingerprint);
    expect(recordingRunner.calls).toEqual([
      { command: 'security', args: ['find-certificate', '-a', '-p', '/kc'] },
    ]);
    expect(MacosHelperServiceClient.prototype.untrustCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(MacosHelperServiceClient.prototype.removeCertificate).toHaveBeenCalledWith(certificatePayload);
    expect(MacosHelperServiceClient.prototype.untrustCertificate)
      .toHaveBeenCalledBefore(vi.mocked(MacosHelperServiceClient.prototype.removeCertificate));
    expect(recordingElevatedRunner.calls).toEqual([]);
  });

  it('keeps the macOS certificate if admin trust removal is denied', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    const trustError = new MacosHelperServiceError('authorization-required');
    vi.mocked(MacosHelperServiceClient.prototype.untrustCertificate).mockRejectedValueOnce(trustError);
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({
      platform: 'darwin', runner: recordingRunner, elevatedRunner: recordingElevatedRunner,
    });

    await expect(trustStoreService.uninstall(certificateFingerprint)).rejects.toBe(trustError);
    expect(MacosHelperServiceClient.prototype.removeCertificate).not.toHaveBeenCalled();
    expect(recordingElevatedRunner.calls).toEqual([]);
  });

  it('does not delete another macOS certificate when the target is absent', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    const recordingElevatedRunner = new RecordingElevatedRunner();
    const trustStoreService = new TrustStoreService({
      platform: 'darwin', runner: recordingRunner, elevatedRunner: recordingElevatedRunner,
    });

    await trustStoreService.uninstall(SHA1);
    expect(recordingRunner.calls).toHaveLength(1);
    expect(MacosHelperServiceClient.prototype.untrustCertificate).not.toHaveBeenCalled();
    expect(MacosHelperServiceClient.prototype.removeCertificate).not.toHaveBeenCalled();
    expect(recordingElevatedRunner.calls).toEqual([]);
  });

  it('throws when an elevated command exits non-zero', async () => {
    const recordingElevatedRunner = new RecordingElevatedRunner();
    recordingElevatedRunner.result = { code: 1, stdout: '', stderr: 'denied' };
    const trustStoreService = new TrustStoreService({ platform: 'win32', elevatedRunner: recordingElevatedRunner });
    await expect(trustStoreService.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });

  it('detects Windows trust by exit code (local machine store)', async () => {
    const recordingRunner = new RecordingRunner();
    const trustStoreService = new TrustStoreService({ platform: 'win32', runner: recordingRunner });
    recordingRunner.result = { code: 0, stdout: '', stderr: '' };
    expect(await trustStoreService.isTrusted(SHA1)).toBe(true);
    expect(recordingRunner.calls[0]).toEqual({
      command: 'certutil',
      args: ['-verifystore', 'Root', SHA1],
    });
    recordingRunner.result = { code: 1, stdout: '', stderr: '' };
    expect(await trustStoreService.isTrusted(SHA1)).toBe(false);
  });

  it('checks macOS system trust only after matching the certificate fingerprint', async () => {
    const recordingRunner = new RecordingRunner();
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner, systemKeychainPath: '/kc' });
    recordingRunner.results.push(
      { code: 0, stdout: certificatePem, stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    );

    expect(await trustStoreService.isTrusted(certificateFingerprint)).toBe(true);
    expect(recordingRunner.calls).toEqual([
      { command: 'security', args: ['find-certificate', '-a', '-p', '/kc'] },
      {
        command: 'security',
        args: ['verify-cert', '-c', '/dev/stdin', '-p', 'basic', '-L', '-q', '-k', '/kc'],
        input: certificatePem,
      },
    ]);
  });

  it('reports an installed macOS certificate as untrusted when system evaluation rejects it', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.results.push(
      { code: 0, stdout: certificatePem, stderr: '' },
      { code: 1, stdout: '', stderr: 'CSSMERR_TP_NOT_TRUSTED' },
    );
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner, systemKeychainPath: '/kc' });

    expect(await trustStoreService.isTrusted(certificateFingerprint)).toBe(false);
    expect(recordingRunner.calls).toHaveLength(2);
  });

  it('does not verify a different certificate from the macOS keychain', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: certificatePem, stderr: '' };
    const trustStoreService = new TrustStoreService({ platform: 'darwin', runner: recordingRunner, systemKeychainPath: '/kc' });

    expect(await trustStoreService.isTrusted(SHA1)).toBe(false);
    expect(recordingRunner.calls).toHaveLength(1);
  });

  it('reports unsupported platforms and refuses to install', async () => {
    const trustStoreService = new TrustStoreService({ platform: 'linux' });
    expect(trustStoreService.supported()).toBe(false);
    expect(await trustStoreService.isTrusted(SHA1)).toBe(false);
    await expect(trustStoreService.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });

  it('does not treat a macOS certificate inventory entry as a trust decision', async () => {
    const recordingRunner = new RecordingRunner();
    recordingRunner.result = { code: 0, stdout: `SHA-1 hash: ${SHA1}\n`, stderr: '' };
    const trustStoreService = new TrustStoreService({
      platform: 'darwin',
      runner: recordingRunner,
      systemKeychainPath: '/kc',
    });

    expect(await trustStoreService.isTrusted(SHA1)).toBe(false);
  });
});
