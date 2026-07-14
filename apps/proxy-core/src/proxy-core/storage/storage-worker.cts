import { parentPort, workerData } from 'node:worker_threads';

import { openCaptureDatabase } from './capture-database';
import { CaptureStore } from './capture-store';
import { applyStorageRequest } from './storage-request-dispatch';
import type {
  StorageWorkerData,
  StorageWorkerRequestEnvelope,
  StorageWorkerResponse,
} from './storage-worker-protocol';

/**
 * Storage Worker 线程入口。
 *
 * 独占一个 Capture 数据库连接，逐条同步处理主线程请求，从而把 SQLite 写入与查询
 * 完全移出 Core 网络事件循环。worker_threads 天然一次只处理一条消息，写入因此串行化。
 * 该文件由 esbuild 单独打包为 storage-worker.cjs，与 entry.cjs 同目录部署。
 */

const port = parentPort;
if (!port) {
  throw new Error('storage-worker must run as a worker thread');
}

const { databaseLocation } = workerData as StorageWorkerData;

let store: CaptureStore;
try {
  const { db } = openCaptureDatabase(databaseLocation);
  store = new CaptureStore(db);
} catch (error) {
  const fatal: StorageWorkerResponse = {
    type: 'fatal',
    message: error instanceof Error ? error.message : 'unknown open error',
  };
  port.postMessage(fatal);
  throw error;
}

port.postMessage({ type: 'ready' } satisfies StorageWorkerResponse);

port.on('message', (envelope: StorageWorkerRequestEnvelope) => {
  const { requestId, request } = envelope;
  try {
    const result = applyStorageRequest(store, request);
    port.postMessage({
      type: 'result',
      requestId,
      ok: true,
      result,
    } satisfies StorageWorkerResponse);
    if (request.kind === 'close') {
      port.close();
    }
  } catch (error) {
    port.postMessage({
      type: 'result',
      requestId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : 'unknown error',
      },
    } satisfies StorageWorkerResponse);
  }
});
