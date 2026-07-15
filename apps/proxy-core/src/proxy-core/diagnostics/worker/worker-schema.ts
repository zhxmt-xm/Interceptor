import type { Migration } from '../../migration-runner';

/**
 * 诊断日志库当前 schema 版本；与 Capture schema、Command 协议版本相互独立。
 */
export const DIAGNOSTICS_SCHEMA_VERSION = 1;

/**
 * `diagnostics.sqlite` 只向前迁移集，对应产品设计第十二章 12.5。
 *
 * 单表 log_record 保存脱敏后的结构化日志，并为 timestamp / trace / request /
 * command / level / outcome / duration 建索引；diagnostics_meta 记录聚合丢弃计数。
 * 该库与 Capture 库使用独立 Writer，日志写入失败不得回滚或阻塞捕获数据。
 */
export const DIAGNOSTICS_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    label: 'diagnostics-log',
    statements: [
      `CREATE TABLE log_record (
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
      )`,
      `CREATE TABLE diagnostics_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      )`,
      "INSERT INTO diagnostics_meta (key, value) VALUES ('dropped_count', 0)",
      'CREATE INDEX idx_log_ts ON log_record(ts_ms)',
      'CREATE INDEX idx_log_trace ON log_record(trace_id)',
      'CREATE INDEX idx_log_request ON log_record(request_id)',
      'CREATE INDEX idx_log_command ON log_record(command)',
      'CREATE INDEX idx_log_level ON log_record(level)',
      'CREATE INDEX idx_log_outcome ON log_record(outcome)',
      'CREATE INDEX idx_log_duration ON log_record(duration_ms)',
    ],
  },
];
