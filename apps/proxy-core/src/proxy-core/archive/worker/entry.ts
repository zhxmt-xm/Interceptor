import { parentPort, workerData, type MessagePort } from 'node:worker_threads';

import type {
  ArchiveWorkerData,
  ArchiveWorkerRequestEnvelope,
  ArchiveWorkerResponse,
} from '../interfaces';
import { ArchiveSnapshotStore } from './worker-snapshot-store';

/** 一次性 Archive SQLite Worker；任务完成后关闭，不参与活动 Capture 数据面。 */
class ArchiveWorkerApplication {
  /** 与 Core 主线程通信的端口。 */
  private readonly port: MessagePort;
  /** 当前单次导入或导出的 SQLite Store。 */
  private readonly store: ArchiveSnapshotStore;
  /** 当前 Worker 模式。 */
  private readonly mode: ArchiveWorkerData['mode'];

  /** 校验线程环境并打开指定 archive snapshot。 */
  constructor() {
    if (!parentPort) {
      throw new Error('archive worker must run as a worker thread');
    }
    this.port = parentPort;
    const data = workerData as ArchiveWorkerData;
    this.mode = data.mode;
    this.store = new ArchiveSnapshotStore(data.snapshotPath, data.mode);
  }

  /** 发布 ready 并串行处理有界批次请求。 */
  start(): void {
    this.port.postMessage({ type: 'ready' } satisfies ArchiveWorkerResponse);
    this.port.on('message', (envelope: ArchiveWorkerRequestEnvelope) => {
      this.handle(envelope);
    });
  }

  /** 按模式分派请求并返回关联响应。 */
  private handle(envelope: ArchiveWorkerRequestEnvelope): void {
    const { requestId, request } = envelope;
    try {
      let result: unknown;
      if (request.kind === 'append-batch') {
        this.assertMode('export');
        this.store.appendBatch(request.batch);
      } else if (request.kind === 'read-batch') {
        this.assertMode('import');
        result = this.store.readBatch(request.cursor, request.limit);
      } else {
        this.store.close();
      }
      this.port.postMessage({
        type: 'result',
        requestId,
        ok: true,
        result,
      } satisfies ArchiveWorkerResponse);
      if (request.kind === 'finish') {
        this.port.close();
      }
    } catch (error) {
      this.port.postMessage({
        type: 'result',
        requestId,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      } satisfies ArchiveWorkerResponse);
    }
  }

  /** 拒绝与当前一次性 Worker 模式不匹配的请求。 */
  private assertMode(expected: ArchiveWorkerData['mode']): void {
    if (this.mode !== expected) {
      throw new Error(`Archive worker is in ${this.mode} mode.`);
    }
  }
}

try {
  new ArchiveWorkerApplication().start();
} catch (error) {
  parentPort?.postMessage({
    type: 'fatal',
    message: error instanceof Error ? error.message : 'unknown startup error',
  } satisfies ArchiveWorkerResponse);
  throw error;
}
