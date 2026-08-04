import {
  parentPort,
  workerData,
  type MessagePort,
} from 'node:worker_threads';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import type {
  DiagnosticsQuery,
  DiagnosticsWorkerData,
  DiagnosticsWorkerRequest,
  DiagnosticsWorkerResponse,
} from '../interfaces';
import * as DiagnosticsUtils from '../utils';
import { RecordStore } from './record-store';

/** Diagnostics Worker 入口：独占 diagnostics.sqlite 并隔离全部日志故障。 */
class DiagnosticsWorkerApplication {
  /** 与 Core 主线程通信的 Worker MessagePort。 */
  private readonly messagePort: MessagePort;
  /** 独占 SQLite 连接的同步 RecordStore。 */
  private readonly recordStore: RecordStore;

  /** 校验 Worker 环境、打开数据库并建立 Store。 */
  constructor() {
    if (!parentPort) {
      throw new Error('diagnostics worker must run as a worker thread');
    }
    this.messagePort = parentPort;
    const data = workerData as DiagnosticsWorkerData;
    try {
      const { databaseSync: db } = DiagnosticsUtils.openDiagnosticsDatabase(
        data.databaseLocation,
      );
      this.recordStore = new RecordStore(db);
    } catch (error) {
      this.messagePort.postMessage({
        type: 'fatal',
        message: error instanceof Error ? error.message : 'unknown open error',
      } satisfies DiagnosticsWorkerResponse);
      throw error;
    }
  }

  /** 发布 ready 并开始处理非阻塞写入、查询和关闭请求。 */
  start(): void {
    this.messagePort.postMessage({ type: 'ready' } satisfies DiagnosticsWorkerResponse);
    this.messagePort.on('message', (request: DiagnosticsWorkerRequest) => {
      this.handle(request);
    });
  }

  /** 分派一条 Diagnostics Worker 请求。 */
  private handle(request: DiagnosticsWorkerRequest): void {
    switch (request.type) {
      case 'write':
        this.persist(request.records);
        return;
      case 'dropped':
        this.safe(() => this.recordStore.incrementDropped(request.count));
        return;
      case 'query':
        this.runQuery(request.requestId, request.query);
        return;
      case 'close':
        this.safe(() => this.recordStore.close());
        this.messagePort.postMessage({
          type: 'closed',
          requestId: request.requestId,
        } satisfies DiagnosticsWorkerResponse);
        this.messagePort.close();
        return;
      default: {
        const exhaustive: never = request;
        void exhaustive;
      }
    }
  }

  /** 批量持久化日志；失败只增加丢弃计数。 */
  private persist(records: readonly DiagnosticLogRecord[]): void {
    try {
      this.recordStore.insertBatch(records);
    } catch {
      this.safe(() => this.recordStore.incrementDropped(records.length));
    }
  }

  /** 执行分页查询并返回结构化成功或错误响应。 */
  private runQuery(requestId: number, query: DiagnosticsQuery): void {
    try {
      const result = this.recordStore.query(query);
      this.messagePort.postMessage({
        type: 'query-result',
        requestId,
        ok: true,
        result,
      } satisfies DiagnosticsWorkerResponse);
    } catch (error) {
      this.messagePort.postMessage({
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

  /** 隔离 Diagnostics 自身故障，避免破坏 Worker 主循环。 */
  private safe(operation: () => void): void {
    try {
      operation();
    } catch {
      // 诊断自身故障不传播。
    }
  }
}

new DiagnosticsWorkerApplication().start();
