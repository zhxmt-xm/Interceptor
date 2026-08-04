import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
} from '@interceptor/core-protocol';

export type GrpcMessageSide = 'request' | 'response';

export interface GrpcMessageSummary {
  /** message 在该 body side 内的零基序号。 */
  readonly index: number;
  /** 5-byte envelope 起始 offset。 */
  readonly envelopeOffset: number;
  /** message payload 起始 offset。 */
  readonly payloadOffset: number;
  /** envelope 声明的 payload 长度。 */
  readonly payloadLength: number;
  /** envelope compression flag。 */
  readonly compressed: boolean;
  /** body 是否在 payload 完成前结束。 */
  readonly truncated: boolean;
}

export interface GrpcMessageQuery {
  /** 所属 HTTP/2 Exchange ID。 */
  readonly exchangeId: string;
  /** 请求或响应 body side。 */
  readonly side: GrpcMessageSide;
  /** 不透明 offset/index 游标。 */
  readonly cursor?: string;
  /** 单页最大 message 数。 */
  readonly limit: number;
}

export interface GrpcMessagePage {
  /** content-type 是否为原生 gRPC。 */
  readonly recognized: boolean;
  /** 当前解析的 body side。 */
  readonly side: GrpcMessageSide;
  /** 原始 content-type。 */
  readonly contentType?: string;
  /** grpc-encoding header。 */
  readonly encoding?: string;
  /** 正文内容寻址 hash。 */
  readonly bodyHash?: string;
  /** 完整 body 字节数。 */
  readonly bodySize: number;
  /** 当前页 message 摘要。 */
  readonly items: GrpcMessageSummary[];
  /** 下一页不透明游标。 */
  readonly nextCursor?: string;
  /** 是否还有未扫描 envelope。 */
  readonly hasMore: boolean;
  /** 首个 malformed envelope offset。 */
  readonly malformedOffset?: number;
}

export interface GrpcMessageSource {
  /** content-type 是否为原生 gRPC。 */
  readonly recognized: boolean;
  /** 原始 content-type。 */
  readonly contentType?: string;
  /** grpc-encoding header。 */
  readonly encoding?: string;
  /** 当前 side 的 body 引用。 */
  readonly body?: CaptureBodyRef;
}

export interface GrpcCursor {
  /** 下一 envelope offset。 */
  readonly offset: number;
  /** 下一 message index。 */
  readonly index: number;
}

export interface GrpcEnvelope {
  /** message 零基序号。 */
  readonly index: number;
  /** 5-byte envelope 起始 offset。 */
  readonly envelopeOffset: number;
  /** message payload 起始 offset。 */
  readonly payloadOffset: number;
  /** envelope 声明的 payload 长度。 */
  readonly payloadLength: number;
  /** envelope compression flag。 */
  readonly compressed: boolean;
  /** body 是否在 payload 完成前结束。 */
  readonly truncated: boolean;
}

export interface GrpcFramingResult {
  /** 已成功解析的 envelope。 */
  readonly messages: GrpcEnvelope[];
  /** 首个 malformed envelope offset。 */
  readonly malformedOffset?: number;
  /** 解析完成后的绝对 offset。 */
  readonly nextOffset: number;
}

export type GrpcEnvelopeHeaderResult =
  | {
      /** Header 是否有效。 */
      readonly ok: true;
      /** Envelope compression flag。 */
      readonly compressed: boolean;
      /** Envelope 声明的 payload 长度。 */
      readonly payloadLength: number;
    }
  | {
      /** Header 是否有效。 */
      readonly ok: false;
      /** Header 无效原因。 */
      readonly reason: 'incomplete' | 'invalid-flags';
    };