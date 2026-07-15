import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import type { DiagnosticsPage, DiagnosticsQuery } from './worker/worker-store';

/**
 * Diagnostics Worker 与主线程 host 之间的进程内消息协议。
 *
 * 写入是单向 fire-and-forget（日志必须非阻塞），查询按 requestId 关联。该协议只在
 * Proxy Core 进程内的 worker_threads 通道流转，与跨进程 core-protocol 独立。
 */

export type DiagnosticsWorkerRequest =
  | { readonly type: 'write'; readonly records: DiagnosticLogRecord[] }
  | {
      readonly type: 'query';
      readonly requestId: number;
      readonly query: DiagnosticsQuery;
    }
  | { readonly type: 'dropped'; readonly count: number }
  | { readonly type: 'close'; readonly requestId: number };

export type DiagnosticsWorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'fatal'; readonly message: string }
  | { readonly type: 'closed'; readonly requestId: number }
  | {
      readonly type: 'query-result';
      readonly requestId: number;
      readonly ok: true;
      readonly result: DiagnosticsPage;
    }
  | {
      readonly type: 'query-result';
      readonly requestId: number;
      readonly ok: false;
      readonly error: { readonly name: string; readonly message: string };
    };

export interface DiagnosticsWorkerData {
  readonly databaseLocation: string;
}
