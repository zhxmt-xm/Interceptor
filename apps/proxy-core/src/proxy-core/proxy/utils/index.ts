import { promisify } from 'node:util';
import zlib from 'node:zlib';

import type { CompletedRequest } from 'mockttp';
import WebSocket, { type RawData } from 'ws';

import type {
  MatchContext,
  SyntheticResponseInit,
} from '../../rules/interfaces';
import type { HeaderInput, HeaderKind } from '../../storage/interfaces';
import { SUPPORTED_ENCODINGS } from '../proxy-constants';
import type {
  DecodeResult,
  ProxyPassThroughResponse,
  ProxyResponseMessageResult,
  ProxyTarget,
} from '../interfaces';

/** 按 content-encoding 逆序延迟解码正文，失败时返回原始字节。 */
export async function decodeBody(
  data: Uint8Array,
  contentEncoding: string | undefined,
): Promise<DecodeResult> {
  const encodings = parseEncodings(contentEncoding);
  if (encodings.length === 0) {
    return { status: 'skipped', data };
  }
  if (encodings.some((encoding) => !SUPPORTED_ENCODINGS.has(encoding))) {
    return { status: 'skipped', data };
  }
  let current = data;
  for (let index = encodings.length - 1; index >= 0; index -= 1) {
    const encoding = encodings[index];
    if (encoding === undefined) {
      continue;
    }
    try {
      current = await decodeOne(current, encoding);
    } catch {
      return { status: 'failed', data };
    }
  }
  return { status: 'ok', data: current };
}

/** 解析并规范化逗号分隔的 content-encoding。 */
function parseEncodings(header: string | undefined): string[] {
  if (!header) {
    return [];
  }
  return header
    .split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding.length > 0 && encoding !== 'identity');
}

/** 解码一个已知 content-encoding 层。 */
async function decodeOne(
  data: Uint8Array,
  encoding: string,
): Promise<Uint8Array> {
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return new Uint8Array(await promisify(zlib.gunzip)(data));
    case 'deflate':
      return new Uint8Array(await inflateMaybeRaw(data));
    case 'br':
      return new Uint8Array(await promisify(zlib.brotliDecompress)(data));
    default:
      throw new Error(`unsupported content-encoding: ${encoding}`);
  }
}

/** 兼容 zlib 包裹和裸 DEFLATE 流。 */
async function inflateMaybeRaw(data: Uint8Array): Promise<Buffer> {
  try {
    return await promisify(zlib.inflate)(data);
  } catch {
    return await promisify(zlib.inflateRaw)(data);
  }
}

/** 将单段正文包装为 TemporaryBodyStore 接受的异步序列。 */
export async function* singleChunk(
  buffer: Uint8Array,
): AsyncIterable<Uint8Array> {
  yield buffer;
}

/** 将 Mockttp 请求映射为规则 matcher 上下文。 */
export function buildRequestContext(request: CompletedRequest): MatchContext {
  const target = parseTarget(request.url);
  return {
    request: {
      method: request.method,
      url: request.url,
      host: target.hostname,
      path: target.path,
      query: safeSearchParams(request.url),
      headers: request.headers,
      mime: readHeader(request.headers, 'content-type'),
    },
  };
}

/** 将 Mockttp 请求与响应映射为响应阶段规则上下文。 */
export function buildResponseContext(
  request: CompletedRequest,
  response: ProxyPassThroughResponse,
): MatchContext {
  return {
    request: buildRequestContext(request).request,
    response: {
      statusCode: response.statusCode,
      headers: response.headers,
      mime: readHeader(response.headers, 'content-type'),
    },
  };
}

/** 将规则 synthetic response 映射为 Mockttp callback 结果。 */
export function toCallbackResponse(
  response: SyntheticResponseInit,
): ProxyResponseMessageResult {
  return {
    statusCode: response.statusCode,
    headers: toMockttpHeaders(response.headers),
    ...(response.body !== undefined ? { body: response.body } : {}),
  };
}

/** 过滤 undefined header 值，得到 Mockttp 接受的 header 对象。 */
export function toMockttpHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

/** 安全解析 URL query，畸形 URL 返回空集合。 */
export function safeSearchParams(rawUrl: string): URLSearchParams {
  try {
    return new URL(rawUrl).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** 返回指定毫秒后完成的 Promise。 */
export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Convert Mockttp's monotonic event timestamp to epoch milliseconds. */
export function timingEventToEpoch(
  timing: { startTime: number; startTimestamp: number },
  eventTimestamp: number | undefined,
): number | undefined {
  return eventTimestamp === undefined
    ? undefined
    : timing.startTime + Math.max(0, eventTimestamp - timing.startTimestamp);
}

/** 从完整或畸形 URL 推导代理目标。 */
export function parseTarget(rawUrl: string): ProxyTarget {
  try {
    const url = new URL(rawUrl);
    const scheme = url.protocol.replace(/:$/, '');
    const port = url.port ? Number(url.port) : scheme === 'https' ? 443 : 80;
    return {
      scheme,
      hostname: url.hostname,
      port,
      path: `${url.pathname}${url.search}`,
    };
  } catch {
    return { scheme: 'http', hostname: '', port: 80, path: rawUrl };
  }
}

/** 将 Node HTTP version 映射为 Capture protocol。 */
export function httpVersionToProtocol(version: string | undefined): string {
  return version?.startsWith('2') ? 'h2' : 'http/1.1';
}

/** 将 Mockttp raw header tuples 映射为 Storage header 输入。 */
export function toHeaderInputs(
  kind: HeaderKind,
  rawHeaders: readonly (readonly [string, string])[] | undefined,
): HeaderInput[] {
  if (!rawHeaders) {
    return [];
  }
  return rawHeaders.map(([name, value]) =>
    name.startsWith(':')
      ? { kind, name, value, isPseudo: true }
      : { kind, name, value });
}

/** 读取 header 首值并移除参数部分。 */
export function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw.split(';', 1)[0]?.trim() || undefined : undefined;
}

/** 读取有效非负 content-length。 */
export function readContentLength(
  headers: Record<string, string | string[] | undefined>,
): number {
  const value = headers['content-length'];
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** 将 Mockttp 相对时间映射为 wall-clock 时间戳。 */
export function toWallClockTimestamp(
  startTime: number,
  startTimestamp: number,
  eventTimestamp: number,
): number {
  return Math.round(startTime + Math.max(0, eventTimestamp - startTimestamp));
}

/** 将二进制 payload 转为可编辑空格分隔 hex。 */
export function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

/** 严格解析用户编辑的十六进制 payload。 */
export function parseHexString(value: string): Buffer {
  const compact = value.replace(/\s+/g, '');
  if (compact.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(compact)) {
    throw new Error('Edited binary WebSocket payload must be hexadecimal bytes.');
  }
  return Buffer.from(compact, 'hex');
}

/** 生成单进程内足够唯一的捕获实体 ID 后缀。 */
export function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 将 http/https URL 转换为 ws/wss URL。 */
export function toWebSocketUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`Unsupported WebSocket protocol: ${url.protocol}`);
  }
  return url;
}

/** 解析 Sec-WebSocket-Protocol 候选列表。 */
export function readProtocols(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value ?? '';
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

/** 过滤握手专属 header，生成安全的上游转发 header。 */
export function forwardedHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const blocked = new Set([
    'connection',
    'host',
    'upgrade',
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-extensions',
    'sec-websocket-protocol',
  ]);
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !blocked.has(name.toLowerCase())) {
      result[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return result;
}

/** 等待上游 WebSocket open，首次错误时拒绝。 */
export function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('open', opened);
      socket.off('error', failed);
    };
    const opened = (): void => {
      cleanup();
      resolve();
    };
    const failed = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.once('open', opened);
    socket.once('error', failed);
  });
}

/** 将 ws RawData 归一化为 Buffer。 */
export function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  const exhaustive: never = data;
  throw new Error(`Unsupported WebSocket payload: ${String(exhaustive)}`);
}

/** 发送应用消息并把 callback 转为 Promise。 */
export function sendMessage(
  socket: WebSocket,
  content: Uint8Array,
  isBinary: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(content, { binary: isBinary }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/** 在连接打开时透传 ping/pong 控制帧。 */
export function sendControl(
  socket: WebSocket,
  kind: 'ping' | 'pong',
  data: Buffer,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket[kind](data, undefined, () => undefined);
  }
}

/** 以合法 close code 关闭对端，否则发送无 code close。 */
export function closePeer(
  socket: WebSocket,
  code: number,
  reason: Buffer,
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  if (code >= 1000 && code <= 4999 && ![1004, 1005, 1006].includes(code)) {
    socket.close(code, reason);
  } else {
    socket.close();
  }
}
