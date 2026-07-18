import type { CoreDiagnosticRecord } from '../../../shared/desktop-api';
import type { TimelineEntry } from '../../components';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Outcome = 'ok' | 'fail' | 'cx' | 'to';

export interface OutcomeLabels {
  success: string;
  failed: string;
  cancelled: string;
  timedOut: string;
  ok: string;
}

const ENGLISH_OUTCOME_LABELS: OutcomeLabels = {
  success: 'success',
  failed: 'failed',
  cancelled: 'cancelled',
  timedOut: 'timed_out',
  ok: 'ok',
};

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

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 聚合键：一次 command 执行共享 requestId；无 requestId 的记录按 sequence 独立成行。 */
function groupKey(record: CoreDiagnosticRecord): string {
  return record.requestId ??
    `${record.process}:${record.timestamp}:${record.sequence}`;
}

/** 把扁平的诊断记录按 requestId 聚合成一次次 command 执行行，最新在前。 */
export function aggregateTraces(
  records: readonly CoreDiagnosticRecord[],
  locale = 'en',
  labels: OutcomeLabels = ENGLISH_OUTCOME_LABELS,
): TraceRow[] {
  const groups = new Map<string, CoreDiagnosticRecord[]>();
  for (const record of records) {
    const key = groupKey(record);
    const list = groups.get(key);
    if (list) {
      list.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const rows: TraceRow[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.sequence - b.sequence);
    const [first] = sorted;
    if (!first) {
      continue;
    }
    const completed = sorted.find(
      (record) => record.phase === 'command.completed',
    );
    const outcomeSource = completed ?? sorted[sorted.length - 1] ?? first;
    const level = pickLevel(sorted);
    const { outcome, outcomeLabel } = mapOutcome(outcomeSource.outcome, level, labels);
    rows.push({
      key,
      traceId: first.traceId,
      requestId: first.requestId,
      process: first.process,
      command: sorted.find((record) => record.command)?.command ?? first.phase,
      time: formatClock(first.timestamp, locale),
      level,
      outcome,
      outcomeLabel,
      duration:
        completed?.durationMs != null
          ? formatDuration(completed.durationMs, locale)
          : '—',
      seq: first.sequence,
    });
  }

  return rows.sort((a, b) => a.seq - b.seq);
}

/** 取一次执行内的记录集合（按聚合 key）。 */
export function selectTraceRecords(
  records: readonly CoreDiagnosticRecord[],
  key: string | null,
): CoreDiagnosticRecord[] {
  if (!key) {
    return [];
  }
  return records.filter((record) => groupKey(record) === key);
}

/** 把某次 command 执行的记录展开成 Action 时间线条目（按 sequence 递增）。 */
export function buildTimeline(
  records: readonly CoreDiagnosticRecord[],
  locale = 'en',
): TimelineEntry[] {
  const sorted = [...records].sort((a, b) => a.sequence - b.sequence);
  const [firstRecord] = sorted;
  if (!firstRecord) {
    return [];
  }
  const base = Date.parse(firstRecord.timestamp);
  return sorted.map((record, index) => {
    const offset = Date.parse(record.timestamp) - base;
    return {
      label: record.action ? `${record.phase} · ${record.action}` : record.phase,
      time: formatDuration(record.durationMs ?? offset, locale),
      width: Math.max(4, Math.round(((index + 1) / sorted.length) * 100)),
    };
  });
}

function pickLevel(records: readonly CoreDiagnosticRecord[]): LogLevel {
  return records.reduce<LogLevel>(
    (max, record) =>
      LEVEL_RANK[record.level] > LEVEL_RANK[max] ? record.level : max,
    'debug',
  );
}

function mapOutcome(
  outcome: CoreDiagnosticRecord['outcome'],
  level: LogLevel,
  labels: OutcomeLabels,
): { outcome: Outcome; outcomeLabel: string } {
  switch (outcome) {
    case 'success':
      return { outcome: 'ok', outcomeLabel: labels.success };
    case 'failed':
      return { outcome: 'fail', outcomeLabel: labels.failed };
    case 'cancelled':
      return { outcome: 'cx', outcomeLabel: labels.cancelled };
    case 'timed_out':
      return { outcome: 'to', outcomeLabel: labels.timedOut };
    default:
      return level === 'error'
        ? { outcome: 'fail', outcomeLabel: labels.failed }
        : { outcome: 'ok', outcomeLabel: labels.ok };
  }
}

function formatClock(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(date);
}

function formatDuration(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0 ms';
  }
  return ms < 1000
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms)} ms`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}
