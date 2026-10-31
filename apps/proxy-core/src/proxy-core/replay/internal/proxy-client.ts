import { once } from 'node:events';
import * as http from 'node:http';
import * as http2 from 'node:http2';
import { pipeline } from 'node:stream/promises';
import type { TLSSocket } from 'node:tls';

import type { ReplaySendOptions } from '../interfaces';
import * as ReplayUtils from '../utils';
import { connectAuthority, openProxyTunnel } from './tunnel';

/**
 * 以客户端身份把一条原始请求经本地代理发送出去。
 *
 * 返回时请求已写入代理连接；响应与发送后的失败由新 Capture 行承载，
 * 异步错误只回调给调用方记诊断。
 */
export class ProxyClient {
  /** 发送一次重放；h2 只支持 HTTPS 目标。 */
  async send(options: ReplaySendOptions): Promise<void> {
    if (options.request.protocol === 'h2') {
      if (!options.request.url.startsWith('https:')) {
        throw new Error('HTTP/2 replay requires an HTTPS target.');
      }
      await this.sendH2(options);
      return;
    }
    await this.sendH1(options);
  }

  /** HTTP/1.x：明文走 absolute-form，HTTPS 先 CONNECT 再在隧道内发 origin-form。 */
  private async sendH1(options: ReplaySendOptions): Promise<void> {
    const { port, request, abortSignal, openBody, onAsyncFailure } = options;
    const target = new URL(request.url);
    const headers = ReplayUtils.h1HeaderArray(request.headers);
    const setHost = ReplayUtils.hasHostHeader(request.headers);
    const tunnel = target.protocol === 'https:'
      ? await openProxyTunnel(port, target, 'h1', abortSignal)
      : null;
    const clientRequest = http.request({
      // agent:false 会让 Node 忽略 createConnection 另开 TCP 连接，隧道必须走专用 agent。
      agent: tunnel === null ? false : tunnelAgent(tunnel),
      host: '127.0.0.1',
      port,
      method: request.method,
      path: tunnel === null ? request.url : `${target.pathname}${target.search}`,
      headers,
      setHost,
    });
    clientRequest.on('error', (error) => onAsyncFailure(asError(error)));
    clientRequest.once('response', (response) => {
      response.resume();
    });
    const cancel = (): void => {
      clientRequest.destroy(new Error('The replay was cancelled.'));
    };
    abortSignal.addEventListener('abort', cancel, { once: true });
    try {
      if (openBody !== null) {
        await pipeline(openBody(), clientRequest);
      } else {
        clientRequest.end();
        await once(clientRequest, 'finish');
      }
    } finally {
      abortSignal.removeEventListener('abort', cancel);
    }
  }

  /** HTTP/2：CONNECT + ALPN h2，然后用捕获的伪首部与普通头开一条 stream。 */
  private async sendH2(options: ReplaySendOptions): Promise<void> {
    const { port, request, abortSignal, openBody, onAsyncFailure } = options;
    const target = new URL(request.url);
    const tunnel = await openProxyTunnel(port, target, 'h2', abortSignal);
    const client = http2.connect(`https://${connectAuthority(target)}`, {
      createConnection: () => tunnel,
    });
    client.on('error', (error) => onAsyncFailure(asError(error)));
    const stream = client.request(ReplayUtils.h2Headers(request.headers, request, target));
    stream.on('error', (error) => onAsyncFailure(asError(error)));
    stream.once('response', () => {
      stream.resume();
    });
    stream.once('close', () => client.close());
    const cancel = (): void => {
      stream.destroy(new Error('The replay was cancelled.'));
    };
    abortSignal.addEventListener('abort', cancel, { once: true });
    try {
      if (openBody !== null) {
        await pipeline(openBody(), stream);
      } else {
        stream.end();
        await once(stream, 'finish');
      }
    } finally {
      abortSignal.removeEventListener('abort', cancel);
    }
  }
}

/** 把未知错误收敛成 Error，供诊断使用。 */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** 让 http 客户端复用 CONNECT 隧道；`agent:false` 会忽略 createConnection 另开连接。 */
function tunnelAgent(tunnel: TLSSocket): http.Agent {
  const agent = new http.Agent({ keepAlive: false });
  agent.createConnection = () => tunnel;
  return agent;
}
