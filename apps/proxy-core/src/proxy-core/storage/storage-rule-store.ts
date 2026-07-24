import { DatabaseSync } from 'node:sqlite';

import type { RuleDefinition, RuleSet } from '@interceptor/core-protocol';

import { rulesDatabasePath } from '../constants';
import { RuleRevisionConflictError } from './storage-rule-revision-conflict-error';

/** Core 直接拥有的低频持久 RuleSet Store；不使用常驻 Worker。 */
export class RuleStore {
  /** rules.sqlite 直接创建的完整当前 schema。 */
  private static readonly SCHEMA = `
    CREATE TABLE IF NOT EXISTS rule_set (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      rules_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `;
  /** rules.sqlite 同步连接；只在 initialize 后存在。 */
  private database: DatabaseSync | null = null;

  /** 打开 rules.sqlite 并确保当前表存在。 */
  initialize(): void {
    if (this.database) {
      return;
    }
    const database = new DatabaseSync(rulesDatabasePath);
    try {
      database.exec('PRAGMA journal_mode = WAL');
      database.exec('PRAGMA foreign_keys = ON');
      database.exec('PRAGMA synchronous = NORMAL');
      database.exec(RuleStore.SCHEMA);
      this.database = database;
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
