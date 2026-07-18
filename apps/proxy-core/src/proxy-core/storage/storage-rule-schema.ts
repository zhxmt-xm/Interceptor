import type { Migration } from '../migration-runner';

/** 持久 Rule Store 当前 schema 版本。 */
export const RULE_SCHEMA_VERSION = 1;

/** 独立 rules.sqlite 的只向前迁移集。 */
export const RULE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    label: 'persistent-rule-set',
    statements: [
      `CREATE TABLE rule_set (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        rules_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
];
