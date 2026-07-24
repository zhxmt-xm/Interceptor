import type {
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
} from '@interceptor/core-protocol';
import { DatabaseSync } from 'node:sqlite';

import type {
  DiagnosticsLogRow,
  OpenDiagnosticsDatabaseResult,
} from '../interfaces';

/** 打开独立 Diagnostics SQLite、配置 pragma 并确保当前表存在。 */
export function openDiagnosticsDatabase(
  location: string,
): OpenDiagnosticsDatabaseResult {
  const db = new DatabaseSync(location);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS log_record (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        level TEXT NOT NULL,
        process TEXT NOT NULL,
        trace_id TEXT,
        request_id TEXT,
        command TEXT,
        phase TEXT NOT NULL,
        action TEXT,
        duration_ms REAL,
        outcome TEXT,
        error_code TEXT,
        attributes TEXT
      );
      CREATE TABLE IF NOT EXISTS diagnostics_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO diagnostics_meta (key, value) VALUES ('dropped_count', 0);
      CREATE INDEX IF NOT EXISTS idx_log_ts ON log_record(ts_ms);
      CREATE INDEX IF NOT EXISTS idx_log_trace ON log_record(trace_id);
      CREATE INDEX IF NOT EXISTS idx_log_request ON log_record(request_id);
      CREATE INDEX IF NOT EXISTS idx_log_command ON log_record(command);
      CREATE INDEX IF NOT EXISTS idx_log_level ON log_record(level);
      CREATE INDEX IF NOT EXISTS idx_log_outcome ON log_record(outcome);
      CREATE INDEX IF NOT EXISTS idx_log_duration ON log_record(duration_ms);
    `);
    return { db };
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
    process: row.process as DiagnosticLogRecord['process'],
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

/**
 * 导出前再次脱敏诊断属性，防止旧库、损坏数据或未来日志调用绕过入库侧规则。
 * 敏感键整体遮罩；普通字符串若是带 query 的 URL，则遮罩全部 query 值。
 */
export function redactRecordForExport(
  record: DiagnosticLogRecord,
): DiagnosticLogRecord {
  if (!record.attributes) {
    return record;
  }
  const attributes = Object.fromEntries(
    Object.entries(record.attributes).map(([key, value]) => [
      key,
      isSensitiveAttributeKey(key)
        ? '[REDACTED]'
        : redactUrlQuery(value),
    ]),
  );
  return { ...record, attributes };
}

function isSensitiveAttributeKey(key: string): boolean {
  return /authorization|body|cookie|password|query|secret|token|url|certificate|private[_-]?key|api[_-]?key/i.test(
    key,
  );
}

function redactUrlQuery(
  value: string | number | boolean,
): string | number | boolean {
  if (typeof value !== 'string' || !value.includes('?')) {
    return value;
  }
  try {
    const parsed = new URL(value);
    for (const name of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(name, '[REDACTED]');
    }
    return parsed.toString();
  } catch {
    return value;
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