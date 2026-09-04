import * as tls from 'node:tls';

import type { TlsProbeResult } from './interfaces';
import * as ConnectionUtils from './utils';

/** 对目标建立只握手 TLS 连接并返回协议、套件、ALPN 与证书链。 */
export class TlsProbeService {
  /** 发起一次 TLS 探测；仅在调用方显式提供 timeout 时设置期限。 */
  probe(
    host: string,
    port: number,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<TlsProbeResult> {
    if (abortSignal?.aborted) {
      return Promise.resolve(ConnectionUtils.failure('The TLS probe was cancelled.'));
    }
    return new Promise((resolve) => {
      let settled = false;
      let removeAbortListener = (): void => undefined;
      const finish = (result: TlsProbeResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        removeAbortListener();
        resolve(result);
      };

      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          ALPNProtocols: ['h2', 'http/1.1'],
          rejectUnauthorized: false,
          ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
        },
        () => {
          finish({
            ok: true,
            protocol: socket.getProtocol() ?? '',
            cipher: socket.getCipher()?.name ?? '',
            alpn: typeof socket.alpnProtocol === 'string'
              ? socket.alpnProtocol
              : '',
            authorized: socket.authorized,
            authorizationError: socket.authorizationError
              ? String(socket.authorizationError)
              : undefined,
            certificates: ConnectionUtils.collectChain(socket),
          });
          socket.end();
        },
      );

      socket.on('error', (error) =>
        finish(ConnectionUtils.failure(error.message)));
      socket.on('timeout', () => {
        socket.destroy();
        finish(ConnectionUtils.failure('The TLS connection timed out.'));
      });
      const cancel = (): void => {
        socket.destroy();
        finish(ConnectionUtils.failure('The TLS probe was cancelled.'));
      };
      if (abortSignal !== undefined) {
        abortSignal.addEventListener('abort', cancel, { once: true });
        removeAbortListener = () => abortSignal.removeEventListener('abort', cancel);
        if (abortSignal.aborted) cancel();
      }
    });
  }
}