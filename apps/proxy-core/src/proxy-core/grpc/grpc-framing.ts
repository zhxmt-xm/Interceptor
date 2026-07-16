export interface GrpcEnvelope {
  readonly index: number;
  /** 5-byte envelope 在完整 HTTP body 中的起始 offset。 */
  readonly envelopeOffset: number;
  /** message payload 在完整 HTTP body 中的起始 offset。 */
  readonly payloadOffset: number;
  readonly payloadLength: number;
  readonly compressed: boolean;
  /** body 在当前 message 内结束，payload 不完整。 */
  readonly truncated: boolean;
}

export interface GrpcFramingResult {
  readonly messages: GrpcEnvelope[];
  readonly malformedOffset?: number;
  readonly nextOffset: number;
}

export type GrpcEnvelopeHeaderResult =
  | {
      readonly ok: true;
      readonly compressed: boolean;
      readonly payloadLength: number;
    }
  | { readonly ok: false; readonly reason: 'incomplete' | 'invalid-flags' };

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
  const view = new DataView(
    header.buffer,
    header.byteOffset + 1,
    4,
  );
  return {
    ok: true,
    compressed: flags === 1,
    payloadLength: view.getUint32(0, false),
  };
}

/**
 * 解析 gRPC over HTTP/2 的 5-byte length-prefixed envelope。
 * flags 仅允许 0/1；payload 保持原始字节，不在 framing 层解压或解释 protobuf。
 */
export function parseGrpcEnvelopes(
  body: Uint8Array,
  baseOffset = 0,
  startIndex = 0,
): GrpcFramingResult {
  const messages: GrpcEnvelope[] = [];
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
    const payloadLength = header.payloadLength;
    const payloadOffset = offset + 5;
    const available = body.byteLength - payloadOffset;
    const truncated = payloadLength > available;
    messages.push({
      index,
      envelopeOffset: baseOffset + offset,
      payloadOffset: baseOffset + payloadOffset,
      payloadLength,
      compressed: header.compressed,
      truncated,
    });
    index += 1;
    if (truncated) {
      return {
        messages,
        nextOffset: baseOffset + body.byteLength,
      };
    }
    offset = payloadOffset + payloadLength;
  }

  return { messages, nextOffset: baseOffset + offset };
}