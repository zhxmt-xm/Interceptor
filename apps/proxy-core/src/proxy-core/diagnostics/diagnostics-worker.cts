import { parentPort, workerData } from 'node:worker_threads';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import { openDiagnosticsDatabase } from './diagnostics-database';
import {
  DiagnosticsStore,
  type DiagnosticsQuery,
} from './diagnostics-store';
import type {
  DiagnosticsWorkerData,
  DiagnosticsWorkerRequest,
  DiagnosticsWorkerResponse,
} from './diagnostics-worker-protocol';

/**
 * Diagnostics Worker 线程入口。
 *
 * 独占 `diagnostics.sqlite` 连接，批量持久化脱敏日志并服务分页查询。写入失败只累加
 * 丢弃计数、不抛回主线程，从而保证日志链路永不阻塞或回滚捕获数据面。该文件由 esbuild
 * 单独打包为 diagnostics-worker.cjs，与 entry.cjs 同目录部署。
 */

if (!parentPort) {
  throw new Error('diagnostics-worker must run as a worker thread');
}
const channel = parentPort;
const data = workerData as DiagnosticsWorkerData;

let store: DiagnosticsStore;
try {
  const { db } = openDiagnosticsDatabase(data.databaseLocation);
  store = new DiagnosticsStore(db, {
    maxRecords: data.maxRecords,
    maxAgeMs: data.maxAgeMs,
  });
} catch (error) {
  channel.postMessage({
    type: 'fatal',
    message: error instanceof Error ? error.message : 'unknown open error',
  } satisfies DiagnosticsWorkerResponse);
  throw error;
}

channel.postMessage({ type: 'ready' } satisfies DiagnosticsWorkerResponse);

channel.on('message', (request: DiagnosticsWorkerRequest) => {
  switch (request.type) {
    case 'write':
      persist(request.records);
      return;
    case 'dropped':
      safe(() => store.incrementDropped(request.count));
      return;
    case 'query':
      runQuery(request.requestId, request.query);
      return;
    case 'close':
      safe(() => store.close());
      channel.postMessage({
        type: 'closed',
        requestId: request.requestId,
      } satisfies DiagnosticsWorkerResponse);
      channel.close();
      return;
    default: {
      const exhaustive: never = request;
      void exhaustive;
    }
  }
});

/**
 * 批量持久化日志；失败时累加丢弃计数而非抛出，保证日志不阻塞或回滚捕获。
 */
function persist(records: readonly DiagnosticLogRecord[]): void {
  try {
    store.insertBatch(records);
  } catch {
    safe(() => store.incrementDropped(records.length));
  }
}

function runQuery(requestId: number, query: DiagnosticsQuery): void {
  try {
    const result = store.query(query);
    channel.postMessage({
      type: 'query-result',
      requestId,
      ok: true,
      result,
    } satisfies DiagnosticsWorkerResponse);
  } catch (error) {
    channel.postMessage({
      type: 'query-result',
      requestId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : 'unknown error',
      },
    } satisfies DiagnosticsWorkerResponse);
  }
}

function safe(operation: () => void): void {
  try {
    operation();
  } catch {
    // 诊断自身故障不得影响 Worker 主循环。
  }
}
