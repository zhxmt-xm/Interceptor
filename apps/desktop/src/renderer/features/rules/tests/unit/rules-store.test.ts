import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectLeaves } from '@interceptor/core-protocol';

import type {
  RuleDefinition,
  RuleFolder,
  RuleNode,
} from '../../../../../shared/desktop-api';
import { useRulesStore } from '../../data/rulesStore';
import {
  addBreakpointRule,
  addRequestRuleDraft,
  applyRules,
  importRules,
  loadRules,
  removeBreakpointRule,
  selectRuleDraft,
  toggleBreakpointRule,
  synchronizeExternalRulesChange,
} from '../../data/useRulesData';
import { createRuleFromRequest, isRulesDirty } from '../../utils';

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

function incompleteRule(id: string): RuleDefinition {
  return {
    kind: 'rule',
    id,
    name: id,
    enabled: false,
    priority: 100,
    matchers: [{ type: 'host', value: '', mode: 'contains' }],
    actions: [{ type: 'header', phase: 'request', op: 'set', name: '', value: '' }],
  };
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
    openRuleId: selectedId,
    expandedFolders: [],
    renamingNodeId: null,
    hits: {},
    loading: false,
    saving: false,
    error: null,
    conflict: false,
    latestExternalRevision: 0,
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

  it('reloads a clean draft after an external Rules replacement', async () => {
    const next = rule('external', 10);
    const getRules = vi.fn(async () => ({ revision: 2, nodes: [next] }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    await synchronizeExternalRulesChange({ revision: 2 });

    expect(getRules).toHaveBeenCalledOnce();
    expect(useRulesStore.getState()).toMatchObject({
      revision: 2,
      nodes: [next],
      applied: [next],
      conflict: false,
    });
  });

  it('preserves a dirty draft when an external Rules replacement arrives', async () => {
    useRulesStore.getState().renameNode('first', 'Local draft');
    const getRules = vi.fn(async () => ({ revision: 2, nodes: [rule('external', 10)] }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    await synchronizeExternalRulesChange({ revision: 2 });

    expect(getRules).not.toHaveBeenCalled();
    expect(useRulesStore.getState()).toMatchObject({
      revision: 1,
      conflict: true,
    });
    expect(useRulesStore.getState().nodes[0]?.name).toBe('Local draft');
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

describe('rulesStore selection', () => {
  it('keeps the open rule when a folder becomes the selection', () => {
    seed([folder('g', [rule('a', 1)]), rule('b', 2)], 'b');

    useRulesStore.getState().select('g');

    expect(useRulesStore.getState().selectedId).toBe('g');
    expect(useRulesStore.getState().openRuleId).toBe('b');
  });

  it('opens the rule that becomes the selection', () => {
    seed([folder('g', [rule('a', 1)]), rule('b', 2)], 'b');

    useRulesStore.getState().select('a');

    expect(useRulesStore.getState().selectedId).toBe('a');
    expect(useRulesStore.getState().openRuleId).toBe('a');
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

  it('does not send an incomplete rule set to Core', async () => {
    seed([]);
    useRulesStore.getState().addRule('Incomplete rule');
    const replaceRules = vi.fn(async () => ({ ok: true as const, revision: 2 }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    await expect(applyRules()).resolves.toBe(false);

    expect(replaceRules).not.toHaveBeenCalled();
    expect(useRulesStore.getState().saving).toBe(false);
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

  it('keeps edits made while Apply is pending dirty after the saved snapshot commits', async () => {
    seed([rule('submitted', 100)], 'submitted');
    useRulesStore.getState().renameNode('submitted', 'Submitted snapshot');
    let completeSave: ((result: { ok: true; revision: number }) => void) | undefined;
    const replaceRules = vi.fn(() => new Promise<{ ok: true; revision: number }>((resolve) => {
      completeSave = resolve;
    }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    const saving = applyRules();
    await vi.waitFor(() => expect(replaceRules).toHaveBeenCalledOnce());
    useRulesStore.getState().renameNode('submitted', 'Edited while saving');
    completeSave?.({ ok: true, revision: 2 });
    await saving;

    const state = useRulesStore.getState();
    expect(collectLeaves(state.nodes)[0]?.name).toBe('Edited while saving');
    expect(collectLeaves(state.applied)[0]?.name).toBe('Submitted snapshot');
    expect(isRulesDirty(state.nodes, state.applied)).toBe(true);
    expect(state).toMatchObject({ revision: 2, saving: false });
  });

  it('keeps edits and an external conflict that arrive while Import is saving', async () => {
    seed([rule('baseline', 100)], 'baseline');
    let completeSave: ((result: { ok: true; revision: number }) => void) | undefined;
    const replaceRules = vi.fn(() => new Promise<{ ok: true; revision: number }>((resolve) => {
      completeSave = resolve;
    }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    const importing = importRules([rule('imported', 200)]);
    await vi.waitFor(() => expect(replaceRules).toHaveBeenCalledOnce());
    useRulesStore.getState().renameNode('baseline', 'Edited while importing');
    await synchronizeExternalRulesChange({ revision: 3 });
    completeSave?.({ ok: true, revision: 2 });
    await expect(importing).resolves.toBe(true);

    const state = useRulesStore.getState();
    expect(collectLeaves(state.nodes).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'baseline', name: 'Edited while importing' },
    ]);
    expect(collectLeaves(state.applied).map(({ id }) => id)).toEqual(['baseline', 'imported']);
    expect(state).toMatchObject({
      revision: 2,
      latestExternalRevision: 3,
      saving: false,
      conflict: true,
    });
  });

  it('does not overwrite edits made while an external reload is pending', async () => {
    seed([rule('first', 100)], 'first');
    let completeLoad: ((ruleSet: { revision: number; nodes: RuleNode[] }) => void) | undefined;
    const getRules = vi.fn(() => new Promise<{ revision: number; nodes: RuleNode[] }>((resolve) => {
      completeLoad = resolve;
    }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    const synchronizing = synchronizeExternalRulesChange({ revision: 2 });
    await vi.waitFor(() => expect(getRules).toHaveBeenCalledOnce());
    useRulesStore.getState().renameNode('first', 'Local edit during reload');
    completeLoad?.({ revision: 2, nodes: [rule('external', 10)] });
    await synchronizing;

    expect(useRulesStore.getState().nodes[0]?.name).toBe('Local edit during reload');
    expect(useRulesStore.getState()).toMatchObject({ revision: 1, conflict: true });
  });

  it('ignores an older external reload that completes after a newer revision', async () => {
    seed([rule('first', 100)], 'first');
    const completeLoads: Array<(ruleSet: { revision: number; nodes: RuleNode[] }) => void> = [];
    const getRules = vi.fn(() => new Promise<{ revision: number; nodes: RuleNode[] }>((resolve) => {
      completeLoads.push(resolve);
    }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    const revisionTwo = synchronizeExternalRulesChange({ revision: 2 });
    const revisionThree = synchronizeExternalRulesChange({ revision: 3 });
    await vi.waitFor(() => expect(getRules).toHaveBeenCalledTimes(2));
    completeLoads[1]?.({ revision: 3, nodes: [rule('revision-3', 10)] });
    await revisionThree;
    completeLoads[0]?.({ revision: 2, nodes: [rule('revision-2', 10)] });
    await revisionTwo;

    expect(useRulesStore.getState()).toMatchObject({ revision: 3, conflict: false });
    expect(useRulesStore.getState().nodes[0]?.id).toBe('revision-3');
  });

  it('does not let an initial or explicit load overwrite a newer external revision', async () => {
    seed([], null);
    useRulesStore.setState({ initialized: false, revision: 0, latestExternalRevision: 0 });
    const completeLoads: Array<(ruleSet: { revision: number; nodes: RuleNode[] }) => void> = [];
    const getRules = vi.fn(() => new Promise<{ revision: number; nodes: RuleNode[] }>((resolve) => {
      completeLoads.push(resolve);
    }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    const initial = loadRules();
    const external = synchronizeExternalRulesChange({ revision: 2 });
    await vi.waitFor(() => expect(getRules).toHaveBeenCalledTimes(2));
    completeLoads[1]?.({ revision: 2, nodes: [rule('revision-2', 10)] });
    await external;
    completeLoads[0]?.({ revision: 1, nodes: [rule('revision-1', 10)] });
    await initial;

    expect(useRulesStore.getState().revision).toBe(2);
    expect(useRulesStore.getState().nodes[0]?.id).toBe('revision-2');

    seed([rule('baseline', 100)], 'baseline');
    const completeExplicitLoads: Array<(
      ruleSet: { revision: number; nodes: RuleNode[] },
    ) => void> = [];
    const explicitGetRules = vi.fn(() => new Promise<{
      revision: number;
      nodes: RuleNode[];
    }>((resolve) => {
      completeExplicitLoads.push(resolve);
    }));
    vi.stubGlobal('window', { interceptor: { getRules: explicitGetRules } });

    const revisionThree = synchronizeExternalRulesChange({ revision: 3 });
    await vi.waitFor(() => expect(explicitGetRules).toHaveBeenCalledOnce());
    const explicitReload = loadRules();
    await vi.waitFor(() => expect(explicitGetRules).toHaveBeenCalledTimes(2));
    completeExplicitLoads[1]?.({ revision: 2, nodes: [rule('revision-2', 10)] });
    await explicitReload;
    completeExplicitLoads[0]?.({ revision: 3, nodes: [rule('revision-3', 10)] });
    await revisionThree;

    expect(useRulesStore.getState()).toMatchObject({
      revision: 1,
      latestExternalRevision: 3,
      loading: false,
      conflict: true,
    });
    expect(useRulesStore.getState().nodes[0]?.id).toBe('baseline');

    seed([rule('loading-baseline', 100)], 'loading-baseline');
    useRulesStore.setState({ initialized: false });
    const completeStaleLoads: Array<(
      ruleSet: { revision: number; nodes: RuleNode[] },
    ) => void> = [];
    const staleGetRules = vi.fn(() => new Promise<{
      revision: number;
      nodes: RuleNode[];
    }>((resolve) => {
      completeStaleLoads.push(resolve);
    }));
    vi.stubGlobal('window', { interceptor: { getRules: staleGetRules } });

    const loadingInitial = loadRules();
    await vi.waitFor(() => expect(staleGetRules).toHaveBeenCalledOnce());
    const staleExternal = synchronizeExternalRulesChange({ revision: 3 });
    await vi.waitFor(() => expect(staleGetRules).toHaveBeenCalledTimes(2));
    completeStaleLoads[1]?.({ revision: 2, nodes: [rule('stale-external', 10)] });
    await staleExternal;
    completeStaleLoads[0]?.({ revision: 1, nodes: [rule('stale-initial', 10)] });
    await loadingInitial;

    expect(useRulesStore.getState()).toMatchObject({
      revision: 1,
      latestExternalRevision: 3,
      loading: false,
      conflict: true,
    });
    expect(useRulesStore.getState().nodes[0]?.id).toBe('loading-baseline');
  });

  it('ignores a lower revision event received while a higher revision is loading', async () => {
    seed([rule('first', 100)], 'first');
    let completeLoad: ((ruleSet: { revision: number; nodes: RuleNode[] }) => void) | undefined;
    const getRules = vi.fn(() => new Promise<{ revision: number; nodes: RuleNode[] }>((resolve) => {
      completeLoad = resolve;
    }));
    vi.stubGlobal('window', { interceptor: { getRules } });

    const revisionThree = synchronizeExternalRulesChange({ revision: 3 });
    const revisionTwo = synchronizeExternalRulesChange({ revision: 2 });
    await vi.waitFor(() => expect(getRules).toHaveBeenCalledOnce());
    completeLoad?.({ revision: 3, nodes: [rule('revision-3', 10)] });
    await Promise.all([revisionThree, revisionTwo]);

    expect(useRulesStore.getState().revision).toBe(3);
    expect(useRulesStore.getState().nodes[0]?.id).toBe('revision-3');
  });

  it('retains an external conflict that arrives while a local save is pending', async () => {
    seed([rule('submitted', 100)], 'submitted');
    useRulesStore.getState().renameNode('submitted', 'Submitted snapshot');
    let completeSave: ((result: { ok: true; revision: number }) => void) | undefined;
    const replaceRules = vi.fn(() => new Promise<{ ok: true; revision: number }>((resolve) => {
      completeSave = resolve;
    }));
    const getRules = vi.fn();
    vi.stubGlobal('window', { interceptor: { replaceRules, getRules } });

    const saving = applyRules();
    await vi.waitFor(() => expect(replaceRules).toHaveBeenCalledOnce());
    await synchronizeExternalRulesChange({ revision: 3 });
    expect(useRulesStore.getState()).toMatchObject({ saving: true, conflict: true });
    completeSave?.({ ok: true, revision: 2 });
    await saving;

    expect(getRules).not.toHaveBeenCalled();
    expect(useRulesStore.getState()).toMatchObject({
      revision: 2,
      saving: false,
      conflict: true,
    });
  });
});

describe('breakpoint quick create', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    seed([]);
  });

  it('does not create a breakpoint while another draft is incomplete', async () => {
    const replaceRules = vi.fn(async () => ({ ok: true as const, revision: 2 }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    seed([incompleteRule('incomplete')], 'incomplete');
    const before = structuredClone(useRulesStore.getState().nodes);
    await expect(addBreakpointRule(
      'Pause checkout',
      'https://shop.example.com/checkout',
      'endpoint',
    )).resolves.toBeNull();
    expect(useRulesStore.getState().nodes).toEqual(before);
    expect(replaceRules).not.toHaveBeenCalled();
  });

  it('does not remove a breakpoint while another draft is incomplete', async () => {
    const replaceRules = vi.fn(async () => ({ ok: true as const, revision: 2 }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    seed([rule('breakpoint-rule', 100), incompleteRule('incomplete')], 'breakpoint-rule');
    const before = structuredClone(useRulesStore.getState().nodes);
    await expect(removeBreakpointRule('breakpoint-rule')).resolves.toBe(false);
    expect(useRulesStore.getState().nodes).toEqual(before);
    expect(replaceRules).not.toHaveBeenCalled();
  });

  it('does not toggle a breakpoint while another draft is incomplete', async () => {
    const replaceRules = vi.fn(async () => ({ ok: true as const, revision: 2 }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    seed([rule('breakpoint-rule', 100), incompleteRule('incomplete')], 'breakpoint-rule');
    await toggleBreakpointRule('breakpoint-rule');
    expect(collectLeaves(useRulesStore.getState().nodes)
      .find(({ id }) => id === 'breakpoint-rule')?.enabled).toBe(true);
    expect(replaceRules).not.toHaveBeenCalled();
  });

  it('returns the created rule only after Core applies it and supports Undo', async () => {
    const replaceRules = vi.fn(async () => ({ ok: true as const, revision: 2 }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    const ruleId = await addBreakpointRule(
      'Pause checkout',
      'https://shop.example.com/checkout',
      'endpoint',
    );

    expect(ruleId).not.toBeNull();
    expect(collectLeaves(useRulesStore.getState().applied)).toHaveLength(1);

    replaceRules.mockResolvedValueOnce({ ok: true as const, revision: 3 });
    await expect(removeBreakpointRule(ruleId!)).resolves.toBe(true);
    expect(collectLeaves(useRulesStore.getState().applied)).toHaveLength(0);
  });

  it('does not report a created breakpoint when Core rejects Apply', async () => {
    const replaceRules = vi.fn(async () => ({
      ok: false as const,
      reason: 'conflict' as const,
      message: 'The rule set changed elsewhere.',
    }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    await expect(addBreakpointRule(
      'Pause checkout',
      'https://shop.example.com/checkout',
      'endpoint',
    )).resolves.toBeNull();
    expect(useRulesStore.getState()).toMatchObject({ conflict: true, saving: false });
  });

  it('keeps the Undo action retryable when Core rejects the deletion', async () => {
    seed([rule('breakpoint-rule', 100)], 'breakpoint-rule');
    const replaceRules = vi.fn(async () => ({
      ok: false as const,
      reason: 'conflict' as const,
      message: 'The rule set changed elsewhere.',
    }));
    vi.stubGlobal('window', { interceptor: { replaceRules } });

    await expect(removeBreakpointRule('breakpoint-rule')).resolves.toBe(false);
    expect(useRulesStore.getState()).toMatchObject({ conflict: true, saving: false });
  });
});