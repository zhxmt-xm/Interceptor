import { Worker } from 'node:worker_threads';

import { archiveWorkerEntry } from '../../constants';
import type { CaptureSnapshotBatch } from '../../storage/interfaces';
import {
  ARCHIVE_WORKER_BATCH_SIZE,
  ARCHIVE_WORKER_REQUEST_TIMEOUT_MS,
} from '../archive-constants';
import type {
  ArchiveSnapshotPage,
  ArchiveWorkerData,
  ArchiveWorkerRequest,
  ArchiveWorkerRequestEnvelope,
  ArchiveWorkerResponse,
  PendingArchiveWorkerRequest,
} from '../interfaces';

/** Core 侧的一次性 Archive Worker Host；每次导入/导出独占一个线程。 */
export class ArchiveWorkerHost {
  /** 当前一次性 Worker。 */
  private worker: Worker | null = null;
  /** Worker ready Promise。 */
  private ready: Promise<void> | null = null;
  /** requestId 到在途 Promise。 */
  private readonly pending = new Map<number, PendingArchiveWorkerRequest>();
  /** 下一个 requestId。 */
  private nextRequestId = 1;
  /** Host 是否已结束。 */
  private closed = false;

  /** 创建指定模式的一次性 Worker。 */
  constructor(
    private readonly mode: ArchiveWorkerData['mode'],
    private readonly snapshotPath: string,
  ) {}

  /** 启动 Worker 并等待 ready。 */
  start(): Promise<void> {
    if (this.ready) {
      return this.ready;
    }
    this.ready = new Promise<void>((resolve, reject) => {
      const worker = new Worker(archiveWorkerEntry, {
        workerData: {
          mode: this.mode,
          snapshotPath: this.snapshotPath,
        } satisfies ArchiveWorkerData,
      });
      this.worker = worker;
      let ready = false;
      worker.on('message', (message: ArchiveWorkerResponse) => {
        if (message.type === 'ready') {
          ready = true;
          resolve();
          return;
        }
        if (message.type === 'fatal') {
          const error = new Error(`archive worker fatal: ${message.message}`);
          if (!ready) {
            reject(error);
          }
          this.failPending(error);
          return;
        }
        this.handleResult(message);
      });
      worker.on('error', (error) => {
        if (!ready) {
          reject(error);
        }
        this.failPending(error);
      });
      worker.on('exit', (code) => {
        if (!ready) {
          reject(new Error(`archive worker exited before ready with code ${code}`));
        }
        if (!this.closed && code !== 0) {
          this.failPending(new Error(`archive worker exited with code ${code}`));
        }
      });
    });
    return this.ready;
  }

  /** 按批次写出一个 Capture 时间切面，每批等待 Worker ACK。 */
  async writeSnapshot(
    batches: AsyncIterable<CaptureSnapshotBatch>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.start();
      for await (const batch of batches) {
        this.throwIfAborted(signal);
        await this.request<void>({ kind: 'append-batch', batch });
      }
      await this.finish();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /** 逐批读取完整 archive Exchange；调用方处理完当前批次后才请求下一批。 */
  async *readSnapshotBatches(
    signal: AbortSignal,
  ): AsyncIterable<ArchiveSnapshotPage> {
    await this.start();
    let cursor: string | undefined;
    let completed = false;
    try {
      do {
        this.throwIfAborted(signal);
        const page = await this.request<ArchiveSnapshotPage>({
          kind: 'read-batch',
          cursor,
          limit: ARCHIVE_WORKER_BATCH_SIZE,
        });
        yield page;
        cursor = page.nextCursor;
        if (!page.hasMore || !cursor) {
          break;
        }
      } while (true);
      completed = true;
    } finally {
      if (completed) {
        await this.finish();
      } else {
        await this.close();
      }
    }
  }

  /** 优雅 finish 后终止线程；重复调用幂等。 */
  async finish(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      await this.request<void>({ kind: 'finish' });
    } finally {
      await this.close();
    }
  }

  /** 立即终止一次性 Worker 并拒绝在途请求。 */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.worker?.terminate();
    this.worker = null;
    this.failPending(new Error('archive worker closed'));
  }

  /** 发送关联请求并应用固定超时。 */
  private request<T>(request: ArchiveWorkerRequest): Promise<T> {
    if (this.closed || !this.worker) {
      return Promise.reject(new Error('archive worker is not running'));
    }
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `archive request '${request.kind}' timed out after ${ARCHIVE_WORKER_REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }, ARCHIVE_WORKER_REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      const envelope: ArchiveWorkerRequestEnvelope = { requestId, request };
      try {
        this.worker?.postMessage(envelope);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error('archive postMessage failed'));
      }
    });
  }

  /** 完成关联请求。 */
  private handleResult(
    message: Extract<ArchiveWorkerResponse, { type: 'result' }>,
  ): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      pending.reject(error);
    }
  }

  /** 拒绝全部在途请求。 */
  private failPending(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      pending.reject(error);
    }
  }

  /** 在取消后终止当前任务。 */
  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Archive transfer cancelled.', 'AbortError');
    }
  }
}
