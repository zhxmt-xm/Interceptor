import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import * as https from 'node:https';
import * as http2 from 'node:http2';
import type { OutgoingHttpHeaders } from 'node:http';
import type { TLSSocket } from 'node:tls';

/**
 * Composer 出站请求服务：由 Renderer 手工构造的请求经 composer.send 命令到达 Core，
 * 用 Node 原生 http/https（HTTP/1.1）或 http2（h2）执行并返回响应元数据、有界正文与
 * 真实 TLS/ALPN/证书信息。请求是用户主动发起的调试动作（同代理数据面能力），因此
 * 允许自签证书（rejectUnauthorized=false）但如实回传证书信息供用户检视。
 */

/** 响应正文上限（1 MiB，对齐 core-protocol MAX_BODY_CHUNK_BYTES 单消息上限）；超出丢弃并置 truncated。 */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export interface ComposerHeaderPair {
  readonly name: string;
  readonly value: string;
}

export interface ComposerRequestInput {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly ComposerHeaderPair[];
  readonly body?: string;
  readonly protocol: 'auto' | 'http/1.1' | 'h2';
  readonly timeoutMs?: number;
}

export interface ComposerTlsInfo {
  readonly protocol: string;
  readonly cipher: string;
  readonly alpn: string;
  readonly subject: string;
  readonly issuer: string;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface ComposerResponseOutput {
  readonly ok: boolean;
  readonly error?: string;
  readonly status: number;
  readonly statusText: string;
  readonly httpVersion: string;
  readonly headers: ComposerHeaderPair[];
  readonly body: Uint8Array;
  readonly bodyTruncated: boolean;
  readonly totalBytes: number;
  readonly durationMs: number;
  readonly tls: ComposerTlsInfo | null;
  readonly remoteAddress: string | null;
}

/** 累加响应正文并施加上限；返回截断状态与总字节数。 */
class BoundedBody {
  private readonly chunks: Buffer[] = [];
  private kept = 0;
  private total = 0;
  private truncatedFlag = false;

  push(chunk: Buffer): void {
    this.total += chunk.length;
    if (this.kept >= MAX_RESPONSE_BYTES) {
      this.truncatedFlag = true;
      return;
    }
    const room = MAX_RESPONSE_BYTES - this.kept;
    if (chunk.length <= room) {
      this.chunks.push(chunk);
      this.kept += chunk.length;
    } else {
      this.chunks.push(chunk.subarray(0, room));
      this.kept += room;
      this.truncatedFlag = true;
    }
  }

  get bytes(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.chunks));
  }

  get truncated(): boolean {
    return this.truncatedFlag;
  }

  get totalBytes(): number {
    return this.total;
  }
}

export class ComposerService {
  /** 执行一次出站请求；网络错误以 ok=false + error 返回（不抛出），供 UI 展示。 */
  async send(request: ComposerRequestInput): Promise<ComposerResponseOutput> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return this.failure('Invalid URL.', 0);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return this.failure('Only http and https URLs are supported.', 0);
    }
    const timeoutMs = Math.min(
      Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
      MAX_TIMEOUT_MS,
    );
    const useH2 = request.protocol === 'h2' && url.protocol === 'https:';
    try {
      return useH2
        ? await this.sendH2(url, request, timeoutMs)
        : await this.sendH1(url, request, timeoutMs);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : String(error), 0);
    }
  }

  private failure(message: string, durationMs: number): ComposerResponseOutput {
    return {
      ok: false,
      error: message,
      status: 0,
      statusText: '',
      httpVersion: '',
      headers: [],
      body: new Uint8Array(0),
      bodyTruncated: false,
      totalBytes: 0,
      durationMs,
      tls: null,
      remoteAddress: null,
    };
  }

  private sendH1(
    url: URL,
    request: ComposerRequestInput,
    timeoutMs: number,
  ): Promise<ComposerResponseOutput> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const start = Date.now();
      const clientRequest = transport.request(
        url,
        {
          method: request.method,
          headers: buildOutgoingHeaders(request.headers),
          rejectUnauthorized: false,
        },
        (response) => {
          const body = new BoundedBody();
          response.on('data', (chunk: Buffer) => body.push(chunk));
          response.on('end', () => {
            const socket = response.socket as TLSSocket;
            resolve({
              ok: true,
              status: response.statusCode ?? 0,
              statusText: response.statusMessage ?? '',
              httpVersion: `HTTP/${response.httpVersion}`,
              headers: rawHeaderPairs(response.rawHeaders),
              body: body.bytes,
              bodyTruncated: body.truncated,
              totalBytes: body.totalBytes,
              durationMs: Date.now() - start,
              tls: isHttps ? readTls(socket) : null,
              remoteAddress: response.socket?.remoteAddress ?? null,
            });
          });
          response.on('error', reject);
        },
      );
      clientRequest.on('error', reject);
      clientRequest.setTimeout(timeoutMs, () => {
        clientRequest.destroy(new Error('Composer request timed out.'));
      });
      if (request.body) {
        clientRequest.write(Buffer.from(request.body, 'utf8'));
      }
      clientRequest.end();
    });
  }

  private sendH2(
    url: URL,
    request: ComposerRequestInput,
    timeoutMs: number,
  ): Promise<ComposerResponseOutput> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const client = http2.connect(url.origin, {
        rejectUnauthorized: false,
        ALPNProtocols: ['h2'],
      });
      let settled = false;
      const finish = (
        outcome: ComposerResponseOutput | null,
        error?: unknown,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        client.close();
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else if (outcome) {
          resolve(outcome);
        }
      };

      client.on('error', (error) => finish(null, error));

      const requestHeaders: http2.OutgoingHttpHeaders = {
        ':method': request.method,
        ':path': `${url.pathname}${url.search}`,
        ':scheme': 'https',
        ':authority': url.host,
        ...buildOutgoingHeaders(request.headers),
      };
      const stream = client.request(requestHeaders);
      const body = new BoundedBody();
      let status = 0;
      let headerPairs: ComposerHeaderPair[] = [];

      stream.on('response', (headers) => {
        status = Number(headers[':status']) || 0;
        headerPairs = h2HeaderPairs(headers);
      });
      stream.on('data', (chunk: Buffer) => body.push(chunk));
      stream.on('end', () => {
        const socket = client.socket as TLSSocket;
        finish({
          ok: true,
          status,
          statusText: '',
          httpVersion: 'h2',
          headers: headerPairs,
          body: body.bytes,
          bodyTruncated: body.truncated,
          totalBytes: body.totalBytes,
          durationMs: Date.now() - start,
          tls: readTls(socket),
          remoteAddress: client.socket?.remoteAddress ?? null,
        });
      });
      stream.on('error', (error) => finish(null, error));
      stream.setTimeout(timeoutMs, () => {
        finish(null, new Error('Composer request timed out.'));
      });
      if (request.body) {
        stream.write(Buffer.from(request.body, 'utf8'));
      }
      stream.end();
    });
  }
}

/** 把用户提供的 header 对合并为 Node 出站 header 对象（同名合并为数组）。 */
function buildOutgoingHeaders(
  pairs: readonly ComposerHeaderPair[],
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const pair of pairs) {
    const key = pair.name;
    if (!key) {
      continue;
    }
    const existing = headers[key];
    if (existing === undefined) {
      headers[key] = pair.value;
    } else if (Array.isArray(existing)) {
      existing.push(pair.value);
    } else {
      headers[key] = [String(existing), pair.value];
    }
  }
  return headers;
}

/** 把 HTTP/1.1 rawHeaders 扁平数组转为有序 name/value 对。 */
function rawHeaderPairs(raw: string[]): ComposerHeaderPair[] {
  const pairs: ComposerHeaderPair[] = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    pairs.push({ name: raw[index] ?? '', value: raw[index + 1] ?? '' });
  }
  return pairs;
}

/** 把 HTTP/2 响应头对象转为 name/value 对，跳过伪头（:status 等）。 */
function h2HeaderPairs(headers: http2.IncomingHttpHeaders): ComposerHeaderPair[] {
  const pairs: ComposerHeaderPair[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(':') || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        pairs.push({ name, value: item });
      }
    } else {
      pairs.push({ name, value: String(value) });
    }
  }
  return pairs;
}

/** 从 TLS socket 提取真实协议版本/加密套件/ALPN/证书主题信息。 */
function readTls(socket: TLSSocket | undefined): ComposerTlsInfo | null {
  if (!socket || typeof socket.getProtocol !== 'function') {
    return null;
  }
  const cipher = socket.getCipher?.();
  const cert = socket.getPeerCertificate?.();
  const subject = cert && typeof cert.subject === 'object' ? dnField(cert.subject.CN) : '';
  const issuer = cert && typeof cert.issuer === 'object' ? dnField(cert.issuer.CN) : '';
  return {
    protocol: socket.getProtocol() ?? '',
    cipher: cipher?.name ?? '',
    alpn: typeof socket.alpnProtocol === 'string' ? socket.alpnProtocol : 'http/1.1',
    subject,
    issuer,
    validFrom: cert?.valid_from ?? '',
    validTo: cert?.valid_to ?? '',
  };
}

/** 证书 DN 字段可能是 string 或 string[]（多值）；规范化为单个字符串。 */
function dnField(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value ?? '';
}
