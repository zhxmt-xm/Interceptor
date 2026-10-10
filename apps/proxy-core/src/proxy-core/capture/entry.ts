import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

import type {
  CaptureExchangeDetail,
} from '@interceptor/core-protocol';

import type { DiagnosticsRecorder } from '../core-diagnostics';
import type {
  TransferProgressListener,
  TransferResult,
} from '../transfer/interfaces';
import type { CaptureBodySide, CaptureBodySnapshot, ExchangePatch } from './interfaces';
import type {
  CaptureSessionInput,
  CaptureArchiveSnapshot,
  CaptureSnapshotBatch,
  CleanupScope,
  ExchangeInput,
  RuleHitCount,
  RuleHitInput,
  SessionQuery,
  SessionQueryPage,
  CaptureStatusReport,
  WebSocketFrameInput,
  WebSocketFramePage,
  WebSocketFrameQuery,
} from './interfaces';
import { BodyStore } from './internal/body-store';
import type { BodyWriter } from './internal/body-writer';
import { ExchangeStore } from './internal/exchange-store';

/**
 * 当前 Recording 的易失抓包数据，由 CoreApplication 独占拥有。
 *
 * 只管本 Core 代际的临时数据：内存 Exchange Store 与内存+spill Body Store，Clear 或进程
 * 退出即丢弃。跨 Recording 持久的低频配置（RuleSet、Composer 集合）在 `workspace/` 模块。
 * Capture 数据不使用 SQLite 或常驻 Worker；对上保持意图型 API，不泄漏临时路径。
 */
export class CaptureService {
  /** 当前 Recording 的内存 Exchange 数据。 */
  private readonly exchangeStore = new ExchangeStore();
  /** 当前 Core 代际的内存+spill 正文。 */
  private readonly bodyStore = new BodyStore();
  /** 正文写入器，网络终态及Final替换都不提前移除清理所有权。 */
  private readonly bodyWritersByExchangeId = new Map<string, Partial<Record<CaptureBodySide, BodyWriter>>>();
  /** 仍允许接收迟到正文的采集所有者；删除记录时同步取消其等待。 */
  private readonly pendingBodyCapturesByExchangeId = new Map<string, () => void>();
  /** 已接受的Exchange/side读取，清理前等待其释放正文句柄。 */
  private readonly pendingBodyReads = new Set<Promise<Buffer>>();
  private ready: Promise<void> | null = null;
  /** 可选结构化诊断汇。 */
  private diagnostics: DiagnosticsRecorder | null = null;

  /** 注入诊断汇；调用方：CoreApplication 装配后。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /**
   * 初始化临时 Body 目录；重复调用返回同一 Promise。
   * 调用方：CoreApplication.start。
   */
  initialize(): Promise<void> {
    if (!this.ready) {
      this.ready = this.bodyStore.init().then(() => {
        this.diagnostics?.info('capture.ready', {
          attributes: { capture: 'memory', body: 'memory-spill' },
        });
      });
    }
    return this.ready;
  }

  async ensureSession(session: CaptureSessionInput): Promise<void> {
    this.exchangeStore.ensureSession(session);
  }

  async appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    return this.exchangeStore.appendExchanges(exchanges);
  }

  async updateExchange(patch: ExchangePatch): Promise<void> {
    this.exchangeStore.updateExchange(patch);
  }

  /** 保留终态正文的读取与清理所有权，即使首个writer尚未创建。 */
  retainBodyCapture(exchangeId: string, onDiscard: () => void): void {
    this.pendingBodyCapturesByExchangeId.set(exchangeId, onDiscard);
  }

  /** 正文已封口且写入结束后解除关联，不以网络state代替采集结束。 */
  releaseBodyCapture(exchangeId: string): void {
    this.pendingBodyCapturesByExchangeId.delete(exchangeId);
    this.bodyWritersByExchangeId.delete(exchangeId);
  }

  /** 写入一段临时正文，返回内容寻址结果供 Capture metadata 引用。 */
  writeBody(source: AsyncIterable<Uint8Array>) {
    return this.bodyStore.writeStream(source);
  }

  /** 创建 push 式增量正文写入器；调用方：Proxy 消费 body-data 事件。 */
  createBodyWriter(exchangeId: string, side: CaptureBodySide): BodyWriter {
    const bodyWriter = this.bodyStore.createWriter();
    const bodyWriters = this.bodyWritersByExchangeId.get(exchangeId) ?? {};
    bodyWriters[side] = bodyWriter;
    this.bodyWritersByExchangeId.set(exchangeId, bodyWriters);
    return bodyWriter;
  }

  /** 返回Final正文或当前writer的可读快照，不生成在途内容hash。 */
  async getExchangeBodySnapshot(exchangeId: string, side: CaptureBodySide): Promise<CaptureBodySnapshot> {
    const detail = this.exchangeStore.getExchangeDetail(exchangeId);
    if (!detail) return { encodedSize: 0, available: false, complete: true };
    const body = side === 'request' ? detail.requestBody : detail.responseBody;
    if (body) return { bodyHash: body.bodyHash, encodedSize: body.encodedSize,
      available: body.bodyHash !== undefined, complete: true };
    const bodyWriter = this.bodyWritersByExchangeId.get(exchangeId)?.[side];
    if (bodyWriter) {
      const snapshot = await bodyWriter.snapshot();
      const currentDetail = this.exchangeStore.getExchangeDetail(exchangeId);
      const finalBody = side === 'request' ? currentDetail?.requestBody : currentDetail?.responseBody;
      if (!currentDetail || finalBody || this.bodyWritersByExchangeId.get(exchangeId)?.[side] !== bodyWriter) {
        return this.getExchangeBodySnapshot(exchangeId, side);
      }
      return { ...snapshot, bodyHash: bodyWriter.bodyHash };
    }
    return { encodedSize: 0, available: false,
      complete: !this.pendingBodyCapturesByExchangeId.has(exchangeId) &&
        (detail.summary.state === 'completed' || detail.summary.state === 'aborted' || detail.summary.state === 'failed') };
  }

  /** 按Exchange/side读取有限Final或在途正文，Clear后的引用不读取其他记录。 */
  async readExchangeBodyRange(exchangeId: string, side: CaptureBodySide, offset: number, length: number): Promise<Buffer> {
    const detail = this.exchangeStore.getExchangeDetail(exchangeId);
    if (!detail) return Buffer.alloc(0);
    const body = side === 'request' ? detail.requestBody : detail.responseBody;
    const bodyWriter = this.bodyWritersByExchangeId.get(exchangeId)?.[side];
    const reading = body
      ? body.bodyHash ? this.bodyStore.readRange(body.bodyHash, offset, length) : Promise.resolve(Buffer.alloc(0))
      : bodyWriter ? bodyWriter.readRange(offset, length) : Promise.resolve(Buffer.alloc(0));
    this.pendingBodyReads.add(reading);
    try {
      return await reading;
    } finally {
      this.pendingBodyReads.delete(reading);
    }
  }

  /** 捕获点击时的 Exchange/Body hash 时间切面。 */
  createArchiveSnapshot(batchSize: number): CaptureArchiveSnapshot {
    const source = this.exchangeStore.createSnapshotSource(batchSize);
    return {
      bodyHashes: source.bodyHashes,
      batches: source.batches,
    };
  }

  /** 打开一个临时正文只读流。 */
  openBlobStream(hash: string) {
    return this.bodyStore.openReadStream(hash);
  }

  async querySessions(query: SessionQuery): Promise<SessionQueryPage> {
    return this.exchangeStore.querySessions(query);
  }

  /** 按需读取单条 Exchange 详情（摘要 + 头部 + 正文引用）。调用方：sessions.detail handler。 */
  async getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null> {
    return this.exchangeStore.getExchangeDetail(exchangeId);
  }

  /** 记录一批规则命中审计。调用方：proxy-service 在 captureExchange 关联 exchange 后。 */
  async appendRuleHits(
    exchangeId: string,
    hits: readonly RuleHitInput[],
  ): Promise<void> {
    this.exchangeStore.appendRuleHits(exchangeId, hits);
  }

  /** 追加 WebSocket 有序应用消息；payload 已写入 BodyStore。 */
  async appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<number[]> {
    return this.exchangeStore.appendWebSocketFrames(exchangeId, frames);
  }

  async queryWebSocketFrames(query: WebSocketFrameQuery): Promise<WebSocketFramePage> {
    return this.exchangeStore.queryWebSocketFrames(query);
  }

  /** 按 ruleId 聚合的累计规则命中次数。调用方：rules.hits handler。 */
  async countRuleHits(): Promise<RuleHitCount[]> {
    return this.exchangeStore.countRuleHits();
  }

  /**
  * 汇总当前 Core 临时 Capture/Body 用量，形成面向 Renderer 的状态报表。
   * 调用方：capture.status command handler。
   */
  async status(): Promise<CaptureStatusReport> {
    const stats = this.exchangeStore.getStorageStats();
    const bodyBytes = this.bodyStore.usageBytes;
    return {
      sessionCount: stats.sessionCount,
      exchangeCount: stats.exchangeCount,
      bodyCount: stats.bodyRefCount,
      databaseBytes: 0,
      blobBytes: bodyBytes,
      totalBytes: bodyBytes,
    };
  }

  /**
  * 删除指定范围的捕获数据，随后按剩余引用集合 GC 孤立临时 Body。
   * 调用方：capture.cleanup command handler（用户确认后）。
   */
  async cleanup(scope: CleanupScope): Promise<CaptureStatusReport> {
    const result = this.exchangeStore.cleanup(scope);
    await Promise.allSettled(this.pendingBodyReads);
    const pendingExchangeIds = new Set([
      ...this.bodyWritersByExchangeId.keys(),
      ...this.pendingBodyCapturesByExchangeId.keys(),
    ]);
    await this.abortBodyWriters([...pendingExchangeIds]
      .filter((exchangeId) => this.exchangeStore.getExchangeDetail(exchangeId) === null));
    if (scope.kind === 'all' || scope.kind === 'all-except-session') {
      await this.bodyStore.reset();
    } else {
      await this.bodyStore.collectGarbage(result.referencedBlobHashes);
    }
    return this.status();
  }

  /** 等待已删除Exchange的读取/写入队列后释放半成品，再允许BodyStore清理spill。 */
  private async abortBodyWriters(exchangeIds: Iterable<string>): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const exchangeId of exchangeIds) {
      const cancelCapture = this.pendingBodyCapturesByExchangeId.get(exchangeId);
      this.pendingBodyCapturesByExchangeId.delete(exchangeId);
      cancelCapture?.();
      const bodyWriters = this.bodyWritersByExchangeId.get(exchangeId);
      this.bodyWritersByExchangeId.delete(exchangeId);
      if (bodyWriters?.request) pending.push(bodyWriters.request.abort());
      if (bodyWriters?.response) pending.push(bodyWriters.response.abort());
    }
    await Promise.all(pending);
  }

  /** 回收未被任何保留记录引用的临时 Body，不删除 Capture metadata。 */
  async collectUnreferencedBodies(): Promise<void> {
    await this.bodyStore.collectGarbage(
      this.exchangeStore.referencedBlobHashes(),
    );
  }

  /**
  * 按内容 hash 从 BodyStore 读取一段正文字节。
   * 调用方：body.read-range command handler。
   */
  async readBodyRange(
    blobHash: string,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    return this.bodyStore.readRange(blobHash, offset, length);
  }

  /** 将完整编码正文流式、原子保存到 Main 选择的路径。 */
  async exportBodyToFile(
    blobHash: string,
    filePath: string,
    abortSignal: AbortSignal,
    onProgress: TransferProgressListener,
  ): Promise<TransferResult> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const total = this.bodyStore.getSize(blobHash);
    const output = await open(temporaryPath, 'wx');
    let source: ReturnType<BodyStore['openReadStream']> | null = null;
    let processed = 0;

    try {
      if (abortSignal.aborted) {
        throw abortSignal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
      }
      source = this.bodyStore.openReadStream(blobHash);
      for await (const chunk of source) {
        if (abortSignal.aborted) {
          throw abortSignal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
        }
        const buffer = Buffer.from(chunk);
        await output.writeFile(buffer);
        processed += buffer.byteLength;
        onProgress({ processed, total });
      }
      if (abortSignal.aborted) {
        throw abortSignal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
      }
      await output.sync();
      await output.close();
      abortSignal.throwIfAborted();
      // 直接 rename 覆盖：先 rm 再 rename 会留下一个旧文件已删、新文件未就位的窗口，
      // 一旦 rename 因权限/磁盘/杀软失败，用户的原文件就再也找不回来了。
      await rename(temporaryPath, filePath);
      return { processed, total, warnings: [] };
    } catch (error) {
      source?.destroy();
      await output.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  /** 释放全部临时 Capture/Body。 */
  async dispose(): Promise<void> {
    this.exchangeStore.clear();
    await Promise.allSettled(this.pendingBodyReads);
    await this.abortBodyWriters(new Set([
      ...this.bodyWritersByExchangeId.keys(),
      ...this.pendingBodyCapturesByExchangeId.keys(),
    ]));
    await this.bodyStore.dispose();
  }
}
