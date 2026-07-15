import { DatabaseSync } from 'node:sqlite';

import { applyMigrations, type MigrationResult } from '../../migration-runner';
import { CAPTURE_MIGRATIONS } from './worker-schema';

/**
 * 内存数据库位置常量；单元测试与 fixture 使用它避免触碰磁盘。
 */
export const IN_MEMORY_LOCATION = ':memory:';

const BUSY_TIMEOUT_MS = 5_000;

export interface OpenCaptureDatabaseResult {
  readonly db: DatabaseSync;
  readonly migration: MigrationResult;
}

/**
 * 打开 Capture 数据库连接，启用 WAL、外键、忙等超时，并执行只向前迁移。
 *
 * 该函数只做连接与结构准备，不持有写入策略；串行写入与查询由 Storage Worker
 * 独占这一连接完成，Core 网络事件循环不直接触碰 SQLite。
 * 调用方：Storage Worker 启动时对 `capture.sqlite`，以及单元测试对内存库。
 */
export function openCaptureDatabase(
  location: string,
): OpenCaptureDatabaseResult {
  const db = new DatabaseSync(location);
  try {
    configurePragmas(db);
    const migration = applyMigrations(db, CAPTURE_MIGRATIONS);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * 设置 Capture 库运行期 pragma：WAL 提升 crash-safety，外键保证引用完整性。
 * 调用方：openCaptureDatabase 在迁移前。
 */
function configurePragmas(db: DatabaseSync): void {
  // 内存库无法进入 WAL（返回 memory），文件库进入 WAL 以支持 crash-safe 恢复。
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
}
