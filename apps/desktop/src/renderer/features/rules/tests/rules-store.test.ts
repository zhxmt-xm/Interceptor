import { beforeEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '../../../../shared/desktop-api';
import { useRulesStore } from '../data/rulesStore';
import { isRulesDirty } from '../utils';

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
  beforeEach(() => {
    useRulesStore.setState({
      revision: 1,
      rules: [rule('first', 100), rule('second', 200), rule('third', 300)],
      selectedId: 'second',
      applied: [rule('first', 100), rule('second', 200), rule('third', 300)],
      diagnostics: [],
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
});