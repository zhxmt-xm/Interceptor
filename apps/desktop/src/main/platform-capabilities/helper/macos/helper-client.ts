import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';

import type { MacosCertificatePayload, MacosHelperServiceRequest, MacosHelperServiceStatus } from '../interfaces';
import type { MacosSystemProxySnapshot } from '../../system-proxy/interfaces';
import { MacosHelperServiceError } from './internal/errors';
import { parseMacosEffectiveProxySettings, parseMacosHelperServiceReply, parseMacosHelperServiceStatus, parseMacosSystemProxySnapshot } from './utils';

/** Calls the native service and delegates interactive trust authorization to the installed helper. */
export class MacosHelperServiceClient {
  constructor(
    private readonly socketPath = '/Library/Application Support/Interceptor/PlatformHelper/service.sock',
    private readonly helperPath = '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities',
  ) {}

  async getStatus(): Promise<MacosHelperServiceStatus> {
    const value = await this.requestService({ operation: 'status' });
    try {
      return parseMacosHelperServiceStatus(value);
    } catch {
      throw new MacosHelperServiceError('invalid-response', 'completed', 'status');
    }
  }

  async readSystemProxySnapshot(): Promise<MacosSystemProxySnapshot> {
    return this.parseProxySnapshot(await this.requestService({ operation: 'system-proxy.read' }));
  }

  async readEffectiveSystemProxySettings(): Promise<Record<string, unknown>> {
    const value = await this.requestService({ operation: 'system-proxy.read-effective' });
    try {
      return parseMacosEffectiveProxySettings(value);
    } catch {
      throw new MacosHelperServiceError('invalid-response', 'completed', 'system-proxy.read-effective');
    }
  }

  async replaceSystemProxySnapshot(
    expectedSnapshot: MacosSystemProxySnapshot,
    replacementSnapshot: MacosSystemProxySnapshot,
  ): Promise<MacosSystemProxySnapshot> {
    return this.parseProxySnapshot(await this.requestService({
      operation: 'system-proxy.replace', parameters: { expectedSnapshot, replacementSnapshot },
    }));
  }

  private parseProxySnapshot(value: unknown): MacosSystemProxySnapshot {
    try {
      return parseMacosSystemProxySnapshot(value);
    } catch {
      throw new MacosHelperServiceError('invalid-response', 'completed');
    }
  }

  async importCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestService({ operation: 'certificate.import', parameters: certificate });
    this.verifyCertificateResult(result, certificate.sha256, true);
  }

  async trustCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestCertificateAuthorization('certificate.trust', certificate);
    this.verifyCertificateTrustResult(result, certificate.sha256, true);
  }

  async untrustCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestCertificateAuthorization('certificate.untrust', certificate);
    this.verifyCertificateTrustResult(result, certificate.sha256, false);
  }

  private verifyCertificateTrustResult(value: unknown, sha256: string, trusted: boolean): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 2
      || !('sha256' in value) || value.sha256 !== sha256 || !('trusted' in value) || value.trusted !== trusted) {
      throw new MacosHelperServiceError('invalid-response', 'completed');
    }
  }

  private requestCertificateAuthorization(
    operation: 'certificate.trust' | 'certificate.untrust', certificate: MacosCertificatePayload,
  ): Promise<unknown> {
    const input = Buffer.from(JSON.stringify(certificate), 'utf8');
    if (input.length > 262_144) return Promise.reject(new MacosHelperServiceError('invalid-request'));
    console.info(`[platform-capabilities] ${operation} requesting system authorization`);
    return new Promise((resolve, reject) => {
      let inputFailed = false;
      const child = execFile(this.helperPath, [operation], { encoding: 'utf8', maxBuffer: 262_144, windowsHide: true },
        (error, stdout, stderr) => {
          const executionState = error?.signal ? 'unknown' : 'completed';
          if (inputFailed) {
            reject(new MacosHelperServiceError('unavailable', executionState));
            return;
          }
          if (error) {
            const codes = ['invalid-request', 'authorization-required', 'authorization-cancelled', 'certificate-state-uncertain', 'operation-failed', 'verification-failed'] as const;
            const code = codes.find((candidate) => candidate === stderr.trim());
            reject(new MacosHelperServiceError(code ?? (error.code === 'ENOENT' ? 'unavailable' : 'certificate-state-uncertain'), executionState));
            return;
          }
          try { resolve(JSON.parse(stdout)); }
          catch { reject(new MacosHelperServiceError('invalid-response', 'completed')); }
        });
      child.stdin?.once('error', () => {
        inputFailed = true;
        child.kill();
      });
      child.stdin?.end(input);
    });
  }

  async removeCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestService({ operation: 'certificate.remove', parameters: certificate });
    this.verifyCertificateResult(result, certificate.sha256, false);
  }

  viewCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const input = Buffer.from(JSON.stringify(certificate), 'utf8');
    if (input.length > 262_144) return Promise.reject(new MacosHelperServiceError('invalid-request'));
    return new Promise((resolve, reject) => {
      let finished = false;
      let output = '';
      let failureCode: MacosHelperServiceError['code'] | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: MacosHelperServiceError): void => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        if (error) reject(error);
        else resolve();
      };
      const child = execFile(this.helperPath, ['certificate.view'], { encoding: 'utf8', maxBuffer: 262_144, windowsHide: true },
        (error, _stdout, stderr) => {
          if (finished) return;
          const code = failureCode ?? (stderr.trim() === 'invalid-request' ? 'invalid-request'
            : error?.code === 'ENOENT' ? 'unavailable' : 'operation-failed');
          finish(new MacosHelperServiceError(code, error?.signal ? 'unknown' : 'completed'));
        });
      const stopViewer = (code: MacosHelperServiceError['code']): void => {
        if (finished || failureCode) return;
        failureCode = code;
        clearTimeout(deadline);
        child.kill();
      };
      deadline = setTimeout(() => stopViewer('timeout'), 15_000);
      child.stdout?.on('data', (chunk: Buffer | string) => {
        if (finished || failureCode) return;
        output += String(chunk);
        if (Buffer.byteLength(output) > 262_144) {
          stopViewer('invalid-response');
          return;
        }
        if (!output.includes('\n')) return;
        try {
          const result: unknown = JSON.parse(output);
          if (typeof result !== 'object' || result === null || Array.isArray(result)
            || Object.keys(result).length !== 2 || !('sha256' in result) || result.sha256 !== certificate.sha256
            || !('opened' in result) || result.opened !== true) throw new Error('Invalid certificate viewer response.');
          finish();
        } catch {
          stopViewer('invalid-response');
        }
      });
      child.stdin?.once('error', () => stopViewer('unavailable'));
      child.stdin?.end(input);
    });
  }

  private verifyCertificateResult(value: unknown, sha256: string, present: boolean): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 2
      || !('sha256' in value) || value.sha256 !== sha256 || !('present' in value) || value.present !== present) {
      throw new MacosHelperServiceError('invalid-response', 'completed');
    }
  }

  private requestService(request: MacosHelperServiceRequest): Promise<unknown> {
    const requestId = randomUUID();
    const frame = Buffer.from(JSON.stringify({ protocolVersion: 1, requestId, ...request }) + '\n', 'utf8');
    if (frame.length > 262_144) return Promise.reject(new MacosHelperServiceError('invalid-request'));
    return new Promise((resolve, reject) => {
      const connection = createConnection(this.socketPath);
      let response = Buffer.alloc(0);
      let finished = false;
      let requestSent = false;
      const deadline = setTimeout(() => finish(new MacosHelperServiceError('timeout', requestSent ? 'unknown' : 'completed')), 30_000);

      function finish(error?: MacosHelperServiceError, value?: unknown): void {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        connection.destroy();
        if (error) reject(new MacosHelperServiceError(error.code, error.executionState, request.operation));
        else resolve(value);
      }

      function finishResponse(): void {
        const newline = response.indexOf(0x0A);
        if (newline === -1 || newline !== response.length - 1) {
          finish(new MacosHelperServiceError('invalid-response'));
          return;
        }
        try {
          finish(undefined, parseMacosHelperServiceReply(response.subarray(0, newline), requestId));
        } catch (error) {
          finish(error instanceof MacosHelperServiceError
            ? error : new MacosHelperServiceError('invalid-response'));
        }
      }

      connection.once('connect', () => {
        requestSent = true;
        connection.write(frame);
      });
      connection.on('data', (chunk: Buffer) => {
        if (finished) return;
        if (response.length + chunk.length > 262_144) {
          finish(new MacosHelperServiceError('invalid-response'));
          return;
        }
        response = Buffer.concat([response, chunk]);
        const newline = response.indexOf(0x0A);
        if (newline !== -1 && newline !== response.length - 1) {
          finish(new MacosHelperServiceError('invalid-response'));
        }
      });
      connection.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET' && response.includes(0x0A)) finishResponse();
        else finish(new MacosHelperServiceError('unavailable', requestSent ? 'unknown' : 'completed'));
      });
      connection.once('end', finishResponse);
    });
  }
}