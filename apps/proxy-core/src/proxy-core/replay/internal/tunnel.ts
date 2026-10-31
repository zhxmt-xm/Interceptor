import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import * as net from 'node:net';
import * as tls from 'node:tls';

import type { ReplayProtocol } from '../interfaces';
import {
  REPLAY_CONNECT_MAX_HEADER_BYTES,
  REPLAY_CONNECT_TIMEOUT_MS,
} from './constants';

/**
 * 经本地代理建立 CONNECT 隧道并完成 TLS 握手。
 *
 * 对代理来说这就是一个普通客户端：CONNECT 拿隧道，再在隧道里和 MITM 端点握手。
 */
export async function openProxyTunnel(
  proxyPort: number,
  target: URL,
  protocol: ReplayProtocol,
  abortSignal: AbortSignal,
): Promise<tls.TLSSocket> {
  const authority = connectAuthority(target);
  const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
  try {
    await once(socket, 'connect');
    if (abortSignal.aborted) {
      throw new Error('The replay was cancelled.');
    }
    socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    await readConnectResponse(socket);
    const secureSocket = tls.connect({
      socket,
      servername: target.hostname,
      rejectUnauthorized: false,
      ALPNProtocols: protocol === 'h2' ? ['h2'] : ['http/1.1'],
    });
    await once(secureSocket, 'secureConnect');
    return secureSocket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

/** CONNECT 目标的 host:port；IPv6 需要方括号。 */
export function connectAuthority(target: URL): string {
  const host = target.hostname.includes(':')
    ? `[${target.hostname}]`
    : target.hostname;
  const port = target.port || (target.protocol === 'https:' ? '443' : '80');
  return `${host}:${port}`;
}

/** 读取 CONNECT 应答头；非 200 或超时按失败处理，多余字节交回 TLS 层。 */
function readConnectResponse(socket: net.Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onData = (chunk: Buffer): void => {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf('\r\n\r\n');
      if (end === -1) {
        if (received.byteLength > REPLAY_CONNECT_MAX_HEADER_BYTES) {
          finish(new Error('The proxy CONNECT response header is too large.'));
        }
        return;
      }
      const head = received.subarray(0, end).toString('latin1');
      const status = Number(head.split(' ')[1]);
      const rest = received.subarray(end + 4);
      if (status !== 200) {
        finish(new Error(`The proxy refused the CONNECT tunnel with status ${status}.`));
        return;
      }
      if (rest.byteLength > 0) {
        socket.unshift(rest);
      }
      finish();
    };
    const onError = (error: Error): void => finish(error);
    const onClose = (): void => finish(new Error('The proxy closed the CONNECT tunnel.'));
    const timer = setTimeout(
      () => finish(new Error('The proxy CONNECT response timed out.')),
      REPLAY_CONNECT_TIMEOUT_MS,
    );
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}
