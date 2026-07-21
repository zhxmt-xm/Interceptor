import type { CoreDiagnosticRecord } from '../../../shared/desktop-api';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Outcome = 'ok' | 'fail' | 'cx' | 'to';

export interface OutcomeLabels {
  success: string;
  failed: string;
  cancelled: string;
  timedOut: string;
  ok: string;
}

/** 一次 command 执行聚合出的表格行（按 requestId 归并 phase 记录）。 */
export interface TraceRow {
  key: string;
  traceId?: string;
  requestId?: string;
  process: CoreDiagnosticRecord['process'];
  command: string;
  time: string;
  level: LogLevel;
  outcome: Outcome;
  outcomeLabel: string;
  duration: string;
  seq: number;
}

export type DiagnosticLevelFilter = CoreDiagnosticRecord['level'] | null;
export type DiagnosticProcessFilter = CoreDiagnosticRecord['process'] | null;
export type DiagnosticOutcomeFilter =
  | NonNullable<CoreDiagnosticRecord['outcome']>
  | null;

export interface DiagnosticsContextValue {
  records: CoreDiagnosticRecord[];
  droppedCount: number;
  loading: boolean;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  refresh: () => void;
  processFilter: DiagnosticProcessFilter;
  levelFilter: DiagnosticLevelFilter;
  outcomeFilter: DiagnosticOutcomeFilter;
  cycleProcess: () => void;
  cycleLevel: () => void;
  cycleOutcome: () => void;
  exporting: boolean;
  exportError: string | null;
  exportJsonl: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}
