import { DatabaseSync } from 'node:sqlite';

import { applyMigrations, type MigrationResult } from '../../migration-runner';
import { DIAGNOSTICS_MIGRATIONS } from './worker-schema';

const BUSY_TIMEOUT_MS = 5_000;

export interface OpenDiagnosticsDatabaseResult {
  readonly db: DatabaseSync;
  readonly migration: MigrationResult;
}

/**
 * 打开独立的 `diagnostics.sqlite` 连接，启用 WAL 并执行只向前迁移。
 *
 * 该连接由 Diagnostics Worker 独占，与 Capture 库完全隔离；诊断写入失败绝不能
 * 影响或回滚捕获数据。调用方：Diagnostics Worker 启动；单元测试对内存库。
 */
export function openDiagnosticsDatabase(
  location: string,
): OpenDiagnosticsDatabaseResult {
  const db = new DatabaseSync(location);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    const migration = applyMigrations(db, DIAGNOSTICS_MIGRATIONS);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
