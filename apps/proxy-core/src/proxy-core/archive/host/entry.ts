import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

import { archiveWorkerEntry } from '../../constants';
import type { CaptureSnapshotBatch } from '../../storage/interfaces';
import {
  ARCHIVE_WORKER_BATCH_SIZE,
} from '../archive-constants';
import type {
  ArchiveSnapshotPage,
  ArchiveWorkerData,
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
} from '../interfaces';

/** Core 侧的一次性 Archive Worker Host；每次导入/导出独占一个线程。 */
export class ArchiveWorkerHost {
  /** 当前一次性 Worker。 */
  private worker: Worker | null = null;
  /** Worker ready Promise。 */
  private ready: Promise<void> | null = null;
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
    this.ready = (async (): Promise<void> => {
      const worker = new Worker(archiveWorkerEntry, {
        workerData: {
          mode: this.mode,
          snapshotPath: this.snapshotPath,
        } satisfies ArchiveWorkerData,
      });
      this.worker = worker;
      const message = await this.receive();
      if (message.type !== 'ready') {
        throw new Error(
          message.type === 'fatal'
            ? `archive worker fatal: ${message.message}`
            : 'archive worker did not become ready',
        );
      }
    })();
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
  }

  /** 严格串行发送一个请求并等待下一条响应。 */
  private async request<T>(request: ArchiveWorkerRequest): Promise<T> {
    if (this.closed || !this.worker) {
      throw new Error('archive worker is not running');
    }
    const response = this.receive();
    this.worker.postMessage(request);
    const message = await response;
    if (message.type !== 'result') {
      throw new Error(
        message.type === 'fatal'
          ? `archive worker fatal: ${message.message}`
          : 'archive worker returned an unexpected response',
      );
    }
    if (message.ok) {
      return message.result as T;
    }
    const error = new Error(message.error.message);
    error.name = message.error.name;
    throw error;
  }

  /** 等待 Worker 的下一条消息；Worker error 会由 events.once 自动拒绝。 */
  private async receive(): Promise<ArchiveWorkerResponse> {
    if (!this.worker) {
      throw new Error('archive worker is not running');
    }
    const [message] = await once(this.worker, 'message');
    return message as ArchiveWorkerResponse;
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
