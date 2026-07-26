import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

import type {
  CaptureExchangeDetail,
  RuleDefinition,
  RuleSet,
} from '@interceptor/core-protocol';

import type { DiagnosticsRecorder } from '../core-diagnostics';
import type {
  TransferProgressListener,
  TransferResult,
} from '../transfer/interfaces';
import type { ExchangePatch } from './interfaces';
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
  StorageStatusReport,
  WebSocketFrameInput,
  WebSocketFramePage,
  WebSocketFrameQuery,
} from './interfaces';
import { TemporaryBodyStore } from './storage-temporary-body-store';
import { TemporaryCaptureStore } from './storage-temporary-capture-store';
import { RuleStore } from './storage-rule-store';

/**
 * Proxy Core 存储门面，由 CoreApplication 独占拥有。
 *
 * 直接组合 Core 内存 Capture Store、内存+spill Body Store 与低频持久 Rule Store。
 * Capture 数据不使用 SQLite 或常驻 Worker；对上保持意图型 API，不泄漏临时路径。
 */
export class StorageService {
  /** 当前 Recording 的内存 Capture 数据。 */
  private readonly captureStore = new TemporaryCaptureStore();
  /** 当前 Core 代际的内存+spill 正文。 */
  private readonly bodyStore = new TemporaryBodyStore();
  /** 跨 Recording 持久的低频 RuleSet。 */
  private readonly ruleStore = new RuleStore();
  private ready: Promise<void> | null = null;
  /** 可选结构化诊断汇。 */
  private diagnostics: DiagnosticsRecorder | null = null;

  /** 注入诊断汇；调用方：CoreApplication 装配后。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /**
   * 初始化临时 Body 目录与持久 Rule Store；重复调用返回同一 Promise。
   * 调用方：CoreApplication.start。
   */
  initialize(): Promise<void> {
    if (!this.ready) {
      this.ready = this.bodyStore.init().then(() => {
        this.ruleStore.initialize();
        this.diagnostics?.info('storage.ready', {
          attributes: { capture: 'memory', body: 'memory-spill', rules: 'sqlite' },
        });
      });
    }
    return this.ready;
  }

  async ensureSession(session: CaptureSessionInput): Promise<void> {
    this.captureStore.ensureSession(session);
  }

  async appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    return this.captureStore.appendExchanges(exchanges);
  }

  async updateExchange(patch: ExchangePatch): Promise<void> {
    this.captureStore.updateExchange(patch);
  }

  /** 写入一段临时正文，返回内容寻址结果供 Capture metadata 引用。 */
  writeBody(source: AsyncIterable<Uint8Array>) {
    return this.bodyStore.writeStream(source);
  }

  /** 创建 push 式增量正文写入器；调用方：Proxy 消费 body-data 事件。 */
  createBodyWriter() {
    return this.bodyStore.createWriter();
  }

  /** 捕获点击时的 Exchange/Body hash 时间切面。 */
  createArchiveSnapshot(batchSize: number): CaptureArchiveSnapshot {
    const source = this.captureStore.createSnapshotSource(batchSize);
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
    return this.captureStore.querySessions(query);
  }

  /** 按需读取单条 Exchange 详情（摘要 + 头部 + 正文引用）。调用方：sessions.detail handler。 */
  async getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null> {
    return this.captureStore.getExchangeDetail(exchangeId);
  }

  /** 读取持久化规则集；未保存过时返回 revision 0 空集。调用方：rules.get handler。 */
  async loadRuleSet(): Promise<RuleSet> {
    return this.ruleStore.loadRuleSet();
  }

  /**
   * 乐观并发替换规则集（expectedRevision 需匹配当前 revision），返回新规则集。
   * 调用方：rules.replace handler。
   */
  async saveRuleSet(
    expectedRevision: number,
    rules: readonly RuleDefinition[],
  ): Promise<RuleSet> {
    return this.ruleStore.saveRuleSet(expectedRevision, rules);
  }

  /** 记录一批规则命中审计。调用方：proxy-service 在 captureExchange 关联 exchange 后。 */
  async appendRuleHits(
    exchangeId: string,
    hits: readonly RuleHitInput[],
  ): Promise<void> {
    this.captureStore.appendRuleHits(exchangeId, hits);
  }

  /** 追加 WebSocket 有序应用消息；payload 已写入 TemporaryBodyStore。 */
  async appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    this.captureStore.appendWebSocketFrames(exchangeId, frames);
  }

  async queryWebSocketFrames(query: WebSocketFrameQuery): Promise<WebSocketFramePage> {
    return this.captureStore.queryWebSocketFrames(query);
  }

  /** 按 ruleId 聚合的累计规则命中次数。调用方：rules.hits handler。 */
  async countRuleHits(): Promise<RuleHitCount[]> {
    return this.captureStore.countRuleHits();
  }

  /**
  * 汇总当前 Core 临时 Capture/Body 用量，形成面向 Renderer 的状态报表。
   * 调用方：storage.status command handler。
   */
  async status(): Promise<StorageStatusReport> {
    const stats = this.captureStore.getStorageStats();
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
   * 调用方：storage.cleanup command handler（用户确认后）。
   */
  async cleanup(scope: CleanupScope): Promise<StorageStatusReport> {
    const result = this.captureStore.cleanup(scope);
    if (scope.kind === 'all' || scope.kind === 'all-except-session') {
      await this.bodyStore.reset();
    } else {
      await this.bodyStore.collectGarbage(result.referencedBlobHashes);
    }
    return this.status();
  }

  /** 回收未被任何保留记录引用的临时 Body，不删除 Capture metadata。 */
  async collectUnreferencedBodies(): Promise<void> {
    await this.bodyStore.collectGarbage(
      this.captureStore.referencedBlobHashes(),
    );
  }

  /**
  * 按内容 hash 从 TemporaryBodyStore 读取一段正文字节。
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
    signal: AbortSignal,
    onProgress: TransferProgressListener,
  ): Promise<TransferResult> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const total = this.bodyStore.getSize(blobHash);
    const output = await open(temporaryPath, 'wx');
    let source: ReturnType<TemporaryBodyStore['openReadStream']> | null = null;
    let processed = 0;

    try {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
      }
      source = this.bodyStore.openReadStream(blobHash);
      for await (const chunk of source) {
        if (signal.aborted) {
          throw signal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
        }
        const buffer = Buffer.from(chunk);
        await output.writeFile(buffer);
        processed += buffer.byteLength;
        onProgress({ processed, total });
      }
      if (signal.aborted) {
        throw signal.reason ?? new DOMException('Transfer cancelled.', 'AbortError');
      }
      await output.sync();
      await output.close();
      await rm(filePath, { force: true });
      await rename(temporaryPath, filePath);
      return { processed, total, warnings: [] };
    } catch (error) {
      source?.destroy();
      await output.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  /** 释放全部临时 Capture/Body 并关闭持久 RuleStore。 */
  async dispose(): Promise<void> {
    this.captureStore.clear();
    await this.bodyStore.dispose();
    this.ruleStore.dispose();
  }
}
