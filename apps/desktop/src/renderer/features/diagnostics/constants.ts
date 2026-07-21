import type {
  DiagnosticLevelFilter,
  DiagnosticOutcomeFilter,
  DiagnosticProcessFilter,
  LogLevel,
  OutcomeLabels,
} from './interfaces';

export const ENGLISH_OUTCOME_LABELS: OutcomeLabels = {
  success: 'success',
  failed: 'failed',
  cancelled: 'cancelled',
  timedOut: 'timed_out',
  ok: 'ok',
};

export const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Diagnostics 首页每次拉取条数。 */
export const RECENT_LIMIT = 200;
/** 诊断列表轮询间隔。 */
export const POLL_INTERVAL_MS = 2000;
/** 导出任务进度轮询间隔。 */
export const JOB_POLL_MS = 300;

export const LEVEL_CYCLE: DiagnosticLevelFilter[] = [
  null,
  'error',
  'warn',
  'info',
  'debug',
];
export const PROCESS_CYCLE: DiagnosticProcessFilter[] = [
  null,
  'core',
  'main',
  'renderer',
];
export const OUTCOME_CYCLE: DiagnosticOutcomeFilter[] = [
  null,
  'success',
  'failed',
  'cancelled',
  'timed_out',
];
