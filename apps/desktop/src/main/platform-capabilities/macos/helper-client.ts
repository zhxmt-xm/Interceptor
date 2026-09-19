import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';

import type { MacosCertificatePayload, MacosHelperServiceRequest, MacosHelperServiceStatus, MacosSystemProxySnapshot } from '../interfaces';
import { MacosHelperServiceError } from '../internal/errors';
import { parseMacosHelperServiceReply, parseMacosHelperServiceStatus, parseMacosSystemProxySnapshot } from './utils';

/** Uses the native service protocol without installing it or requesting system authorization. */
export class MacosHelperServiceClient {
  constructor(private readonly socketPath = '/Library/Application Support/Interceptor/PlatformHelper/service.sock') {}

  async getStatus(): Promise<MacosHelperServiceStatus> {
    return parseMacosHelperServiceStatus(await this.requestService({ operation: 'status' }));
  }

  async readSystemProxySnapshot(): Promise<MacosSystemProxySnapshot> {
    return this.parseProxySnapshot(await this.requestService({ operation: 'system-proxy.read' }));
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
      throw new MacosHelperServiceError('invalid-response');
    }
  }

  async importCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestService({ operation: 'certificate.import', parameters: certificate });
    this.verifyCertificateResult(result, certificate.sha256, true);
  }

  async removeCertificate(certificate: MacosCertificatePayload): Promise<void> {
    const result = await this.requestService({ operation: 'certificate.remove', parameters: certificate });
    this.verifyCertificateResult(result, certificate.sha256, false);
  }

  private verifyCertificateResult(value: unknown, sha256: string, present: boolean): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 2
      || !('sha256' in value) || value.sha256 !== sha256 || !('present' in value) || value.present !== present) {
      throw new MacosHelperServiceError('invalid-response');
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
      const deadline = setTimeout(() => finish(new MacosHelperServiceError('timeout')), 30_000);

      function finish(error?: MacosHelperServiceError, value?: unknown): void {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        connection.destroy();
        if (error) reject(error);
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

      connection.once('connect', () => connection.write(frame));
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
        else finish(new MacosHelperServiceError('unavailable'));
      });
      connection.once('end', finishResponse);
    });
  }
}