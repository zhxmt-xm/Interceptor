import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

const { locations } = vi.hoisted(() => ({
  locations: {
    capture: '',
    rules: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  get captureDatabasePath() {
    return locations.capture;
  },
  get rulesDatabasePath() {
    return locations.rules;
  },
}));

import { RuleRevisionConflictError } from '../storage-rule-revision-conflict-error';
import { RuleStore } from '../storage-rule-store';

/** RuleStore 的临时数据库夹具。 */
class RuleStoreFixture {
  /** 当前测试目录。 */
  directory = '';

  /** 建立 rules 与 legacy capture 路径。 */
  async initialize(): Promise<void> {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-rule-'));
    locations.capture = path.join(this.directory, 'capture.sqlite');
    locations.rules = path.join(this.directory, 'rules.sqlite');
  }

  /** 删除当前测试目录。 */
  async cleanup(): Promise<void> {
    if (this.directory) {
      await fs.rm(this.directory, { recursive: true, force: true });
    }
  }

  /** 创建旧 capture.sqlite 中的 rule_set 兼容表和数据。 */
  createLegacyRuleSet(revision: number, rules: readonly RuleDefinition[]): void {
    const database = new DatabaseSync(locations.capture);
    database.exec(
      `CREATE TABLE rule_set (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        rules_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );
    database
      .prepare(
        'INSERT INTO rule_set (id, revision, rules_json, updated_at) VALUES (1, ?, ?, ?)',
      )
      .run(revision, JSON.stringify(rules), 123);
    database.close();
  }

  /** 创建一条完整规则。 */
  rule(id = 'rule-1'): RuleDefinition {
    return {
      id,
      name: 'Persistent rule',
      enabled: true,
      priority: 1,
      matchers: [{ type: 'host', value: 'api.test', mode: 'exact' }],
      actions: [
        {
          type: 'header',
          phase: 'request',
          op: 'set',
          name: 'x-rule',
          value: 'active',
        },
      ],
    };
  }
}

describe('RuleStore', () => {
  let fixture: RuleStoreFixture;

  beforeEach(async () => {
    fixture = new RuleStoreFixture();
    await fixture.initialize();
  });

  afterEach(async () => fixture.cleanup());

  it('persists revisions across direct Core store reopen', () => {
    const first = new RuleStore();
    first.initialize();
    expect(first.loadRuleSet()).toEqual({ revision: 0, rules: [] });
    expect(first.saveRuleSet(0, [fixture.rule()])).toMatchObject({ revision: 1 });
    expect(() => first.saveRuleSet(0, [])).toThrow(RuleRevisionConflictError);
    first.dispose();

    const reopened = new RuleStore();
    reopened.initialize();
    expect(reopened.loadRuleSet()).toEqual({
      revision: 1,
      rules: [fixture.rule()],
    });
    reopened.dispose();
  });

  it('migrates the legacy rule_set once and removes persistent capture files', () => {
    fixture.createLegacyRuleSet(7, [fixture.rule('legacy')]);
    const store = new RuleStore();
    store.initialize();

    expect(store.loadRuleSet()).toEqual({
      revision: 7,
      rules: [fixture.rule('legacy')],
    });
    expect(existsSync(locations.capture)).toBe(false);
    expect(existsSync(`${locations.capture}-wal`)).toBe(false);
    expect(existsSync(`${locations.capture}-shm`)).toBe(false);
    store.dispose();
  });

  it('keeps existing rules.sqlite authoritative while deleting old capture history', () => {
    const authoritative = new RuleStore();
    authoritative.initialize();
    authoritative.saveRuleSet(0, [fixture.rule('current')]);
    authoritative.dispose();
    fixture.createLegacyRuleSet(99, [fixture.rule('legacy')]);

    const reopened = new RuleStore();
    reopened.initialize();
    expect(reopened.loadRuleSet()).toEqual({
      revision: 1,
      rules: [fixture.rule('current')],
    });
    expect(existsSync(locations.capture)).toBe(false);
    reopened.dispose();
  });
});
