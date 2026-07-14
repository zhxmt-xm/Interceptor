import path from 'node:path';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { BlobStore } from './blob-store';
import { StorageWorkerHost } from './storage-worker-host';
import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  SessionQuery,
  SessionQueryPage,
} from './types';
import type { ExchangeResponsePatch } from './storage-worker-protocol';

export interface StorageServiceOptions {
  /** 存储根目录；capture.sqlite 与 blobs/ 都在其下。 */
  readonly dataDir: string;
  readonly maxBodyBytes?: number;
  readonly globalQuotaBytes?: number;
  /** 覆盖 Storage Worker bundle 路径；仅测试从源码运行时需要。 */
  readonly workerPath?: string;
  /** 测试注入：替换 Storage Worker host 与 blob store。 */
  readonly host?: StorageWorkerHost;
  readonly blobStore?: BlobStore;
}

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

const CAPTURE_DB_FILE = 'capture.sqlite';
const BLOB_DIR = 'blobs';
const DEFAULT_GLOBAL_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Proxy Core 存储门面，由 CoreApplication 独占拥有。
 *
 * 组合独占 SQLite 连接的 Storage Worker 与内容寻址 Blob Store：写入与查询走 Worker
 * 串行化，正文走 Blob 流式管道，清理时先删 DB 记录再按引用集合 GC 磁盘 Blob。
 * 对上只暴露意图型方法，不泄漏数据库句柄或 Blob 路径。
 */
export class StorageService {
  private readonly host: StorageWorkerHost;
  private readonly blobStore: BlobStore;
  private readonly quotaBytes: number;
  private ready: Promise<void> | null = null;

  constructor(options: StorageServiceOptions) {
    this.quotaBytes = options.globalQuotaBytes ?? DEFAULT_GLOBAL_QUOTA_BYTES;
    this.host =
      options.host ??
      new StorageWorkerHost({
        databaseLocation: path.join(options.dataDir, CAPTURE_DB_FILE),
        workerPath: options.workerPath,
      });
    this.blobStore =
      options.blobStore ??
      new BlobStore({
        rootDir: path.join(options.dataDir, BLOB_DIR),
        maxBodyBytes: options.maxBodyBytes,
        globalQuotaBytes: this.quotaBytes,
      });
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
