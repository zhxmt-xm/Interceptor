import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureHeader,
} from '@interceptor/core-protocol';

import { parseGrpcEnvelopeHeader } from './grpc-framing';

export type GrpcMessageSide = 'request' | 'response';

export interface GrpcMessageSummary {
  readonly index: number;
  readonly envelopeOffset: number;
  readonly payloadOffset: number;
  readonly payloadLength: number;
  readonly compressed: boolean;
  readonly truncated: boolean;
}

export interface GrpcMessageQuery {
  readonly exchangeId: string;
  readonly side: GrpcMessageSide;
  readonly cursor?: string;
  readonly limit: number;
}

export interface GrpcMessagePage {
  readonly recognized: boolean;
  readonly side: GrpcMessageSide;
  readonly contentType?: string;
  readonly encoding?: string;
  readonly bodyHash?: string;
  readonly bodySize: number;
  readonly items: GrpcMessageSummary[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly malformedOffset?: number;
}

export interface GrpcStorageReader {
  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null>;
  readBodyRange(hash: string, offset: number, length: number): Promise<Buffer>;
}

export class InvalidGrpcCursorError extends Error {
  constructor() {
    super('The gRPC message cursor is malformed.');
    this.name = 'InvalidGrpcCursorError';
  }
}

/** 从既有 HTTP body Blob 跳读 gRPC envelope；payload 字节由 body.read-range 另行读取。 */
export async function queryGrpcMessages(
  storage: GrpcStorageReader,
  query: GrpcMessageQuery,
): Promise<GrpcMessagePage> {
  const detail = await storage.getExchangeDetail(query.exchangeId);
  const source = selectSource(detail, query.side);
  if (!source.recognized || !source.body?.bodyHash) {
    return {
      recognized: source.recognized,
      side: query.side,
      contentType: source.contentType,
      encoding: source.encoding,
      bodySize: source.body?.encodedSize ?? 0,
      items: [],
      hasMore: false,
    };
  }

  const cursor = decodeCursor(query.cursor, query.side);
  const bodySize = source.body.encodedSize;
  let offset = cursor.offset;
  let index = cursor.index;
  const items: GrpcMessageSummary[] = [];
  let malformedOffset: number | undefined;

  while (items.length < query.limit && offset < bodySize) {
    const headerBytes = await storage.readBodyRange(
      source.body.bodyHash,
      offset,
      Math.min(5, bodySize - offset),
    );
    const header = parseGrpcEnvelopeHeader(headerBytes);
    if (!header.ok) {
      malformedOffset = offset;
      break;
    }
    const payloadOffset = offset + 5;
    const available = bodySize - payloadOffset;
    const truncated = header.payloadLength > available;
    items.push({
      index,
      envelopeOffset: offset,
      payloadOffset,
      payloadLength: header.payloadLength,
      compressed: header.compressed,
      truncated,
    });
    index += 1;
    offset = truncated
      ? bodySize
      : payloadOffset + header.payloadLength;
    if (truncated) {
      break;
    }
  }

  const hasMore = malformedOffset === undefined && offset < bodySize;
  return {
    recognized: true,
    side: query.side,
    contentType: source.contentType,
    encoding: source.encoding,
    bodyHash: source.body.bodyHash,
    bodySize,
    items,
    nextCursor: hasMore
      ? encodeCursor(query.side, offset, index)
      : undefined,
    hasMore,
    malformedOffset,
  };
}

function selectSource(
  detail: CaptureExchangeDetail | null,
  side: GrpcMessageSide,
): {
  recognized: boolean;
  contentType?: string;
  encoding?: string;
  body?: CaptureBodyRef;
} {
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

function isGrpcContentType(contentType: string | undefined): boolean {
  const essence = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return essence === 'application/grpc'
    || essence?.startsWith('application/grpc+') === true;
}

function readHeader(
  headers: readonly CaptureHeader[],
  name: string,
): string | undefined {
  return headers.find(
    (header) => header.name.toLowerCase() === name,
  )?.value;
}

function encodeCursor(
  side: GrpcMessageSide,
  offset: number,
  index: number,
): string {
  return Buffer.from(`grpc:${side}:${offset}:${index}`, 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(
  cursor: string | undefined,
  side: GrpcMessageSide,
): { offset: number; index: number } {
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