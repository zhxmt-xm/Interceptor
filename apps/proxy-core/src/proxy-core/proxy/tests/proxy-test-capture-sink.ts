import { createHash } from 'node:crypto';

import type {
  BlobWriteResult,
  BodyWriter,
  CaptureSessionInput,
  ExchangeInput,
  ExchangePatch,
  WebSocketFrameInput,
} from '../../storage/interfaces';
import type { RuleHitRecord } from '../../rules/interfaces';
import type { CaptureSink } from '../interfaces';

/** 收集写入内容并在 finalize 时产出稳定 hash 的测试写入器。 */
class RecordingBodyWriter implements BodyWriter {
  /** 已接收的分片。 */
  private readonly chunks: Buffer[] = [];
  /** 已观察字节数。 */
  private bytes = 0;

  /** 完成时把完整正文交回 sink 收集。 */
  constructor(private readonly collect: (body: Buffer) => void) {}

  get observedBytes(): number {
    return this.bytes;
  }

  get degraded(): boolean {
    return false;
  }

  write(chunk: Uint8Array): void {
    const buffer = Buffer.from(chunk);
    this.chunks.push(buffer);
    this.bytes += buffer.byteLength;
  }

  finalize(): Promise<BlobWriteResult | null> {
    if (this.bytes === 0) {
      return Promise.resolve(null);
    }
    const body = Buffer.concat(this.chunks, this.bytes);
    this.collect(body);
    return Promise.resolve({
      hash: createHash('sha256').update(body).digest('hex'),
      size: body.byteLength,
      deduplicated: false,
    });
  }

  abort(): Promise<void> {
    this.chunks.length = 0;
    return Promise.resolve();
  }
}

/**
 * Proxy 集成测试共用的内存 CaptureSink。
 *
 * `updateExchange` 就地合并进 `exchanges`，因此断言可以直接检查单条 Exchange 的
 * 最终聚合状态，而不必重放增量事件顺序。
 */
export class RecordingSink implements CaptureSink {
  /** 已登记的 Session。 */
  readonly sessions: CaptureSessionInput[] = [];
  /** 已创建的 Exchange，patch 就地合并。 */
  readonly exchanges: ExchangeInput[] = [];
  /** 已写入的完整正文。 */
  readonly bodies: Buffer[] = [];
  /** 收到的全部增量 patch，按顺序保留。 */
  readonly exchangeUpdates: ExchangePatch[] = [];
  /** 已记录的规则命中。 */
  readonly ruleHits: Array<{ exchangeId: string; hits: readonly RuleHitRecord[] }> =
    [];
  /** 已记录的 WebSocket 帧。 */
  readonly webSocketFrames: Array<{
    exchangeId: string;
    frame: WebSocketFrameInput;
  }> = [];

  ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    this.exchanges.push(...exchanges.map((exchange) => ({ ...exchange })));
    return Promise.resolve(
      exchanges.map((exchange, index) => ({ id: exchange.id, seq: index + 1 })),
    );
  }

  updateExchange(patch: ExchangePatch): Promise<void> {
    this.exchangeUpdates.push(patch);
    const index = this.exchanges.findIndex((exchange) => exchange.id === patch.id);
    if (index >= 0) {
      const current = this.exchanges[index]!;
      const { id: _id, headers, ruleIds, ...rest } = patch;
      this.exchanges[index] = {
        ...current,
        ...Object.fromEntries(
          Object.entries(rest).filter(([, value]) => value !== undefined),
        ),
        headers: headers
          ? [...(current.headers ?? []), ...headers]
          : current.headers,
        ruleIds: ruleIds
          ? [...new Set([...(current.ruleIds ?? []), ...ruleIds])]
          : current.ruleIds,
      } as ExchangeInput;
    }
    return Promise.resolve();
  }

  async writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<BlobWriteResult> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    this.bodies.push(buffer);
    return {
      hash: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
      deduplicated: false,
    };
  }

  createBodyWriter(): BodyWriter {
    return new RecordingBodyWriter((body) => this.bodies.push(body));
  }

  appendRuleHits(
    exchangeId: string,
    hits: readonly RuleHitRecord[],
  ): Promise<void> {
    this.ruleHits.push({ exchangeId, hits });
    return Promise.resolve();
  }

  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    this.webSocketFrames.push(
      ...frames.map((frame) => ({ exchangeId, frame })),
    );
    return Promise.resolve();
  }
}
