import { existsSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { RuleDefinition, RuleSet } from '@interceptor/core-protocol';

import { captureDatabasePath, rulesDatabasePath } from '../constants';
import { applyMigrations } from '../migration-runner';
import { RuleRevisionConflictError } from './storage-rule-revision-conflict-error';
import { RULE_MIGRATIONS } from './storage-rule-schema';

/** Core 直接拥有的低频持久 RuleSet Store；不使用常驻 Worker。 */
export class RuleStore {
  /** rules.sqlite 同步连接；只在 initialize 后存在。 */
  private database: DatabaseSync | null = null;

  /** 打开并迁移 rules.sqlite，再消费旧 capture.sqlite 中的 RuleSet。 */
  initialize(): void {
    if (this.database) {
      return;
    }
    const database = new DatabaseSync(rulesDatabasePath);
    try {
      database.exec('PRAGMA journal_mode = WAL');
      database.exec('PRAGMA foreign_keys = ON');
      database.exec('PRAGMA synchronous = NORMAL');
      applyMigrations(database, RULE_MIGRATIONS);
      this.database = database;
      this.migrateLegacyCapture();
    } catch (error) {
      database.close();
      this.database = null;
      throw error;
    }
  }

  /** 读取规则集；尚未保存时返回 revision 0 空集。 */
  loadRuleSet(): RuleSet {
    const row = this.readRow();
    if (!row) {
      return { revision: 0, rules: [] };
    }
    return {
      revision: row.revision,
      rules: JSON.parse(row.rulesJson) as RuleDefinition[],
    };
  }

  /** 以乐观 revision 原子替换完整规则集。 */
  saveRuleSet(
    expectedRevision: number,
    rules: readonly RuleDefinition[],
  ): RuleSet {
    return this.inTransaction(() => {
      const currentRevision = this.readRow()?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new RuleRevisionConflictError(expectedRevision, currentRevision);
      }
      const nextRevision = currentRevision + 1;
      this.writeRow(nextRevision, JSON.stringify(rules), Date.now());
      return { revision: nextRevision, rules: [...rules] };
    });
  }

  /** 关闭 rules.sqlite；RuleSet 已持久化，不随 Capture 清理。 */
  dispose(): void {
    this.database?.close();
    this.database = null;
  }

  /** 新规则库为空时迁移旧 rule_set，随后物理删除旧 Capture DB/WAL/SHM。 */
  private migrateLegacyCapture(): void {
    if (!captureDatabasePath || !existsSync(captureDatabasePath)) {
      return;
    }
    if (this.readRow()) {
      this.removeLegacyCaptureFiles();
      return;
    }
    const legacy = new DatabaseSync(captureDatabasePath, { readOnly: true });
    try {
      const table = legacy
        .prepare(
          "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'rule_set'",
        )
        .get() as { found: number } | undefined;
      if (table) {
        const row = legacy
          .prepare(
            'SELECT revision AS revision, rules_json AS rulesJson, updated_at AS updatedAt FROM rule_set WHERE id = 1',
          )
          .get() as
          | { revision: number; rulesJson: string; updatedAt: number }
          | undefined;
        if (row) {
          const parsed = JSON.parse(row.rulesJson);
          if (!Array.isArray(parsed)) {
            throw new Error('Legacy rule_set rules_json must contain an array.');
          }
          this.inTransaction(() => {
            this.writeRow(row.revision, row.rulesJson, row.updatedAt);
          });
        }
      }
    } finally {
      legacy.close();
    }
    this.removeLegacyCaptureFiles();
  }

  /** 删除旧 Capture SQLite 主文件及 sidecar。 */
  private removeLegacyCaptureFiles(): void {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${captureDatabasePath}${suffix}`, { force: true });
    }
  }

  /** 读取持久规则单行。 */
  private readRow():
    | { revision: number; rulesJson: string; updatedAt: number }
    | undefined {
    return this.requireDatabase()
      .prepare(
        'SELECT revision AS revision, rules_json AS rulesJson, updated_at AS updatedAt FROM rule_set WHERE id = 1',
      )
      .get() as
      | { revision: number; rulesJson: string; updatedAt: number }
      | undefined;
  }

  /** 写入或替换规则单行，保留调用方提供的 revision。 */
  private writeRow(revision: number, rulesJson: string, updatedAt: number): void {
    this.requireDatabase()
      .prepare(
        `INSERT INTO rule_set (id, revision, rules_json, updated_at)
         VALUES (1, :revision, :rulesJson, :updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           revision = :revision, rules_json = :rulesJson, updated_at = :updatedAt`,
      )
      .run({ revision, rulesJson, updatedAt });
  }

  /** 在立即事务中执行低频规则写入并保证失败回滚。 */
  private inTransaction<T>(operation: () => T): T {
    const database = this.requireDatabase();
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // 保留原始规则写入错误。
      }
      throw error;
    }
  }

  /** 返回已初始化连接。 */
  private requireDatabase(): DatabaseSync {
    if (!this.database) {
      throw new Error('RuleStore.initialize() must be called before use.');
    }
    return this.database;
  }
}
