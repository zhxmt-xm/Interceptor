import type {
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
  DiagnosticProcess,
} from '@interceptor/core-protocol';
import type { DatabaseSync } from 'node:sqlite';


export interface DiagnosticsQuery {
  /** 不透明的递减 id 游标。 */
  readonly cursor?: string;
  /** 单页最大记录数。 */
  readonly limit: number;
  /** 可选日志级别过滤。 */
  readonly level?: DiagnosticLevel;
  /** 可选进程来源过滤。 */
  readonly process?: DiagnosticProcess;
  /** 可选命令结果过滤。 */
  readonly outcome?: DiagnosticOutcome;
  /** 可选 trace 过滤。 */
  readonly traceId?: string;
  /** 可选 command 名称过滤。 */
  readonly command?: string;
  /** 可选最小耗时（毫秒，含边界）。 */
  readonly minDurationMs?: number;
  /** 可选最大耗时（毫秒，含边界）。 */
  readonly maxDurationMs?: number;
}

export interface DiagnosticsPage {
  /** 当前页日志记录。 */
  readonly records: DiagnosticLogRecord[];
  /** 下一页游标。 */
  readonly nextCursor?: string;
  /** 是否仍有更旧记录。 */
  readonly hasMore: boolean;
  /** 累计丢弃记录数。 */
  readonly droppedCount: number;
}

export interface PendingDiagnosticsQuery {
  /** 完成查询 Promise。 */
  resolve(page: DiagnosticsPage): void;
  /** 拒绝查询 Promise。 */
  reject(error: Error): void;
}

export interface DiagnosticsLogRow {
  /** SQLite 主键。 */
  id: number;
  /** UTC epoch 毫秒。 */
  ts_ms: number;
  /** 原始 ISO 时间戳。 */
  timestamp: string;
  /** Core 内单调日志序号。 */
  sequence: number;
  /** 日志级别。 */
  level: string;
  /** 进程来源。 */
  process: string;
  /** 可选 trace ID。 */
  trace_id: string | null;
  /** 可选 request ID。 */
  request_id: string | null;
  /** 可选命令名。 */
  command: string | null;
  /** 生命周期 phase。 */
  phase: string;
  /** 可选业务 action。 */
  action: string | null;
  /** 可选耗时。 */
  duration_ms: number | null;
  /** 可选结果状态。 */
  outcome: string | null;
  /** 可选错误码。 */
  error_code: string | null;
  /** JSON 编码的安全属性。 */
  attributes: string | null;
}

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
  /** diagnostics.sqlite 路径。 */
  readonly databaseLocation: string;
}

export interface OpenDiagnosticsDatabaseResult {
  /** Worker 独占 SQLite 连接。 */
  readonly db: DatabaseSync;
}