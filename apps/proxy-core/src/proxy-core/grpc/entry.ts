import type { CaptureService } from '../capture/entry';
import type {
  GrpcMessagePage,
  GrpcMessageQuery,
  GrpcMessageSummary,
} from './interfaces';
import * as GrpcUtils from './utils';

/** 从既有 HTTP body Blob 跳读原生 gRPC envelope，不读取 payload 字节。 */
export class GrpcService {
  /** 提供 Exchange detail 与 Blob range 的抓包数据。 */
  private readonly captureService: CaptureService;

  /** 绑定当前 Recording 的抓包数据。 */
  constructor(captureService: CaptureService) {
    this.captureService = captureService;
  }

  /** 按 body side 和不透明游标分页扫描 gRPC envelope header。 */
  async query(query: GrpcMessageQuery): Promise<GrpcMessagePage> {
    const detail = await this.captureService.getExchangeDetail(query.exchangeId);
    const source = GrpcUtils.selectSource(detail, query.side);
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

    const cursor = GrpcUtils.decodeCursor(query.cursor, query.side);
    const bodySize = source.body.encodedSize;
    let offset = cursor.offset;
    let index = cursor.index;
    const items: GrpcMessageSummary[] = [];
    let malformedOffset: number | undefined;
    while (items.length < query.limit && offset < bodySize) {
      const headerBytes = await this.captureService.readBodyRange(
        source.body.bodyHash,
        offset,
        Math.min(5, bodySize - offset),
      );
      const header = GrpcUtils.parseGrpcEnvelopeHeader(headerBytes);
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
      offset = truncated ? bodySize : payloadOffset + header.payloadLength;
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
        ? GrpcUtils.encodeCursor(query.side, offset, index)
        : undefined,
      hasMore,
      malformedOffset,
    };
  }
}