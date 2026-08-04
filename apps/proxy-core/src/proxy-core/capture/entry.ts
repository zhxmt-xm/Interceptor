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
  CaptureStatusReport,
  WebSocketFrameInput,
  WebSocketFramePage,
  WebSocketFrameQuery,
} from './interfaces';
import { BodyStore } from './internal/body-store';
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
  ): Promise<void> {
    this.exchangeStore.appendWebSocketFrames(exchangeId, frames);
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
    await this.bodyStore.dispose();
  }
}
