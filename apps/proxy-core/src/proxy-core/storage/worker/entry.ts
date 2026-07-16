import {
  parentPort,
  workerData,
  type MessagePort,
} from 'node:worker_threads';

import type {
  StorageWorkerData,
  StorageWorkerRequestEnvelope,
  StorageWorkerResponse,
} from '../interfaces';
import * as StorageUtils from '../utils';
import { CaptureStore } from './worker-store';

/** Storage Worker 入口：独占 Capture SQLite 并串行处理主线程请求。 */
class StorageWorkerApplication {
  /** 与 Core 主线程通信的 Worker MessagePort。 */
  private readonly port: MessagePort;
  /** 独占 SQLite 连接的同步 CaptureStore。 */
  private readonly store: CaptureStore;

  /** 校验 Worker 环境、打开数据库并建立 Store。 */
  constructor() {
    if (!parentPort) {
      throw new Error('storage-worker must run as a worker thread');
    }
    this.port = parentPort;
    const { databaseLocation } = workerData as StorageWorkerData;
    try {
      const { db } = StorageUtils.openCaptureDatabase(databaseLocation);
      this.store = new CaptureStore(db);
    } catch (error) {
      this.port.postMessage({
        type: 'fatal',
        message: error instanceof Error ? error.message : 'unknown open error',
      } satisfies StorageWorkerResponse);
      throw error;
    }
  }

  /** 发布 ready 并开始逐条处理 Worker 请求。 */
  start(): void {
    this.port.postMessage({ type: 'ready' } satisfies StorageWorkerResponse);
    this.port.on('message', (envelope: StorageWorkerRequestEnvelope) => {
      this.handle(envelope);
    });
  }

  /** 分派一条请求并返回结构化成功或错误响应。 */
  private handle(envelope: StorageWorkerRequestEnvelope): void {
    const { requestId, request } = envelope;
    try {
      const result = StorageUtils.applyStorageRequest(this.store, request);
      this.port.postMessage({
        type: 'result',
        requestId,
        ok: true,
        result,
      } satisfies StorageWorkerResponse);
      if (request.kind === 'close') {
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
      } satisfies StorageWorkerResponse);
    }
  }
}

new StorageWorkerApplication().start();
