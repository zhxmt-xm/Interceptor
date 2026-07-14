import path from 'node:path';
import { Worker } from 'node:worker_threads';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import type { DiagnosticsPage, DiagnosticsQuery } from './diagnostics-store';
import type {
  DiagnosticsWorkerData,
  DiagnosticsWorkerRequest,
  DiagnosticsWorkerResponse,
} from './diagnostics-worker-protocol';

/**
 * CoreApplication 依赖的诊断日志汇：生命周期 + 非阻塞写入 + 分页查询。
 */
export interface DiagnosticsLog {
  start(): Promise<void>;
  sink(records: readonly DiagnosticLogRecord[]): void;
  query(query: DiagnosticsQuery): Promise<DiagnosticsPage>;
  close(): Promise<void>;
}

export interface DiagnosticsWorkerChannel {
  postMessage(message: DiagnosticsWorkerRequest): void;
  on(event: 'message', listener: (message: DiagnosticsWorkerResponse) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  terminate(): void | Promise<number>;
}

export interface DiagnosticsWorkerHostOptions {
  readonly databaseLocation: string;
  readonly workerPath?: string;
  readonly maxRecords?: number;
  readonly maxAgeMs?: number;
  readonly maxPendingBatches?: number;
  readonly requestTimeoutMs?: number;
  readonly createChannel?: (data: DiagnosticsWorkerData) => DiagnosticsWorkerChannel;
}

interface PendingQuery {
  resolve(page: DiagnosticsPage): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_MAX_PENDING_BATCHES = 128;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Diagnostics Worker 的主线程代理，实现 DiagnosticsLog。
 *
 * 写入路径 fire-and-forget 并在 Worker 就绪前有界缓冲，保证日志永不阻塞 command 或
 * 网络路径；查询路径按 requestId 关联。Worker 崩溃时拒绝挂起查询并丢弃缓冲写入，
 * 记录聚合丢弃计数，绝不递归回灌同一 sink。
 */
export class DiagnosticsWorkerHost implements DiagnosticsLog {
  private readonly databaseLocation: string;
  private readonly workerPath: string;
  private readonly maxRecords?: number;
  private readonly maxAgeMs?: number;
  private readonly maxPendingBatches: number;
  private readonly requestTimeoutMs: number;
  private readonly createChannel: (
    data: DiagnosticsWorkerData,
  ) => DiagnosticsWorkerChannel;

  private readonly pendingWrites: DiagnosticLogRecord[][] = [];
  private readonly pendingQueries = new Map<number, PendingQuery>();
  private channel: DiagnosticsWorkerChannel | null = null;
  private ready = false;
  private failed = false;
  private closed = false;
  private droppedBeforeReady = 0;
  private nextRequestId = 1;
  private startPromise: Promise<void> | null = null;

  constructor(options: DiagnosticsWorkerHostOptions) {
    this.databaseLocation = options.databaseLocation;
    this.workerPath =
      options.workerPath ??
      path.join(__dirname, 'diagnostics', 'diagnostics-worker.cjs');
    this.maxRecords = options.maxRecords;
    this.maxAgeMs = options.maxAgeMs;
    this.maxPendingBatches = options.maxPendingBatches ?? DEFAULT_MAX_PENDING_BATCHES;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.createChannel =
      options.createChannel ??
      ((data) => new Worker(this.workerPath, { workerData: data }));
  }

  /**
   * 启动 Diagnostics Worker，就绪后回放缓冲写入；重复调用返回同一启动 Promise。
   * 调用方：CoreApplication.initializeDiagnostics。
   */
  start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = new Promise<void>((resolve, reject) => {
      const channel = this.createChannel({
        databaseLocation: this.databaseLocation,
        maxRecords: this.maxRecords,
        maxAgeMs: this.maxAgeMs,
      });
      this.channel = channel;

      channel.on('message', (message) => {
        if (message.type === 'ready') {
          this.ready = true;
          this.flushPendingWrites();
          resolve();
          return;
        }
        if (message.type === 'fatal') {
          this.markFailed(new Error(`diagnostics worker fatal: ${message.message}`));
          reject(new Error(message.message));
          return;
        }
        if (message.type === 'query-result') {
          this.settleQuery(message);
        }
      });
      channel.on('error', (error) => {
        this.markFailed(error);
        if (!this.ready) {
          reject(error);
        }
      });
      channel.on('exit', (code) => {
        if (!this.closed) {
          this.markFailed(new Error(`diagnostics worker exited with code ${code}`));
        }
      });
    });
    return this.startPromise;
  }

  /**
   * 非阻塞写入一批日志：就绪则直接投递，否则有界缓冲；超限丢弃并累计计数。
   * 调用方：CoreDiagnostics 的 sink。
   */
  sink(records: readonly DiagnosticLogRecord[]): void {
    if (this.closed || this.failed || records.length === 0) {
      if ((this.failed || this.closed) && records.length > 0) {
        this.droppedBeforeReady += records.length;
      }
      return;
    }
    if (this.ready && this.channel) {
      this.channel.postMessage({ type: 'write', records: [...records] });
      return;
    }
    if (this.pendingWrites.length >= this.maxPendingBatches) {
      const dropped = this.pendingWrites.shift();
      this.droppedBeforeReady += dropped?.length ?? 0;
    }
    this.pendingWrites.push([...records]);
  }

  /**
   * 分页查询已持久化的诊断记录；未启动或已关闭时 reject。
   * 调用方：diagnostics.query command handler。
   */
  query(query: DiagnosticsQuery): Promise<DiagnosticsPage> {
    if (this.closed || this.failed) {
      return Promise.reject(new Error('diagnostics worker is unavailable'));
    }
    const channel = this.channel;
    if (!channel) {
      return Promise.reject(new Error('diagnostics worker is not started'));
    }

    const requestId = this.nextRequestId++;
    return new Promise<DiagnosticsPage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(requestId);
        reject(new Error('diagnostics query timed out'));
      }, this.requestTimeoutMs);
      this.pendingQueries.set(requestId, { resolve, reject, timer });
      try {
        channel.postMessage({ type: 'query', requestId, query });
      } catch (error) {
        clearTimeout(timer);
        this.pendingQueries.delete(requestId);
        reject(error instanceof Error ? error : new Error('postMessage failed'));
      }
    });
  }

  /** 关闭 Worker 并释放资源。调用方：CoreApplication.stop（best-effort）。 */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const channel = this.channel;
    if (channel && this.ready) {
      try {
        channel.postMessage({ type: 'close', requestId: this.nextRequestId++ });
      } catch {
        // Worker 可能已退出。
      }
    }
    await channel?.terminate();
    this.failAllQueries(new Error('diagnostics worker closed'));
  }

  private flushPendingWrites(): void {
    if (!this.channel) {
      return;
    }
    if (this.droppedBeforeReady > 0) {
      this.channel.postMessage({ type: 'dropped', count: this.droppedBeforeReady });
      this.droppedBeforeReady = 0;
    }
    for (const records of this.pendingWrites.splice(0)) {
      this.channel.postMessage({ type: 'write', records });
    }
  }

  private settleQuery(
    message: Extract<DiagnosticsWorkerResponse, { type: 'query-result' }>,
  ): void {
    const pending = this.pendingQueries.get(message.requestId);
    if (!pending) {
      return;
    }
    this.pendingQueries.delete(message.requestId);
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      pending.reject(error);
    }
  }

  private markFailed(error: Error): void {
    this.failed = true;
    this.failAllQueries(error);
  }

  private failAllQueries(error: Error): void {
    for (const [requestId, pending] of this.pendingQueries) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.pendingQueries.delete(requestId);
      pending.reject(error);
    }
  }
}
