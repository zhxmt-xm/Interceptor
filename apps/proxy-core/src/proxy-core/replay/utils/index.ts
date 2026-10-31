import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureHeader,
} from '@interceptor/core-protocol';

import type { ReplayHeader, ReplayProtocol, ReplayRequest } from '../interfaces';

/** 把 Capture 的 protocol 映射为重放协议；WebSocket、Tunnel 与非 HTTP 返回 null。 */
export function replayProtocolOf(protocol: string): ReplayProtocol | null {
  const value = protocol.toLowerCase();
  if (value === 'http/1.1' || value === 'http/1.0' || value === 'h1') {
    return 'h1';
  }
  if (value === 'http/2' || value === 'h2') {
    return 'h2';
  }
  return null;
}

/** gRPC 不在重放范围：它的 framing 与流式语义需要单独的客户端。 */
export function isGrpcRequest(mime: string | undefined): boolean {
  return mime?.toLowerCase().startsWith('application/grpc') === true;
}

/** 取客户端原始请求头：丢弃规则 effect 行，保留原顺序、大小写与伪首部标记。 */
export function originalRequestHeaders(
  headers: readonly CaptureHeader[],
): ReplayHeader[] {
  return headers
    .filter((header) => header.ruleEffect === undefined)
    .map(({ name, value, isPseudo }) => ({
      name,
      value,
      ...(isPseudo === true ? { isPseudo: true } : {}),
    }));
}

/** 取原始请求正文：规则替换过正文时用 originalBody，否则用 Final 引用。 */
export function originalBodyRef(
  detail: CaptureExchangeDetail,
): CaptureBodyRef | undefined {
  const effect = detail.requestBodyEffect;
  if (effect !== undefined) {
    return effect.originalState === 'available' ? effect.originalBody : undefined;
  }
  return detail.requestBody;
}

/** 原请求是否带正文：用于区分「空正文」与「正文丢了」。 */
export function requestHadBody(detail: CaptureExchangeDetail): boolean {
  if (detail.summary.requestBytes > 0) {
    return true;
  }
  return detail.requestHeaders.some((header) =>
    header.ruleEffect === undefined
    && header.name.toLowerCase() === 'content-length'
    && Number(header.value) > 0);
}

/** 原请求是否已有 Host 头；没有时调用方必须禁用 Node 的自动 Host 注入。 */
export function hasHostHeader(headers: readonly ReplayHeader[]): boolean {
  return headers.some((header) => header.name.toLowerCase() === 'host');
}

/** h1 的原始 header 数组形式；保留重复名、顺序与大小写。 */
export function h1HeaderArray(headers: readonly ReplayHeader[]): string[] {
  return headers
    .filter((header) => header.isPseudo !== true)
    .flatMap((header) => [header.name, header.value]);
}

/**
 * h2 请求头：伪首部优先用捕获值，缺失时按 URL 补齐；其余头保留重复值。
 * 伪首部必须排在普通头之前，Node 才能通过校验。
 */
export function h2Headers(
  headers: readonly ReplayHeader[],
  request: ReplayRequest,
  target: URL,
): Record<string, string | string[]> {
  const pseudo = new Map<string, string>();
  const result: Record<string, string | string[]> = {};
  for (const header of headers) {
    if (header.isPseudo === true) {
      pseudo.set(header.name, header.value);
      continue;
    }
    appendHeader(result, header.name, header.value);
  }
  const authority = pseudo.get(':authority') ?? target.host;
  return {
    ':method': pseudo.get(':method') ?? request.method,
    ':path': pseudo.get(':path') ?? `${target.pathname}${target.search}`,
    ':scheme': pseudo.get(':scheme') ?? target.protocol.replace(':', ''),
    ':authority': authority,
    ...result,
  };
}

/** 合并同名 header：重复值保留为数组，语义等同多条 field line。 */
function appendHeader(
  target: Record<string, string | string[]>,
  name: string,
  value: string,
): void {
  const existing = target[name];
  if (existing === undefined) {
    target[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[name] = [existing, value];
  }
}
