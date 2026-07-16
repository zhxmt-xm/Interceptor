import type {
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
} from '@interceptor/core-protocol';
import { DatabaseSync } from 'node:sqlite';

import { applyMigrations } from '../../migration-runner';
import { DIAGNOSTICS_BUSY_TIMEOUT_MS } from '../diagnostics-constants';
import type {
  DiagnosticsLogRow,
  OpenDiagnosticsDatabaseResult,
} from '../interfaces';
import { DIAGNOSTICS_MIGRATIONS } from '../worker/worker-schema';

/** 打开独立 Diagnostics SQLite、配置 pragma 并执行迁移。 */
export function openDiagnosticsDatabase(
  location: string,
): OpenDiagnosticsDatabaseResult {
  const db = new DatabaseSync(location);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(`PRAGMA busy_timeout = ${DIAGNOSTICS_BUSY_TIMEOUT_MS}`);
    const migration = applyMigrations(db, DIAGNOSTICS_MIGRATIONS);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}

/** 将 SQLite row 映射回 wire 日志记录。 */
export function toLogRecord(row: DiagnosticsLogRow): DiagnosticLogRecord {
  return {
    timestamp: row.timestamp,
    sequence: row.sequence,
    level: row.level as DiagnosticLevel,
    process: 'proxy-core',
    traceId: row.trace_id ?? undefined,
    requestId: row.request_id ?? undefined,
    command: (row.command ?? undefined) as DiagnosticLogRecord['command'],
    phase: row.phase,
    action: row.action ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    outcome: (row.outcome ?? undefined) as DiagnosticOutcome | undefined,
    errorCode: row.error_code ?? undefined,
    attributes: parseAttributes(row.attributes),
  };
}

/** 解析数据库中的 JSON 属性；损坏值降级为 undefined。 */
export function parseAttributes(
  value: string | null,
): DiagnosticLogRecord['attributes'] {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as DiagnosticLogRecord['attributes'];
  } catch {
    return undefined;
  }
}

/** 将 ISO 时间戳转换为 epoch 毫秒，无效值回退当前时间。 */
export function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** 解码正整数 SQLite id 游标；非法输入视为无游标。 */
export function decodeCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) {
    return null;
  }
  const value = Number(cursor);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}