import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { GLOBAL_QUOTA_BYTES } from '../constants';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import { BlobStore } from './host/host-blob-store';
import { StorageWorkerHost } from './host/host-worker';
import type { ExchangeResponsePatch } from './protocol';
import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  SessionQuery,
  SessionQueryPage,
} from './types';

/**
 * 面向 Renderer 用量报表的存储状态快照，合并 SQLite 与 Blob 磁盘占用。
 */
export interface StorageStatusReport {
  readonly sessionCount: number;
  readonly exchangeCount: number;
  readonly bodyCount: number;
  readonly databaseBytes: number;
  readonly blobBytes: number;
  readonly totalBytes: number;
  readonly quotaBytes: number;
}

/**
 * Proxy Core 存储门面，由 CoreApplication 独占拥有。
 *
 * 组合独占 SQLite 连接的 Storage Worker 与内容寻址 Blob Store：写入与查询走 Worker
 * 串行化，正文走 Blob 流式管道，清理时先删 DB 记录再按引用集合 GC 磁盘 Blob。
 * 对上只暴露意图型方法，不泄漏数据库句柄或 Blob 路径。
 */
export class StorageService {
  private readonly host = new StorageWorkerHost();
  private readonly blobStore = new BlobStore();
  private readonly quotaBytes = GLOBAL_QUOTA_BYTES;
  private ready: Promise<void> | null = null;

  /** 注入诊断汇并转交给 Storage Worker 代理。调用方：CoreApplication 装配后。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.host.attachDiagnostics(sink);
  }

  /**
   * 启动 Storage Worker 并初始化 Blob Store；重复调用返回同一初始化 Promise。
   * 调用方：CoreApplication.start。
   */
  initialize(): Promise<void> {
    if (!this.ready) {
      this.ready = Promise.all([this.host.start(), this.blobStore.init()]).then(
        () => undefined,
      );
    }
    return this.ready;
  }

  ensureSession(session: CaptureSessionInput): Promise<void> {
    return this.host.ensureSession(session);
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    return this.host.appendExchanges(exchanges);
  }

  updateExchange(patch: ExchangeResponsePatch): Promise<void> {
    return this.host.updateExchange(patch);
  }

  /** 写入一段正文，返回内容寻址结果供 body_ref 记录。调用方：M3 正文管道。 */
  writeBody(source: AsyncIterable<Uint8Array>) {
    return this.blobStore.writeStream(source);
  }

  querySessions(query: SessionQuery): Promise<SessionQueryPage> {
    return this.host.querySessions(query);
  }

  /** 按需读取单条 Exchange 详情（摘要 + 头部 + 正文引用）。调用方：sessions.detail handler。 */
  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null> {
    return this.host.getExchangeDetail(exchangeId);
  }

  /**
   * 汇总 SQLite 与 Blob 磁盘用量，形成面向 Renderer 的存储状态报表。
   * 调用方：storage.status command handler。
   */
  async status(): Promise<StorageStatusReport> {
    const stats = await this.host.storageStatus();
    const blobBytes = this.blobStore.usageBytes;
    return {
      sessionCount: stats.sessionCount,
      exchangeCount: stats.exchangeCount,
      bodyCount: stats.bodyRefCount,
      databaseBytes: stats.databaseBytes,
      blobBytes,
      totalBytes: stats.databaseBytes + blobBytes,
      quotaBytes: this.quotaBytes,
    };
  }

  /**
   * 删除指定范围的捕获数据，随后按剩余引用集合 GC 孤立 Blob。
   * 调用方：storage.cleanup command handler（用户确认后）。
   */
  async cleanup(scope: CleanupScope): Promise<StorageStatusReport> {
    const result = await this.host.cleanup(scope);
    await this.blobStore.collectGarbage(result.referencedBlobHashes);
    return this.status();
  }

  /**
   * 读取一段正文字节，先经 body_ref 解析内容 hash 再从 Blob Store 分块读取。
   * 调用方：body.read-range command handler。
   */
  async readBodyRange(
    blobHash: string,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    return this.blobStore.readRange(blobHash, offset, length);
  }

  /** 关闭 Storage Worker 并释放资源。调用方：CoreApplication.stop。 */
  async dispose(): Promise<void> {
    await this.host.close();
  }
}
