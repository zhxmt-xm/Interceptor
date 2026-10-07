import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import * as http2 from 'node:http2';
import * as https from 'node:https';
import type { TLSSocket } from 'node:tls';

import { HttpMessageService } from '../http-message/entry';
import { ResponseBody } from './internal/response-body';
import { TimingRecorder } from './internal/timing-recorder';
import type {
  ComposerHeaderPair,
  ComposerRequestInput,
  ComposerResponseOutput,
} from './interfaces';
import * as ComposerUtils from './utils';

/**
 * 执行 Renderer 主动构造的 HTTP/1.1 或 HTTP/2 请求，并返回完整正文、时序和 TLS 摘要。
 */
export class ComposerService {
  /** Composer 与代理规则共用的 replacement content bytes 构造器。 */
  private readonly httpMessageService: HttpMessageService;

  /** 使用生产共享实例；直接 new 的测试默认创建独立无状态实例。 */
  constructor(httpMessageService = new HttpMessageService()) {
    this.httpMessageService = httpMessageService;
  }

  /** 执行一次出站请求；网络错误转换为 ok=false 结果供 UI 展示。 */
  async send(
    request: ComposerRequestInput,
    abortSignal?: AbortSignal,
  ): Promise<ComposerResponseOutput> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return this.failure('Invalid URL.', 0);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return this.failure('Only http and https URLs are supported.', 0);
    }
    const timeoutMs = request.timeoutMs;
    const useH2 = request.protocol === 'h2' && url.protocol === 'https:';
    try {
      const headers = ComposerUtils.buildOutgoingHeaders(request.headers);
      const body = request.body === undefined
        ? undefined
        : await this.httpMessageService.buildContent(request.body, 'text', headers);
      return useH2
        ? await this.sendH2(url, request, headers, body, timeoutMs, abortSignal)
        : await this.sendH1(url, request, headers, body, timeoutMs, abortSignal);
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : String(error),
        0,
      );
    }
  }

  /** 构造不含响应数据的稳定失败结果。 */
  private failure(
    message: string,
    durationMs: number,
  ): ComposerResponseOutput {
    return {
      ok: false,
      error: message,
      status: 0,
      statusText: '',
      httpVersion: '',
      headers: [],
      body: new Uint8Array(0),
      totalBytes: 0,
      durationMs,
      timing: TimingRecorder.empty(durationMs),
      tls: null,
      remoteAddress: null,
    };
  }

  /** 通过 Node http/https 客户端发送 HTTP/1.1 请求。 */
  private sendH1(
    url: URL,
    request: ComposerRequestInput,
    headers: Record<string, string | string[]>,
    body: Uint8Array | undefined,
    timeoutMs: number | undefined,
    abortSignal: AbortSignal | undefined,
  ): Promise<ComposerResponseOutput> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const start = Date.now();
      const timingRecorder = new TimingRecorder();
      let settled = false;
      let removeAbortListener = (): void => undefined;
      const finish = (outcome: ComposerResponseOutput | null, error?: unknown): void => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else if (outcome) {
          resolve(outcome);
        }
      };
      const clientRequest = transport.request(
        url,
        {
          method: request.method,
          headers,
          agent: false,
          rejectUnauthorized: false,
        },
        (response) => {
          timingRecorder.markResponseStarted();
          const responseBody = new ResponseBody();
          response.on('data', (chunk: Buffer) => responseBody.push(chunk));
          response.on('end', () => {
            const socket = response.socket as TLSSocket;
            finish({
              ok: true,
              status: response.statusCode ?? 0,
              statusText: response.statusMessage ?? '',
              httpVersion: `HTTP/${response.httpVersion}`,
              headers: ComposerUtils.rawHeaderPairs(response.rawHeaders),
              body: responseBody.bytes,
              totalBytes: responseBody.totalBytes,
              durationMs: Date.now() - start,
              timing: timingRecorder.finish(),
              tls: isHttps ? ComposerUtils.readTls(socket) : null,
              remoteAddress: response.socket?.remoteAddress ?? null,
            });
          });
          response.on('error', (error) => finish(null, error));
        },
      );
      clientRequest.on('socket', (socket) => timingRecorder.observeSocket(socket));
      clientRequest.on('error', (error) => finish(null, error));
      const cancel = (): void => {
        clientRequest.destroy(new Error('Composer request was cancelled.'));
      };
      if (abortSignal !== undefined) {
        abortSignal.addEventListener('abort', cancel, { once: true });
        removeAbortListener = () => abortSignal.removeEventListener('abort', cancel);
        if (abortSignal.aborted) cancel();
      }
      if (timeoutMs !== undefined) {
        clientRequest.setTimeout(timeoutMs, () => {
          clientRequest.destroy(new Error('Composer request timed out.'));
        });
      }
      if (body !== undefined) {
        clientRequest.write(Buffer.from(body));
      }
      clientRequest.end(() => timingRecorder.markRequestSent());
    });
  }

  /** 通过 Node http2 client session 发送原生 HTTP/2 请求。 */
  private sendH2(
    url: URL,
    request: ComposerRequestInput,
    headers: Record<string, string | string[]>,
    body: Uint8Array | undefined,
    timeoutMs: number | undefined,
    abortSignal: AbortSignal | undefined,
  ): Promise<ComposerResponseOutput> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timingRecorder = new TimingRecorder();
      const client = http2.connect(url.origin, {
        rejectUnauthorized: false,
        ALPNProtocols: ['h2'],
      });
      client.on('socket', (socket) => timingRecorder.observeSocket(socket));
      let settled = false;
      let removeAbortListener = (): void => undefined;
      const finish = (
        outcome: ComposerResponseOutput | null,
        error?: unknown,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        removeAbortListener();
        if (error) {
          client.destroy();
          reject(error instanceof Error ? error : new Error(String(error)));
        } else if (outcome) {
          client.close();
          resolve(outcome);
        }
      };

      client.on('error', (error) => finish(null, error));
      const requestHeaders: http2.OutgoingHttpHeaders = {
        ...headers,
        ':method': request.method,
        ':path': `${url.pathname}${url.search}`,
        ':scheme': 'https',
        ':authority': url.host,
      };
      const stream = client.request(requestHeaders);
      const responseBody = new ResponseBody();
      let status = 0;
      let headerPairs: ComposerHeaderPair[] = [];

      stream.on('response', (headers) => {
        timingRecorder.markResponseStarted();
        status = Number(headers[':status']) || 0;
        headerPairs = ComposerUtils.h2HeaderPairs(headers);
      });
      stream.on('data', (chunk: Buffer) => responseBody.push(chunk));
      stream.on('end', () => {
        const socket = client.socket as TLSSocket;
        finish({
          ok: true,
          status,
          statusText: '',
          httpVersion: 'h2',
          headers: headerPairs,
          body: responseBody.bytes,
          totalBytes: responseBody.totalBytes,
          durationMs: Date.now() - start,
          timing: timingRecorder.finish(),
          tls: ComposerUtils.readTls(socket),
          remoteAddress: client.socket?.remoteAddress ?? null,
        });
      });
      stream.on('error', (error) => finish(null, error));
      if (timeoutMs !== undefined) {
        stream.setTimeout(timeoutMs, () => {
          finish(null, new Error('Composer request timed out.'));
        });
      }
      const cancel = (): void => {
        stream.destroy(new Error('Composer request was cancelled.'));
      };
      if (abortSignal !== undefined) {
        abortSignal.addEventListener('abort', cancel, { once: true });
        removeAbortListener = () => abortSignal.removeEventListener('abort', cancel);
        if (abortSignal.aborted) cancel();
      }
      if (body !== undefined) {
        stream.write(Buffer.from(body));
      }
      stream.end(() => timingRecorder.markRequestSent());
    });
  }
}