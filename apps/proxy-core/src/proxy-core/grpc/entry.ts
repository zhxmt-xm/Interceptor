import type { CaptureService } from '../capture/entry';
import { InvalidGrpcCursorError } from './internal/errors';
import type {
  GrpcMessagePage,
  GrpcMessageQuery,
  GrpcMessageSummary,
} from './interfaces';
import * as GrpcUtils from './utils';

/** 从当前HTTP正文跳读原生gRPC envelope，不为查询读取payload字节。 */
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
    const snapshot = await this.captureService.getExchangeBodySnapshot(query.exchangeId, query.side);
    if (!source.recognized || !snapshot.available) {
      return {
        recognized: source.recognized,
        side: query.side,
        contentType: source.contentType,
        encoding: source.encoding,
        bodySize: snapshot.encodedSize,
        bodyAvailable: snapshot.available,
        bodyComplete: snapshot.complete,
        items: [],
        hasMore: false,
      };
    }

    const cursor = GrpcUtils.decodeCursor(query.cursor, query.side);
    const bodySize = snapshot.encodedSize;
    if (cursor.offset > bodySize) {
      throw new InvalidGrpcCursorError();
    }
    let offset = cursor.offset;
    let index = cursor.index;
    const items: GrpcMessageSummary[] = [];
    let malformedOffset: number | undefined;
    let pendingEnvelope = false;
    while (items.length < query.limit && offset < bodySize) {
      const headerBytes = await this.captureService.readExchangeBodyRange(
        query.exchangeId,
        query.side,
        offset,
        Math.min(5, bodySize - offset),
      );
      const header = GrpcUtils.parseGrpcEnvelopeHeader(headerBytes);
      if (!header.ok) {
        if (!snapshot.complete && header.reason === 'incomplete') pendingEnvelope = true;
        else malformedOffset = offset;
        break;
      }
      const payloadOffset = offset + 5;
      const available = bodySize - payloadOffset;
      const truncated = header.payloadLength > available;
      if (truncated && !snapshot.complete) {
        pendingEnvelope = true;
        break;
      }
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

    const hasMore = !pendingEnvelope && malformedOffset === undefined && offset < bodySize;
    return {
      recognized: true,
      side: query.side,
      contentType: source.contentType,
      encoding: source.encoding,
      bodyHash: snapshot.bodyHash,
      bodySize,
      bodyAvailable: snapshot.available,
      bodyComplete: snapshot.complete,
      items,
      nextCursor: hasMore || (!snapshot.complete && malformedOffset === undefined)
        ? GrpcUtils.encodeCursor(query.side, offset, index)
        : undefined,
      hasMore,
      malformedOffset,
    };
  }
}