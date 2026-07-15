import type { CoreDiagnosticRecord } from '../../../shared/desktop-api';
import type { TimelineEntry } from '../../components';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Outcome = 'ok' | 'fail' | 'cx' | 'to';

/** 一次 command 执行聚合出的表格行（按 requestId 归并 phase 记录）。 */
export interface TraceRow {
  key: string;
  traceId?: string;
  requestId?: string;
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
  return record.requestId ?? `seq-${record.sequence}`;
}

/** 把扁平的诊断记录按 requestId 聚合成一次次 command 执行行，最新在前。 */
export function aggregateTraces(
  records: readonly CoreDiagnosticRecord[],
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
    const { outcome, outcomeLabel } = mapOutcome(outcomeSource.outcome, level);
    rows.push({
      key,
      traceId: first.traceId,
      requestId: first.requestId,
      command: sorted.find((record) => record.command)?.command ?? first.phase,
      time: formatClock(first.timestamp),
      level,
      outcome,
      outcomeLabel,
      duration:
        completed?.durationMs != null
          ? formatDuration(completed.durationMs)
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
      time: formatDuration(record.durationMs ?? offset),
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
): { outcome: Outcome; outcomeLabel: string } {
  switch (outcome) {
    case 'success':
      return { outcome: 'ok', outcomeLabel: 'success' };
    case 'failed':
      return { outcome: 'fail', outcomeLabel: 'failed' };
    case 'cancelled':
      return { outcome: 'cx', outcomeLabel: 'cancelled' };
    case 'timed_out':
      return { outcome: 'to', outcomeLabel: 'timed_out' };
    default:
      return level === 'error'
        ? { outcome: 'fail', outcomeLabel: 'failed' }
        : { outcome: 'ok', outcomeLabel: 'ok' };
  }
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number, length = 2): string =>
    String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}.${pad(date.getMilliseconds(), 3)}`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0 ms';
  }
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
