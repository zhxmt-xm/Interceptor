import type { DatabaseSync } from 'node:sqlite';

/**
 * 一次只向前的数据库迁移步骤。
 *
 * `version` 从 1 开始严格递增且连续；`statements` 是该版本要执行的 DDL/DML。
 * 迁移一旦发布就不可修改，只能在末尾追加新版本，保证任何旧库都能线性升级。
 */
export interface Migration {
  readonly version: number;
  readonly label: string;
  readonly statements: readonly string[];
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
}

/**
 * 迁移执行失败时抛出的错误，携带失败的目标版本，便于诊断日志定位。
 */
export class MigrationError extends Error {
  constructor(
    readonly version: number,
    override readonly cause: unknown,
  ) {
    super(
      `Failed to apply migration v${version}: ${describeError(cause)}`,
    );
    this.name = 'MigrationError';
  }
}

/**
 * 按 `PRAGMA user_version` 记录的当前版本，只向前执行尚未应用的迁移。
 *
 * 每个迁移在独立 `BEGIN IMMEDIATE` 事务内运行并在成功后写入 `user_version`；
 * 任一语句失败立即 ROLLBACK 并抛出 MigrationError，使数据库停留在上一致状态。
 * 调用方：openCaptureDatabase / openDiagnosticsDatabase 在打开连接后执行一次。
 */
export function applyMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[],
): MigrationResult {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  assertForwardOnly(ordered);

  const fromVersion = readUserVersion(db);
  const applied: number[] = [];

  for (const migration of ordered) {
    if (migration.version <= fromVersion) {
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      // user_version 是整数常量且由代码控制，可安全内插；PRAGMA 不支持绑定参数。
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      safeRollback(db);
      throw new MigrationError(migration.version, error);
    }
    applied.push(migration.version);
  }

  return { fromVersion, toVersion: readUserVersion(db), applied };
}

/**
 * 读取数据库当前 schema 版本；空库返回 0。
 * 调用方：applyMigrations 起止和单元测试断言。
 */
export function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as
    | { user_version?: number }
    | undefined;
  return typeof row?.user_version === 'number' ? row.user_version : 0;
}

/**
 * 校验迁移集从 1 开始、严格递增且连续，尽早暴露版本编号错误。
 * 调用方：applyMigrations 在执行前。
 */
function assertForwardOnly(ordered: readonly Migration[]): void {
  ordered.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new MigrationError(
        migration.version,
        `expected contiguous version ${expected}, received ${migration.version}`,
      );
    }
  });
}

/**
 * 尽力回滚当前事务并吞掉回滚自身的异常，避免掩盖原始迁移错误。
 * 调用方：applyMigrations 的失败路径。
 */
function safeRollback(db: DatabaseSync): void {
  try {
    db.exec('ROLLBACK');
  } catch {
    // 事务可能已因错误自动回滚；此处不得覆盖原始 MigrationError。
  }
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return typeof cause === 'string' ? cause : 'unknown error';
}
