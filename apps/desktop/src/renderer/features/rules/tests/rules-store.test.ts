import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectLeaves } from '@interceptor/core-protocol';

import type {
  RuleDefinition,
  RuleFolder,
  RuleNode,
} from '../../../../shared/desktop-api';
import { useRulesStore } from '../data/rulesStore';
import { addRequestRuleDraft, applyRules, loadRules, selectRuleDraft } from '../data/useRulesData';
import { createRuleFromRequest, isRulesDirty } from '../utils';

function rule(id: string, priority: number): RuleDefinition {
  return {
    kind: 'rule',
    id,
    name: id,
    enabled: true,
    priority,
    matchers: [{ type: 'method', value: 'GET' }],
    actions: [{ type: 'status', statusCode: 200 }],
  };
}

function folder(id: string, children: RuleNode[] = []): RuleFolder {
  return { kind: 'folder', id, name: id, children };
}

/** 树里全部规则的深度优先顺序与它们的 priority。 */
function order(): Array<{ id: string; priority: number }> {
  return collectLeaves(useRulesStore.getState().nodes).map(({ id, priority }) => ({
    id,
    priority,
  }));
}

/** 一份干净的初始状态，只换掉树。 */
function seed(nodes: RuleNode[], selectedId: string | null = null): void {
  useRulesStore.setState({
    revision: 1,
    initialized: true,
    nodes,
    applied: structuredClone(nodes),
    selectedId,
    expandedFolders: [],
    renamingNodeId: null,
    folderMenu: null,
    hits: {},
    loading: false,
    saving: false,
    error: null,
    conflict: false,
  });
}

describe('rulesStore ordering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    seed([rule('first', 100), rule('second', 200), rule('third', 300)], 'second');
  });

  it('renumbers priorities after a move so Core execution follows the tree order', () => {
    useRulesStore.getState().moveNode('second', { parentId: null, beforeId: 'first' });

    expect(order()).toEqual([
      { id: 'second', priority: 10 },
      { id: 'first', priority: 20 },
      { id: 'third', priority: 30 },
    ]);
    const moved = useRulesStore.getState();
    expect(isRulesDirty(moved.nodes, moved.applied)).toBe(true);
  });

  it('appends to the root when the drop lands past the last row', () => {
    useRulesStore.getState().moveNode('first', { parentId: null, beforeId: null });

    expect(order().map(({ id }) => id)).toEqual(['second', 'third', 'first']);
  });

  it('moves a rule into a folder and keeps the execution order depth-first', () => {
    seed([folder('group', [rule('inside', 100)]), rule('outside', 200)], 'outside');

    useRulesStore.getState().moveNode('outside', { parentId: 'group', beforeId: null });

    expect(order()).toEqual([
      { id: 'inside', priority: 10 },
      { id: 'outside', priority: 20 },
    ]);
  });

  it('refuses a move that would nest folders more than three deep', () => {
    seed([
      folder('level1', [folder('level2', [folder('level3', [rule('deep', 100)])])]),
      folder('spare', [folder('spare-child')]),
    ]);

    useRulesStore.getState().moveNode('spare', { parentId: 'level3', beforeId: null });

    // spare 自带一层子目录，落进第三级会变成第五级，因此整个移动被拒绝。
    expect(useRulesStore.getState().nodes.map((node) => node.id)).toEqual([
      'level1',
      'spare',
    ]);
  });

  it('auto-expands a folder without collapsing one that is already open', () => {
    seed([folder('group', [rule('inside', 100)])]);

    useRulesStore.getState().expandFolder('group');
    useRulesStore.getState().expandFolder('group');

    expect(useRulesStore.getState().expandedFolders).toEqual(['group']);
  });

  it('preserves the persisted tree order while loading editable drafts', () => {
    useRulesStore.getState().loadRuleSet({
      revision: 2,
      nodes: [rule('z-rule', 200), folder('group', [rule('b-rule', 100)]), rule('a-rule', 100)],
    });

    expect(useRulesStore.getState().nodes.map((item) => item.id))
      .toEqual(['z-rule', 'group', 'a-rule']);
    expect(order().map(({ id }) => id)).toEqual(['z-rule', 'b-rule', 'a-rule']);
  });

  it('adds an exact-URL request rule as an unsaved selected draft', () => {
    const draft = createRuleFromRequest(
      'Block api.test/items',
      'https://api.test/items?active=true',
      'block',
    );
    useRulesStore.getState().addRuleDraft(draft);

    const state = useRulesStore.getState();
    expect(state.selectedId).toBe(draft.id);
    expect(collectLeaves(state.nodes).at(-1)).toMatchObject({
      name: 'Block api.test/items',
      matchers: [{
        type: 'url',
        value: 'https://api.test/items',
        mode: 'exact',
      }],
      actions: [{ type: 'block', mode: 'reset' }],
    });
    expect(isRulesDirty(state.nodes, state.applied)).toBe(true);
  });

  it('loads Core rules before adding a Capture draft and resolves marker targets', async () => {
    const persisted = rule('persisted', 100);
    useRulesStore.setState({ initialized: false });
    seed([]);
    useRulesStore.setState({ revision: 0, initialized: false });
    const getRules = vi.fn(async () => ({ revision: 7, nodes: [persisted] }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    const draftId = await addRequestRuleDraft(
      'Delay api.test/items',
      'https://api.test/items',
      'delay',
    );

    expect(getRules).toHaveBeenCalledTimes(1);
    expect(draftId).toBeTruthy();
    expect(useRulesStore.getState()).toMatchObject({
      revision: 7,
      initialized: true,
      selectedId: draftId,
    });
    expect(collectLeaves(useRulesStore.getState().nodes)).toHaveLength(2);

    expect(await selectRuleDraft('persisted')).toBe(true);
    expect(useRulesStore.getState().selectedId).toBe('persisted');
    expect(await selectRuleDraft('deleted-rule')).toBe(false);
    expect(useRulesStore.getState().selectedId).toBe('persisted');
  });

  it('never persists query secrets from the captured URL into the rule', async () => {
    seed([]);

    await addRequestRuleDraft(
      'Delay api.test/items',
      'https://api.test/items?access_token=super-secret&sig=abcdef&page=2',
      'delay',
    );

    const [draft] = collectLeaves(useRulesStore.getState().nodes);
    // 右键建规则的意图是“针对这个接口”，不是“针对这次带着一次性 token 的请求”。
    // 一次性 query 既是秘密泄漏，也会让 exact 规则永远不再命中。
    expect(draft?.matchers).toEqual([
      { type: 'url', value: 'https://api.test/items', mode: 'exact' },
    ]);
    expect(JSON.stringify(draft)).not.toContain('super-secret');
    expect(JSON.stringify(draft)).not.toContain('abcdef');
  });
});

describe('rulesStore enable guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates new rules disabled and refuses to enable them until fields are filled', () => {
    seed([]);

    useRulesStore.getState().addRule('New rule');
    const draft = collectLeaves(useRulesStore.getState().nodes)[0];
    if (!draft) {
      throw new Error('The new rule draft is missing.');
    }
    // 默认草稿的 host 条件与 header 名都还是空的，不能声称它在工作。
    expect(draft.enabled).toBe(false);

    useRulesStore.getState().toggleRule(draft.id);
    expect(collectLeaves(useRulesStore.getState().nodes)[0]?.enabled).toBe(false);

    useRulesStore.getState().updateMatcher(draft.id, 0, {
      type: 'host',
      value: 'api.test',
      mode: 'contains',
    });
    useRulesStore.getState().updateAction(draft.id, 0, {
      type: 'header',
      phase: 'request',
      op: 'set',
      name: 'x-tag',
      value: 'on',
    });

    useRulesStore.getState().toggleRule(draft.id);
    expect(collectLeaves(useRulesStore.getState().nodes)[0]?.enabled).toBe(true);
  });

  it('always allows disabling a rule, even after its fields are cleared', () => {
    seed([rule('live', 100)], 'live');

    useRulesStore.getState().updateMatcher('live', 0, { type: 'method', value: '' });
    useRulesStore.getState().toggleRule('live');

    expect(collectLeaves(useRulesStore.getState().nodes)[0]?.enabled).toBe(false);
  });
});

describe('rulesStore apply conflict', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });


  it('keeps the local draft and the conflict flag when Core rejects the revision', async () => {
    seed([rule('local-draft', 100)], 'local-draft');
    useRulesStore.setState({ revision: 3, applied: [] });
    const replaceRules = vi.fn(async () => ({
      ok: false as const,
      reason: 'conflict' as const,
      message: 'The rule set changed elsewhere.',
    }));
    const getRules = vi.fn(async () => ({ revision: 9, nodes: [rule('remote', 100)] }));
    vi.stubGlobal('window', { interceptor: { replaceRules, getRules } });

    await applyRules();

    // 冲突不能静默丢掉用户刚写的草稿，也不能把冲突提示立刻重置掉。
    expect(getRules).not.toHaveBeenCalled();
    expect(order().map(({ id }) => id)).toEqual(['local-draft']);
    expect(useRulesStore.getState()).toMatchObject({
      revision: 3,
      conflict: true,
      saving: false,
    });
  });

  it('replaces the draft only when the user explicitly reloads', async () => {
    seed([rule('local-draft', 100)], 'local-draft');
    useRulesStore.setState({
      revision: 3,
      applied: [],
      error: 'The rule set changed elsewhere.',
      conflict: true,
    });
    const getRules = vi.fn(async () => ({ revision: 9, nodes: [rule('remote', 100)] }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    await loadRules();

    expect(order().map(({ id }) => id)).toEqual(['remote']);
    expect(useRulesStore.getState()).toMatchObject({ revision: 9, conflict: false });
  });
});