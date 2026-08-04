import { DatabaseSync } from 'node:sqlite';

import type {
  Collection,
  CollectionNode,
  RuleDefinition,
  RuleSet,
} from '@interceptor/core-protocol';

import { workspaceDatabasePath } from '../constants';
import type { WorkspaceDocument, WorkspaceDocumentRow } from './interfaces';
import { createDocumentTable, selectDocument, upsertDocument } from './utils';
import { WORKSPACE_DOCUMENTS } from './internal/constants';
import { RevisionConflictError } from './internal/errors';

/**
 * App 全局公用 Store，由 CoreApplication 独占拥有并注入需要的 handler。
 *
 * 装低频读写的全局配置与模块级配置——Settings、Composer 集合，以及将来任何跟着用户走、
 * 不随录制丢弃的配置。它们都是启动读一次、编辑时偶发写，所以共用一个同步连接即可；高频的
 * diagnostics 有独立 Worker 与独立数据库，不并入这里，避免日志写入与配置写入争锁、
 * 也避免日志故障波及配置。
 *
 * 每种配置对外只有一对 load/save 薄方法（选表名 + JSON 转换 + 空默认值），全部 SQL 集中
 * 在 `read`/`write` 与 `utils/index.ts`，因此新增一种配置不需要碰骨架。
 */
export class WorkspaceService {
  /** workspace.sqlite 同步连接；只在 initialize 后存在。 */
  private databaseSync: DatabaseSync | null = null;

  /** 打开 workspace.sqlite 并确保全部文档表存在；重复调用直接返回。 */
  initialize(): void {
    if (this.databaseSync) {
      return;
    }
    const databaseSync = new DatabaseSync(workspaceDatabasePath);
    try {
      databaseSync.exec('PRAGMA journal_mode = WAL');
      databaseSync.exec('PRAGMA foreign_keys = ON');
      databaseSync.exec('PRAGMA synchronous = NORMAL');
      for (const document of WORKSPACE_DOCUMENTS) {
        databaseSync.exec(createDocumentTable(document));
      }
      this.databaseSync = databaseSync;
    } catch (error) {
      databaseSync.close();
      this.databaseSync = null;
      throw error;
    }
  }

  /** 读取规则集；尚未保存时返回 revision 0 空集。 */
  loadRuleSet(): RuleSet {
    const row = this.read('rule_set');
    return row
      ? { revision: row.revision, rules: JSON.parse(row.json) as RuleDefinition[] }
      : { revision: 0, rules: [] };
  }

  /** 以乐观 revision 原子替换完整规则集。 */
  saveRuleSet(
    expectedRevision: number,
    rules: readonly RuleDefinition[],
  ): RuleSet {
    const revision = this.write('rule_set', expectedRevision, JSON.stringify(rules));
    return { revision, rules: [...rules] };
  }

  /** 读取 Composer 集合树；尚未保存时返回 revision 0 空树。 */
  loadCollection(): Collection {
    const row = this.read('collection_tree');
    return row
      ? { revision: row.revision, nodes: JSON.parse(row.json) as CollectionNode[] }
      : { revision: 0, nodes: [] };
  }

  /** 以乐观 revision 原子替换整棵集合树。 */
  saveCollection(
    expectedRevision: number,
    nodes: readonly CollectionNode[],
  ): Collection {
    const revision = this.write(
      'collection_tree',
      expectedRevision,
      JSON.stringify(nodes),
    );
    return { revision, nodes: [...nodes] };
  }

  /** 关闭 workspace.sqlite；配置已持久化，不随 Capture 清理。 */
  dispose(): void {
    this.databaseSync?.close();
    this.databaseSync = null;
  }

  /** 读取一份文档的当前 revision 与 JSON 载荷。 */
  private read(document: WorkspaceDocument): WorkspaceDocumentRow | undefined {
    return this.requireDatabase().prepare(selectDocument(document)).get() as
      | WorkspaceDocumentRow
      | undefined;
  }

  /** 校验 revision 后原子写入一份文档，返回新 revision。 */
  private write(
    document: WorkspaceDocument,
    expectedRevision: number,
    json: string,
  ): number {
    return this.inTransaction(() => {
      const currentRevision = this.read(document)?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new RevisionConflictError(document, expectedRevision, currentRevision);
      }
      const nextRevision = currentRevision + 1;
      this.requireDatabase()
        .prepare(upsertDocument(document))
        .run({ revision: nextRevision, json, updatedAt: Date.now() });
      return nextRevision;
    });
  }

  /** 在立即事务中执行低频配置写入并保证失败回滚。 */
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
        // 保留原始配置写入错误。
      }
      throw error;
    }
  }

  /** 返回已初始化连接。 */
  private requireDatabase(): DatabaseSync {
    if (!this.databaseSync) {
      throw new Error('WorkspaceService.initialize() must be called before use.');
    }
    return this.databaseSync;
  }
}
