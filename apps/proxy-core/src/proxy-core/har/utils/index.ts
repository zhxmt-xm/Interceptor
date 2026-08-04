import { isUtf8 } from 'node:buffer';
import path from 'node:path';

import type { CaptureHeader } from '@interceptor/core-protocol';

import type { HarRedactionOptions } from '../interfaces';
import { InvalidHarError } from '../internal/errors';

/** 移除 HTTP/2 pseudo-header，并按选项遮罩认证与 Cookie 值。 */
export function redactHeaders(
  headers: readonly CaptureHeader[],
  options: HarRedactionOptions,
  phase: 'request' | 'response',
): CaptureHeader[] {
  const wireHeaders = phase === 'request'
    ? applyRequestRuleEffects(headers)
    : headers.filter((header) => !header.ruleEffect);
  return wireHeaders
    .filter((header) => !header.isPseudo)
    .map((header) => {
      const name = header.name.toLowerCase();
      const redactAuthorization = options.authorization &&
        (name === 'authorization' || name === 'proxy-authorization');
      const redactCookie = options.cookies &&
        (name === 'cookie' || name === 'set-cookie');
      return redactAuthorization || redactCookie
        ? { name: header.name, value: '[REDACTED]' }
        : { name: header.name, value: header.value };
    });
}

/** 将 request 规则操作按执行顺序应用到客户端原始 headers，得到实际上游 headers。 */
function applyRequestRuleEffects(
  headers: readonly CaptureHeader[],
): CaptureHeader[] {
  const effective = headers
    .filter((header) => !header.ruleEffect)
    .map((header) => ({ ...header }));
  for (const effect of headers.filter((header) => header.ruleEffect)) {
    if (effect.ruleEffect === 'replace' || effect.ruleEffect === 'remove') {
      const index = effective.findIndex(
        (header) =>
          header.name.toLowerCase() === effect.name.toLowerCase()
          && header.value === effect.value,
      );
      if (index >= 0) {
        effective.splice(index, 1);
      }
    } else {
      effective.push({ name: effect.name, value: effect.value });
    }
  }
  return effective;
}

/** 将 Capture header 投影为 HAR 标准 name/value 对。 */
export function toHarHeader(
  header: CaptureHeader,
): { name: string; value: string } {
  return { name: header.name, value: header.value };
}

/** 按大小写不敏感名称读取首个 header 值。 */
export function headerValue(
  headers: readonly CaptureHeader[],
  name: string,
): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}

/** 将内部协议标识映射为 HAR httpVersion。 */
export function toHarHttpVersion(protocol: string): string {
  const normalized = protocol.toLowerCase();
  if (normalized === 'h2' || normalized.includes('http/2')) {
    return 'HTTP/2';
  }
  if (normalized === 'h3' || normalized.includes('http/3')) {
    return 'HTTP/3';
  }
  return 'HTTP/1.1';
}

/** 将 URLSearchParams 保序映射为 HAR queryString。 */
export function readQueryString(
  url: string,
): Array<{ name: string; value: string }> {
  return [...new URL(url).searchParams].map(([name, value]) => ({
    name,
    value,
  }));
}

/** 常见承载凭据/令牌的 URL query 参数名（小写，大小写不敏感匹配）。 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'auth',
  'apikey',
  'api_key',
  'key',
  'client_secret',
  'secret',
  'password',
  'passwd',
  'pwd',
  'sig',
  'signature',
  'sessionid',
  'session',
  'code',
]);

/** 判断 query 参数名是否为敏感令牌类参数。 */
function isSensitiveQueryParam(name: string): boolean {
  return SENSITIVE_QUERY_PARAMS.has(name.toLowerCase());
}

/** 遮罩 URL 中的敏感 query 令牌，保留结构和其余参数顺序。 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const name of [...parsed.searchParams.keys()]) {
      if (isSensitiveQueryParam(name)) {
        parsed.searchParams.set(name, '[REDACTED]');
        changed = true;
      }
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}

/** 按敏感令牌参数遮罩 HAR queryString 值。 */
export function redactQueryString(
  entries: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  return entries.map((entry) =>
    isSensitiveQueryParam(entry.name)
      ? { name: entry.name, value: '[REDACTED]' }
      : entry);
}

/** 将请求正文编码为文本或带私有 encoding 标记的 base64 postData。 */
export function toHarPostData(
  body: Buffer,
  mimeType = 'application/octet-stream',
): Record<string, unknown> {
  if (isTextualBody(body, mimeType)) {
    return { mimeType, text: body.toString('utf8') };
  }
  return { mimeType, text: body.toString('base64'), _encoding: 'base64' };
}

/** 将响应正文编码为标准 HAR content 对象。 */
export function toHarContent(
  body: Buffer | undefined,
  size: number,
  mimeType: string,
): Record<string, unknown> {
  if (!body) {
    return { size, mimeType };
  }
  if (isTextualBody(body, mimeType)) {
    return { size, mimeType, text: body.toString('utf8') };
  }
  return {
    size,
    mimeType,
    text: body.toString('base64'),
    encoding: 'base64',
  };
}

/** 判断字节是否可按 MIME 安全表示为 UTF-8 文本。 */
function isTextualBody(body: Buffer, mimeType: string): boolean {
  return isUtf8(body) && (
    mimeType.startsWith('text/') ||
    /(?:json|xml|javascript|graphql|x-www-form-urlencoded)/i.test(mimeType)
  );
}

/** 将一个 Buffer 包装成 BodyStore 接受的单块异步序列。 */
export async function* singleChunk(
  body: Buffer,
): AsyncGenerator<Uint8Array> {
  yield body;
}

/** 在任务已取消时抛出稳定 AbortError。 */
export function throwIfAborted(abortSignal: AbortSignal): void {
  if (abortSignal.aborted) {
    throw abortSignal.reason instanceof Error
      ? abortSignal.reason
      : new DOMException('The HAR transfer was cancelled.', 'AbortError');
  }
}

/** 要求 Core 收到的文件路径为绝对路径和预期扩展名。 */
export function assertTransferPath(
  filePath: string,
  extension: string,
): void {
  if (
    !path.isAbsolute(filePath) ||
    path.extname(filePath).toLowerCase() !== extension
  ) {
    throw new InvalidHarError(
      `Transfer path must be an absolute ${extension} file.`,
    );
  }
}