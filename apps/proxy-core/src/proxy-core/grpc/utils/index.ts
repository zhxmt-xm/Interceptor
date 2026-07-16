import type {
  CaptureExchangeDetail,
  CaptureHeader,
} from '@interceptor/core-protocol';

import { InvalidGrpcCursorError } from '../grpc-invalid-cursor-error';
import type {
  GrpcCursor,
  GrpcEnvelopeHeaderResult,
  GrpcFramingResult,
  GrpcMessageSide,
  GrpcMessageSource,
} from '../interfaces';

/** 只解析单个 5-byte envelope header，不读取 payload。 */
export function parseGrpcEnvelopeHeader(
  header: Uint8Array,
): GrpcEnvelopeHeaderResult {
  if (header.byteLength < 5) {
    return { ok: false, reason: 'incomplete' };
  }
  const flags = header[0];
  if (flags !== 0 && flags !== 1) {
    return { ok: false, reason: 'invalid-flags' };
  }
  const view = new DataView(header.buffer, header.byteOffset + 1, 4);
  return {
    ok: true,
    compressed: flags === 1,
    payloadLength: view.getUint32(0, false),
  };
}

/** 解析一段 gRPC 5-byte length-prefixed envelope，不解释 payload。 */
export function parseGrpcEnvelopes(
  body: Uint8Array,
  baseOffset = 0,
  startIndex = 0,
): GrpcFramingResult {
  const messages: GrpcFramingResult['messages'] = [];
  let offset = 0;
  let index = startIndex;
  while (offset < body.byteLength) {
    const header = parseGrpcEnvelopeHeader(body.subarray(offset, offset + 5));
    if (!header.ok && header.reason === 'incomplete') {
      return {
        messages,
        malformedOffset: baseOffset + offset,
        nextOffset: baseOffset + body.byteLength,
      };
    }
    if (!header.ok) {
      return {
        messages,
        malformedOffset: baseOffset + offset,
        nextOffset: baseOffset + offset,
      };
    }
    const payloadOffset = offset + 5;
    const available = body.byteLength - payloadOffset;
    const truncated = header.payloadLength > available;
    messages.push({
      index,
      envelopeOffset: baseOffset + offset,
      payloadOffset: baseOffset + payloadOffset,
      payloadLength: header.payloadLength,
      compressed: header.compressed,
      truncated,
    });
    index += 1;
    if (truncated) {
      return { messages, nextOffset: baseOffset + body.byteLength };
    }
    offset = payloadOffset + header.payloadLength;
  }
  return { messages, nextOffset: baseOffset + offset };
}

/** 从 Exchange detail 选择指定 side 的 gRPC 元数据和 body 引用。 */
export function selectSource(
  detail: CaptureExchangeDetail | null,
  side: GrpcMessageSide,
): GrpcMessageSource {
  if (!detail) {
    return { recognized: false };
  }
  const headers = side === 'request'
    ? detail.requestHeaders
    : detail.responseHeaders;
  const contentType = side === 'request'
    ? detail.requestMime ?? readHeader(headers, 'content-type')
    : detail.summary.responseMime ?? readHeader(headers, 'content-type');
  return {
    recognized: isGrpcContentType(contentType),
    contentType,
    encoding: readHeader(headers, 'grpc-encoding'),
    body: side === 'request' ? detail.requestBody : detail.responseBody,
  };
}

/** 识别原生 application/grpc MIME，并排除 grpc-web。 */
export function isGrpcContentType(contentType: string | undefined): boolean {
  const essence = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return essence === 'application/grpc' ||
    essence?.startsWith('application/grpc+') === true;
}

/** 按大小写不敏感名称读取首个 header。 */
export function readHeader(
  headers: readonly CaptureHeader[],
  name: string,
): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}

/** 编码包含 side、offset 与 index 的不透明游标。 */
export function encodeCursor(
  side: GrpcMessageSide,
  offset: number,
  index: number,
): string {
  return Buffer.from(`grpc:${side}:${offset}:${index}`, 'utf8').toString(
    'base64url',
  );
}

/** 解码并校验游标 side、offset 与 index。 */
export function decodeCursor(
  cursor: string | undefined,
  side: GrpcMessageSide,
): GrpcCursor {
  if (cursor === undefined) {
    return { offset: 0, index: 0 };
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new InvalidGrpcCursorError();
  }
  const match = /^grpc:(request|response):(\d+):(\d+)$/.exec(decoded);
  const offset = match ? Number(match[2]) : Number.NaN;
  const index = match ? Number(match[3]) : Number.NaN;
  if (
    match?.[1] !== side ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(index) ||
    index < 0
  ) {
    throw new InvalidGrpcCursorError();
  }
  return { offset, index };
}