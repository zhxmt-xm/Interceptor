import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

const { locations } = vi.hoisted(() => ({
  locations: {
    rules: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
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

  /** 建立 rules.sqlite 路径。 */
  async initialize(): Promise<void> {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-rule-'));
    locations.rules = path.join(this.directory, 'rules.sqlite');
  }

  /** 删除当前测试目录。 */
  async cleanup(): Promise<void> {
    if (this.directory) {
      await fs.rm(this.directory, { recursive: true, force: true });
    }
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
});
