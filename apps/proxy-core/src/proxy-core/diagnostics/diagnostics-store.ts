import type { DatabaseSync, StatementSync } from 'node:sqlite';

import type {
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
} from '@interceptor/core-protocol';

export interface DiagnosticsQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly level?: DiagnosticLevel;
  readonly traceId?: string;
}

export interface DiagnosticsPage {
  readonly records: DiagnosticLogRecord[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly droppedCount: number;
}

export interface DiagnosticsStoreOptions {
  /** 最多保留的日志条数；超过后按插入顺序淘汰最旧记录。 */
  readonly maxRecords?: number;
  /** 最长保留时长（毫秒）；早于该时长的记录在写入时清理。 */
  readonly maxAgeMs?: number;
}

interface LogRow {
  id: number;
  ts_ms: number;
  timestamp: string;
  sequence: number;
  level: string;
  process: string;
  trace_id: string | null;
  request_id: string | null;
  command: string | null;
  phase: string;
  action: string | null;
  duration_ms: number | null;
  outcome: string | null;
  error_code: string | null;
  attributes: string | null;
}

const DEFAULT_MAX_RECORDS = 50_000;
const DROPPED_KEY = 'dropped_count';

/**
 * `diagnostics.sqlite` 的同步访问层，运行在 Diagnostics Worker 线程内。
 *
 * 批量事务写入脱敏日志，按条数/时长保留策略淘汰旧记录，并提供按 id keyset 的分页
 * 查询与聚合丢弃计数。与 Capture 库彻底隔离，写入失败只影响诊断自身，绝不阻塞捕获。
 */
export class DiagnosticsStore {
  private readonly insertStmt: StatementSync;
  private readonly maxRecords: number;
  private readonly maxAgeMs: number | null;

  constructor(
    private readonly db: DatabaseSync,
    options: DiagnosticsStoreOptions = {},
  ) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.maxAgeMs = options.maxAgeMs ?? null;
    this.insertStmt = db.prepare(
      `INSERT INTO log_record
        (ts_ms, timestamp, sequence, level, process, trace_id, request_id,
         command, phase, action, duration_ms, outcome, error_code, attributes)
       VALUES
        (:tsMs, :timestamp, :sequence, :level, :process, :traceId, :requestId,
         :command, :phase, :action, :durationMs, :outcome, :errorCode, :attributes)`,
    );
  }

  /**
   * 在单事务内批量持久化日志记录，随后执行条数与时长保留策略。
   * 调用方：Diagnostics Worker 处理 write 批次。空批次直接返回。
   */
  insertBatch(records: readonly DiagnosticLogRecord[]): void {
    if (records.length === 0) {
      return;
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const record of records) {
        this.insertStmt.run({
          tsMs: toEpochMs(record.timestamp),
          timestamp: record.timestamp,
          sequence: record.sequence,
          level: record.level,
          process: record.process,
          traceId: record.traceId ?? null,
          requestId: record.requestId ?? null,
          command: record.command ?? null,
          phase: record.phase,
          action: record.action ?? null,
          durationMs: record.durationMs ?? null,
          outcome: record.outcome ?? null,
          errorCode: record.errorCode ?? null,
          attributes: record.attributes
            ? JSON.stringify(record.attributes)
            : null,
        });
      }
      this.enforceRetention();
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // 事务可能已自动回滚。
      }
      throw error;
    }
  }

  /**
   * 按 level/traceId 过滤，以 id 递减 keyset 分页查询已持久化的诊断记录。
   * 调用方：Diagnostics Worker 处理 query 请求，最终映射为 diagnostics.page 结果。
   */
  query(query: DiagnosticsQuery): DiagnosticsPage {
    const conditions: string[] = [];
    const params: Record<string, string | number> = { limit: query.limit + 1 };

    if (query.level) {
      conditions.push('level = :level');
      params.level = query.level;
    }
    if (query.traceId) {
      conditions.push('trace_id = :traceId');
      params.traceId = query.traceId;
    }
    const cursorId = decodeCursor(query.cursor);
    if (cursorId !== null) {
      conditions.push('id < :cursorId');
      params.cursorId = cursorId;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM log_record ${where} ORDER BY id DESC LIMIT :limit`,
      )
      .all(params) as unknown as (LogRow & { id: number })[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastId = page.at(-1)?.id;

    return {
      records: page.map(toLogRecord),
      nextCursor: hasMore && lastId !== undefined ? String(lastId) : undefined,
      hasMore,
      droppedCount: this.droppedCount(),
    };
  }

  /**
   * 累加聚合丢弃计数；调用方：Worker 在批次持久化失败或采样丢弃时。
   */
  incrementDropped(count: number): void {
    if (count <= 0) {
      return;
    }
    this.db
      .prepare(
        'UPDATE diagnostics_meta SET value = value + :count WHERE key = :key',
      )
      .run({ count, key: DROPPED_KEY });
  }

  /** 返回累计丢弃计数。调用方：query 汇总和测试。 */
  droppedCount(): number {
    const row = this.db
      .prepare('SELECT value FROM diagnostics_meta WHERE key = :key')
      .get({ key: DROPPED_KEY }) as { value: number } | undefined;
    return row?.value ?? 0;
  }

  /** 当前持久化的日志条数。调用方：保留策略测试。 */
  count(): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS value FROM log_record').get() as {
        value: number;
      }
    ).value;
  }

  /** 关闭底层数据库连接。调用方：Diagnostics Worker 优雅退出。 */
  close(): void {
    this.db.close();
  }

  private enforceRetention(): void {
    this.db
      .prepare(
        `DELETE FROM log_record
         WHERE id <= (SELECT MAX(id) FROM log_record) - :maxRecords`,
      )
      .run({ maxRecords: this.maxRecords });
    if (this.maxAgeMs !== null) {
      this.db
        .prepare('DELETE FROM log_record WHERE ts_ms < :cutoff')
        .run({ cutoff: Date.now() - this.maxAgeMs });
    }
  }
}

function toLogRecord(row: LogRow): DiagnosticLogRecord {
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

function parseAttributes(
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

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function decodeCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) {
    return null;
  }
  const value = Number(cursor);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
