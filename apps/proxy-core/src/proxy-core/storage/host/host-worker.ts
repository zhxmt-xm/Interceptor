import { Worker } from 'node:worker_threads';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import {
  STORAGE_REQUEST_TIMEOUT_MS,
  captureDatabasePath,
  storageWorkerEntry,
} from '../../constants';
import type {
  CaptureSessionInput,
  CleanupResult,
  CleanupScope,
  ExchangeInput,
  SessionQuery,
  SessionQueryPage,
  StorageStats,
} from '../types';
import type {
  ExchangeResponsePatch,
  StorageWorkerData,
  StorageWorkerRequest,
  StorageWorkerRequestEnvelope,
  StorageWorkerResponse,
} from '../protocol';
import type { DiagnosticsRecorder } from '../../core-diagnostics';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Storage Worker 的主线程代理，运行在 Core（UtilityProcess）主线程。
 *
 * 负责启动 Worker、按 requestId 关联请求/响应、传播错误并在 Worker 崩溃时拒绝所有
 * 挂起请求。它不触碰 SQLite，只把意图转发给独占数据库连接的 Worker，从而保证
 * 网络事件循环不因存储 I/O 阻塞。Worker bundle 与数据库路径从中央运行期配置读取。
 */
export class StorageWorkerHost {
  private readonly requestTimeoutMs = STORAGE_REQUEST_TIMEOUT_MS;
  private readonly pending = new Map<number, PendingRequest>();

  private channel: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private closed = false;
  private diagnostics: DiagnosticsRecorder | null = null;

  /** 注入诊断汇；由 StorageService 在 CoreApplication 装配后转交。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /**
   * 启动 Worker 并在收到 ready 后解析；重复调用返回同一个启动 Promise。
   * 调用方：StorageService 初始化。
   */
  start(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const channel = new Worker(storageWorkerEntry, {
        workerData: {
          databaseLocation: captureDatabasePath,
        } satisfies StorageWorkerData,
      });
      this.channel = channel;

      let ready = false;
      channel.on('message', (message: StorageWorkerResponse) => {
        if (message.type === 'ready') {
          ready = true;
          this.diagnostics?.info('storage.worker-ready');
          resolve();
          return;
        }
        if (message.type === 'fatal') {
          const error = new Error(`storage worker fatal: ${message.message}`);
          this.diagnostics?.error('storage.worker-fatal', {
            errorCode: 'worker-fatal',
          });
          if (!ready) {
            reject(error);
          }
          this.failAllPending(error);
          return;
        }
        this.handleResult(message);
      });
      channel.on('error', (error) => {
        this.diagnostics?.error('storage.worker-error', {
          errorCode: error instanceof Error ? error.name : 'unknown',
        });
        if (!ready) {
          reject(error);
        }
        this.failAllPending(error);
      });
      channel.on('exit', (code) => {
        const error = new Error(`storage worker exited with code ${code}`);
        if (!this.closed) {
          this.diagnostics?.error('storage.worker-exit', {
            attributes: { code },
          });
        }
        if (!ready) {
          reject(error);
        }
        this.failAllPending(error);
      });
    });

    return this.readyPromise;
  }

  ensureSession(session: CaptureSessionInput): Promise<void> {
    return this.request<void>({ kind: 'ensure-session', session });
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    return this.request({ kind: 'append-exchanges', exchanges });
  }

  updateExchange(patch: ExchangeResponsePatch): Promise<void> {
    return this.request<void>({ kind: 'update-exchange', patch });
  }

  querySessions(query: SessionQuery): Promise<SessionQueryPage> {
    return this.request({ kind: 'query-sessions', query });
  }

  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null> {
    return this.request({ kind: 'exchange-detail', exchangeId });
  }

  storageStatus(): Promise<StorageStats> {
    return this.request({ kind: 'storage-status' });
  }

  cleanup(scope: CleanupScope): Promise<CleanupResult> {
    return this.request({ kind: 'cleanup', scope });
  }

  referencedHashes(): Promise<string[]> {
    return this.request({ kind: 'referenced-hashes' });
  }

  /**
   * 请求 Worker 关闭数据库，等待其确认后终止线程并拒绝残余请求。
   * 调用方：StorageService.dispose；重复调用保持幂等。
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.request<void>({ kind: 'close' });
    } catch {
      // Worker 可能已退出；无论如何都继续终止。
    }
    await this.channel?.terminate();
    this.failAllPending(new Error('storage worker closed'));
  }

  private request<T>(request: StorageWorkerRequest): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('storage worker host is closed'));
    }
    if (!this.channel) {
      return Promise.reject(new Error('storage worker host is not started'));
    }

    const requestId = this.nextRequestId++;
    const channel = this.channel;
    return new Promise<T>((resolve, reject) => {
      const timer =
        this.requestTimeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(requestId);
              reject(
                new Error(
                  `storage request '${request.kind}' timed out after ${this.requestTimeoutMs}ms`,
                ),
              );
            }, this.requestTimeoutMs)
          : null;

      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const envelope: StorageWorkerRequestEnvelope = { requestId, request };
      try {
        channel.postMessage(envelope);
      } catch (error) {
        this.settle(requestId, () =>
          reject(error instanceof Error ? error : new Error('postMessage failed')),
        );
      }
    });
  }

  private handleResult(
    message: Extract<StorageWorkerResponse, { type: 'result' }>,
  ): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(message.requestId);
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

  private settle(requestId: number, run: () => void): void {
    const pending = this.pending.get(requestId);
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    this.pending.delete(requestId);
    run();
  }

  private failAllPending(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.pending.delete(requestId);
      pending.reject(error);
    }
  }
}
