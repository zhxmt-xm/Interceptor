import { DatabaseSync } from 'node:sqlite';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

import type {
  Collection,
  CollectionNode,
  RuleNode,
  RuleSet,
  TlsPassthroughSettings,
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
  /** No host bypasses HTTPS interception until the user explicitly adds it. */
  private static readonly DEFAULT_TLS_PASSTHROUGH_HOSTS: readonly string[] = [];
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

  /** 读取规则树；尚未保存时返回 revision 0 空树。 */
  loadRuleSet(): RuleSet {
    const row = this.read('rule_set');
    return row
      ? { revision: row.revision, nodes: JSON.parse(row.json) as RuleNode[] }
      : { revision: 0, nodes: [] };
  }

  /** 以乐观 revision 原子替换整棵规则树。 */
  saveRuleSet(
    expectedRevision: number,
    nodes: readonly RuleNode[],
  ): RuleSet {
    const revision = this.write('rule_set', expectedRevision, JSON.stringify(nodes));
    return { revision, nodes: [...nodes] };
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

  /** Read persistent TLS passthrough patterns or an empty default. */
  loadTlsPassthroughSettings(): TlsPassthroughSettings {
    const row = this.read('tls_passthrough_hosts');
    return row
      ? {
          revision: row.revision,
          hosts: WorkspaceService.normalizeTlsPassthroughHosts(
            JSON.parse(row.json) as unknown,
          ),
        }
      : {
          revision: 0,
          hosts: [...WorkspaceService.DEFAULT_TLS_PASSTHROUGH_HOSTS],
        };
  }

  /** Atomically replace and normalize persistent TLS passthrough patterns. */
  saveTlsPassthroughSettings(
    expectedRevision: number,
    hosts: readonly string[],
  ): TlsPassthroughSettings {
    const normalizedHosts = WorkspaceService.normalizeTlsPassthroughHosts(hosts);
    const revision = this.write(
      'tls_passthrough_hosts',
      expectedRevision,
      JSON.stringify(normalizedHosts),
    );
    return { revision, hosts: normalizedHosts };
  }

  /** Read persistent per-host origin certificate exceptions or an empty default. */
  loadInsecureHosts(): string[] {
    const row = this.read('tls_insecure_hosts');
    return row ? (JSON.parse(row.json) as string[]) : [];
  }

  /** Replace the persistent per-host origin certificate exceptions. */
  saveInsecureHosts(hosts: readonly string[]): string[] {
    const normalizedHosts = [...new Set(
      hosts.map((host) => host.trim().toLowerCase()).filter((host) => host.length > 0),
    )];
    this.overwrite('tls_insecure_hosts', JSON.stringify(normalizedHosts));
    return normalizedHosts;
  }

  /**
   * Read whether the user last left HTTPS decryption on; a fresh profile starts off.
   * 只是用户意图；是否真的解密还取决于 CA 是否已被系统信任。
   */
  loadDecryptionPreference(): boolean {
    const row = this.read('tls_decryption_preference');
    return row ? (JSON.parse(row.json) as { enabled: boolean }).enabled : false;
  }

  /** 记住用户打开了 HTTPS 解密。 */
  enableDecryptionPreference(): void {
    this.overwrite('tls_decryption_preference', JSON.stringify({ enabled: true }));
  }

  /** 记住用户关闭了 HTTPS 解密。 */
  disableDecryptionPreference(): void {
    this.overwrite('tls_decryption_preference', JSON.stringify({ enabled: false }));
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

  /**
   * 覆盖写一份文档，不做 revision 比对。
   * 用于只有一个编辑入口的 Settings 开关和名单：最后一次保存即最终值，冲突重试没有意义。
   */
  private overwrite(document: WorkspaceDocument, json: string): void {
    this.inTransaction(() => {
      const nextRevision = (this.read(document)?.revision ?? 0) + 1;
      this.requireDatabase()
        .prepare(upsertDocument(document))
        .run({ revision: nextRevision, json, updatedAt: Date.now() });
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

  /** Validate host-only patterns and canonicalize DNS names to lowercase ASCII. */
  private static normalizeTlsPassthroughHosts(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((host) => typeof host !== 'string')) {
      throw new Error('TLS passthrough hosts must be a string array.');
    }
    const hosts = value as string[];
    const normalizedHosts: string[] = [];
    const seenHosts = new Set<string>();
    for (const host of hosts) {
      const trimmedHost = host.trim().toLowerCase();
      const wildcard = trimmedHost.startsWith('*.');
      const hostname = wildcard ? trimmedHost.slice(2) : trimmedHost;
      let normalizedHostname: string;
      if (!wildcard && isIP(hostname) !== 0) {
        normalizedHostname = hostname;
      } else {
        normalizedHostname = domainToASCII(hostname);
        if (
          normalizedHostname.length === 0 ||
          normalizedHostname.length > 253 ||
          normalizedHostname.split('.').some((label) =>
            label.length === 0 ||
            label.length > 63 ||
            !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
        ) {
          throw new Error(`Invalid TLS passthrough host pattern: ${host}`);
        }
      }
      const normalizedHost = wildcard
        ? `*.${normalizedHostname}`
        : normalizedHostname;
      if (!seenHosts.has(normalizedHost)) {
        seenHosts.add(normalizedHost);
        normalizedHosts.push(normalizedHost);
      }
    }
    return normalizedHosts;
  }
}
