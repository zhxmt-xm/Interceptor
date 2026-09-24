import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { CommandResult, CommandRunner } from '../../interfaces';
import type { MacosCertificatePayload } from '../../helper/interfaces';
import type { TrustStoreServiceOptions } from '../interfaces';
import { MacosHelperServiceError } from '../../helper/macos/internal/errors';
import { TrustStoreError } from '../internal/errors';
import { MacosHelperServiceClient } from '../../helper/macos/helper-client';

const macosTrustCommandRunner: CommandRunner = {
  run(command, args, input) {
    return new Promise((resolve) => {
      const child = execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        const rawCode = (error as { code?: number | string } | null)?.code;
        const code = typeof rawCode === 'number' ? rawCode : error ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
      if (input !== undefined) {
        child.stdin?.once('error', () => {
          child.kill();
          resolve({ code: 1, stdout: '', stderr: 'Unable to send the certificate for trust evaluation.' });
        });
        child.stdin?.end(input);
      }
    });
  },
};

/** Owns the macOS System Keychain and admin trust operations. */
export class MacosTrustStoreService {
  private readonly runner: CommandRunner;
  private readonly macosHelperServiceClient: MacosHelperServiceClient;
  private readonly systemKeychain: string;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.runner = options.runner ?? macosTrustCommandRunner;
    this.macosHelperServiceClient = options.macosHelperServiceClient ?? new MacosHelperServiceClient();
    this.systemKeychain = options.systemKeychainPath ?? '/Library/Keychains/System.keychain';
  }

  async install(certPath: string): Promise<CommandResult> {
    const certificate = new X509Certificate(await readFile(certPath, 'utf8'));
    const payload = this.certificatePayload(certificate);
    const inventory = await this.runner.run('security', ['find-certificate', '-a', '-p', this.systemKeychain]);
    if (inventory.code !== 0) return inventory;
    const existingCertificate = this.findCertificate(inventory.stdout, certificate.fingerprint.replaceAll(':', ''));
    const alreadyInstalled = existingCertificate?.raw.equals(certificate.raw) ?? false;
    try {
      await this.macosHelperServiceClient.importCertificate(payload);
    } catch (importError) {
      if (!alreadyInstalled && importError instanceof MacosHelperServiceError
        && importError.requestSent && importError.executionState === 'completed'
        && ['timeout', 'unavailable', 'invalid-response', 'verification-failed'].includes(importError.code)) {
        return this.removeNewCertificateAfterFailure(payload, importError);
      }
      throw importError;
    }
    try {
      await this.macosHelperServiceClient.trustCertificate(payload);
    } catch (trustError) {
      const uncertain = trustError instanceof MacosHelperServiceError && [
        'certificate-state-uncertain', 'timeout',
        'unavailable', 'invalid-response', 'verification-failed',
      ].includes(trustError.code);
      if (alreadyInstalled || uncertain) throw trustError;
      return this.removeNewCertificateAfterFailure(payload, trustError);
    }
    return { code: 0, stdout: '', stderr: '' };
  }

  private async removeNewCertificateAfterFailure(payload: MacosCertificatePayload, failure: unknown): Promise<never> {
    try {
      await this.macosHelperServiceClient.removeCertificate(payload);
    } catch (cleanupError) {
      throw new AggregateError([failure, cleanupError],
        'macOS certificate installation failed and the newly imported certificate could not be removed.');
    }
    throw failure;
  }

  async uninstall(sha1Thumbprint: string): Promise<CommandResult> {
    const inventory = await this.runner.run('security', ['find-certificate', '-a', '-p', this.systemKeychain]);
    if (inventory.code !== 0) return inventory;
    const certificate = this.findCertificate(inventory.stdout, sha1Thumbprint);
    if (!certificate) return { code: 0, stdout: '', stderr: '' };
    const payload = this.certificatePayload(certificate);
    await this.macosHelperServiceClient.untrustCertificate(payload);
    await this.macosHelperServiceClient.removeCertificate(payload);
    return { code: 0, stdout: '', stderr: '' };
  }

  private certificatePayload(certificate: X509Certificate): MacosCertificatePayload {
    if (!certificate.ca || !certificate.checkIssued(certificate) || !certificate.verify(certificate.publicKey)
      || !/(?:^|\n)CN=Interceptor CA(?:\n|$)/.test(certificate.subject)) {
      throw new TrustStoreError('Only an Interceptor self-signed root CA may be managed by the helper.');
    }
    return { certificate: certificate.raw.toString('base64'), sha256: certificate.fingerprint256.replaceAll(':', '') };
  }

  async isTrusted(sha1Thumbprint: string): Promise<boolean> {
    const inventory = await this.runner.run('security', ['find-certificate', '-a', '-p', this.systemKeychain]);
    if (inventory.code !== 0) return false;
    const certificate = this.findCertificate(inventory.stdout, sha1Thumbprint);
    if (!certificate) return false;
    const trust = await this.runner.run('security', [
      'verify-cert', '-c', '/dev/stdin', '-p', 'basic', '-L', '-q', '-k', this.systemKeychain,
    ], certificate.toString());
    return trust.code === 0;
  }

  private findCertificate(output: string, sha1Thumbprint: string): X509Certificate | null {
    const certificates = output.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    for (const [pem] of certificates) {
      const certificate = new X509Certificate(pem);
      if (certificate.fingerprint.replaceAll(':', '') === sha1Thumbprint.toUpperCase()) return certificate;
    }
    return null;
  }
}