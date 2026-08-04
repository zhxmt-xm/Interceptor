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
  ): Promise<TlsProbeResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: TlsProbeResult): void => {
        if (settled) {
          return;
        }
        settled = true;
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
    });
  }
}