import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuleDefinition } from '../../../../shared/desktop-api';
import { useRulesStore } from '../data/rulesStore';
import { addRequestRuleDraft, selectRuleDraft } from '../data/useRulesData';
import { createRuleFromRequest, isRulesDirty } from '../utils';

function rule(id: string, priority: number): RuleDefinition {
  return {
    id,
    name: id,
    enabled: true,
    priority,
    matchers: [{ type: 'method', value: 'GET' }],
    actions: [{ type: 'status', statusCode: 200 }],
  };
}

describe('rulesStore ordering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useRulesStore.setState({
      revision: 1,
      initialized: true,
      rules: [rule('first', 100), rule('second', 200), rule('third', 300)],
      selectedId: 'second',
      applied: [rule('first', 100), rule('second', 200), rule('third', 300)],
      hits: {},
      loading: false,
      saving: false,
      error: null,
      conflict: false,
    });
  });

  it('moves a rule and swaps priorities so Core execution follows the list', () => {
    useRulesStore.getState().moveRule('second', -1);

    expect(useRulesStore.getState().rules.map(({ id, priority }) => ({ id, priority })))
      .toEqual([
        { id: 'second', priority: 100 },
        { id: 'first', priority: 200 },
        { id: 'third', priority: 300 },
      ]);
    const moved = useRulesStore.getState();
    expect(isRulesDirty(moved.rules, moved.applied)).toBe(true);
  });

  it('ignores a move beyond the list boundary', () => {
    useRulesStore.getState().moveRule('first', -1);

    expect(useRulesStore.getState().rules.map((item) => item.id))
      .toEqual(['first', 'second', 'third']);
    const unchanged = useRulesStore.getState();
    expect(isRulesDirty(unchanged.rules, unchanged.applied)).toBe(false);
  });

  it('moves a dragged rule directly to its drop target', () => {
    useRulesStore.getState().moveRuleTo('first', 'third');

    expect(useRulesStore.getState().rules.map(({ id, priority }) => ({ id, priority })))
      .toEqual([
        { id: 'second', priority: 100 },
        { id: 'third', priority: 200 },
        { id: 'first', priority: 300 },
      ]);
  });

  it('preserves the persisted list order while loading editable drafts', () => {
    useRulesStore.getState().loadRuleSet({
      revision: 2,
      rules: [rule('z-rule', 200), rule('b-rule', 100), rule('a-rule', 100)],
    });

    expect(useRulesStore.getState().rules.map((item) => item.id))
      .toEqual(['z-rule', 'b-rule', 'a-rule']);
  });

  it('adds an exact-URL request rule as an unsaved selected draft', () => {
    const draft = createRuleFromRequest(
      400,
      'Block api.test/items',
      'https://api.test/items?active=true',
      'block',
    );
    useRulesStore.getState().addRuleDraft(draft);

    const state = useRulesStore.getState();
    expect(state.selectedId).toBe(draft.id);
    expect(state.rules.at(-1)).toMatchObject({
      name: 'Block api.test/items',
      priority: 400,
      matchers: [{
        type: 'url',
        value: 'https://api.test/items?active=true',
        mode: 'exact',
      }],
      actions: [{ type: 'block', mode: 'reset' }],
    });
    expect(isRulesDirty(state.rules, state.applied)).toBe(true);
  });

  it('loads Core rules before adding a Capture draft and resolves marker targets', async () => {
    const persisted = rule('persisted', 100);
    useRulesStore.setState({
      revision: 0,
      initialized: false,
      rules: [],
      selectedId: null,
      applied: [],
      hits: {},
      loading: false,
      saving: false,
      error: null,
      conflict: false,
    });
    const getRules = vi.fn(async () => ({ revision: 7, rules: [persisted] }));
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
    expect(useRulesStore.getState().rules).toHaveLength(2);

    expect(await selectRuleDraft('persisted')).toBe(true);
    expect(useRulesStore.getState().selectedId).toBe('persisted');
    expect(await selectRuleDraft('deleted-rule')).toBe(false);
    expect(useRulesStore.getState().selectedId).toBe('persisted');
  });
});

describe('rulesStore enable guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates new rules disabled and refuses to enable them until fields are filled', () => {
    useRulesStore.setState({
      revision: 1,
      initialized: true,
      rules: [],
      applied: [],
      selectedId: null,
      hits: {},
      loading: false,
      saving: false,
      error: null,
      conflict: false,
    });

    useRulesStore.getState().addRule('New rule');
    const draft = useRulesStore.getState().rules[0];
    if (!draft) {
      throw new Error('The new rule draft is missing.');
    }
    // 默认草稿的 host 条件与 header 名都还是空的，不能声称它在工作。
    expect(draft.enabled).toBe(false);

    useRulesStore.getState().toggleRule(draft.id);
    expect(useRulesStore.getState().rules[0]?.enabled).toBe(false);

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
    expect(useRulesStore.getState().rules[0]?.enabled).toBe(true);
  });

  it('always allows disabling a rule, even after its fields are cleared', () => {
    useRulesStore.setState({
      revision: 1,
      initialized: true,
      rules: [rule('live', 100)],
      applied: [rule('live', 100)],
      selectedId: 'live',
      hits: {},
      loading: false,
      saving: false,
      error: null,
      conflict: false,
    });

    useRulesStore.getState().updateMatcher('live', 0, { type: 'method', value: '' });
    useRulesStore.getState().toggleRule('live');

    expect(useRulesStore.getState().rules[0]?.enabled).toBe(false);
  });
});