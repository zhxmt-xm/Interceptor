import { Worker } from 'node:worker_threads';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import {
  diagnosticsDatabasePath,
  diagnosticsWorkerEntry,
} from '../../constants';
import type {
  DiagnosticsPage,
  DiagnosticsQuery,
  PendingDiagnosticsQuery,
  DiagnosticsWorkerData,
  DiagnosticsWorkerRequest,
  DiagnosticsWorkerResponse,
} from '../interfaces';

/**
 * Diagnostics Worker 的主线程代理：非阻塞写入 + 分页查询 + 生命周期。
 *
 * 写入路径 fire-and-forget 并在 Worker 就绪前完整缓冲，保证日志永不阻塞 command 或
 * 网络路径；查询路径按 requestId 关联。Worker 崩溃时拒绝挂起查询并丢弃缓冲写入，
 * 记录聚合丢弃计数，绝不递归回灌同一 sink。Worker bundle 与数据库路径从中央运行期变量读取。
 */
export class DiagnosticsWorkerHost {

  /** Worker 就绪前的完整写入批次。 */
  private readonly pendingWrites: DiagnosticLogRecord[][] = [];
  /** 按 requestId 关联的在途查询。 */
  private readonly pendingQueries = new Map<number, PendingDiagnosticsQuery>();
  /** 当前 Diagnostics Worker 通道。 */
  private channel: Worker | null = null;
  /** Worker 是否已发布 ready。 */
  private ready = false;
  /** Worker 是否已进入不可恢复失败态。 */
  private failed = false;
  /** Host 是否已关闭。 */
  private closed = false;
  /** Worker 就绪前因缓冲上限丢弃的记录数。 */
  private droppedBeforeReady = 0;
  /** 下一条查询或 close 请求的整数 ID。 */
  private nextRequestId = 1;
  /** 幂等共享的 Worker 启动 Promise。 */
  private startPromise: Promise<void> | null = null;

  /**
   * 启动 Diagnostics Worker，就绪后回放缓冲写入；重复调用返回同一启动 Promise。
   * 调用方：CoreApplication.initializeDiagnostics。
   */
  start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = new Promise<void>((resolve, reject) => {
      const channel = new Worker(diagnosticsWorkerEntry, {
        workerData: {
          databaseLocation: diagnosticsDatabasePath,
        } satisfies DiagnosticsWorkerData,
      });
      this.channel = channel;

      channel.on('message', (message: DiagnosticsWorkerResponse) => {
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
  * 非阻塞写入一批日志：就绪则直接投递，否则完整缓冲。
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
      this.channel.postMessage({
        type: 'write',
        records: [...records],
      } satisfies DiagnosticsWorkerRequest);
      return;
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
      this.pendingQueries.set(requestId, { resolve, reject });
      try {
        channel.postMessage({
          type: 'query',
          requestId,
          query,
        } satisfies DiagnosticsWorkerRequest);
      } catch (error) {
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
        channel.postMessage({
          type: 'close',
          requestId: this.nextRequestId++,
        } satisfies DiagnosticsWorkerRequest);
      } catch {
        // Worker 可能已退出。
      }
    }
    await channel?.terminate();
    this.failAllQueries(new Error('diagnostics worker closed'));
  }

  /** Worker ready 后先上报丢弃计数，再按原顺序回放缓冲写入。 */
  private flushPendingWrites(): void {
    if (!this.channel) {
      return;
    }
    if (this.droppedBeforeReady > 0) {
      this.channel.postMessage({
        type: 'dropped',
        count: this.droppedBeforeReady,
      } satisfies DiagnosticsWorkerRequest);
      this.droppedBeforeReady = 0;
    }
    for (const records of this.pendingWrites.splice(0)) {
      this.channel.postMessage({
        type: 'write',
        records,
      } satisfies DiagnosticsWorkerRequest);
    }
  }

  /** 按 requestId 完成或拒绝一个在途查询。 */
  private settleQuery(
    message: Extract<DiagnosticsWorkerResponse, { type: 'query-result' }>,
  ): void {
    const pending = this.pendingQueries.get(message.requestId);
    if (!pending) {
      return;
    }
    this.pendingQueries.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      pending.reject(error);
    }
  }

  /** 标记 Worker 失败并拒绝全部在途查询。 */
  private markFailed(error: Error): void {
    this.failed = true;
    this.failAllQueries(error);
  }

  /** 以同一错误拒绝所有在途查询。 */
  private failAllQueries(error: Error): void {
    for (const [requestId, pending] of this.pendingQueries) {
      this.pendingQueries.delete(requestId);
      pending.reject(error);
    }
  }
}
