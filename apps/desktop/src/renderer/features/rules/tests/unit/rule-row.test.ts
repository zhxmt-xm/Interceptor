import { describe, expect, it } from 'vitest';

import type { RuleDefinition } from '../../../../../shared/desktop-api';
import { deriveRuleRowChips } from '../../utils';

function ruleWithActions(actions: RuleDefinition['actions']): RuleDefinition {
  return {
    kind: 'rule',
    id: 'rule-row-actions',
    name: 'Rule row actions',
    enabled: true,
    priority: 10,
    matchers: [{ type: 'method', value: 'GET' }],
    actions,
  };
}

describe('deriveRuleRowChips', () => {
  it('keeps the complete ordered list while limiting the row to two chips', () => {
    const result = deriveRuleRowChips(ruleWithActions([
      { type: 'map-local', path: 'fixture.json' },
      { type: 'header', phase: 'request', op: 'set', name: 'x-e2e', value: 'yes' },
      { type: 'delay', phase: 'request', ms: 50 },
      { type: 'breakpoint', phase: 'request' },
    ]));

    expect(result.inlineChips).toEqual([
      ['map', 'rules.mapLocal'],
      ['rewrite', 'rules.rewrite'],
    ]);
    expect(result.allChips).toEqual([
      ['map', 'rules.mapLocal'],
      ['rewrite', 'rules.rewrite'],
      ['flow', 'rules.delay'],
      ['brk', 'rules.breakpoint'],
    ]);
    expect(result.hasOverflow).toBe(true);
  });

  it('does not expose overflow when the complete list fits inline', () => {
    const result = deriveRuleRowChips(ruleWithActions([
      { type: 'map-local', path: 'fixture.json' },
      { type: 'delay', phase: 'response', ms: 50 },
    ]));

    expect(result.inlineChips).toEqual(result.allChips);
    expect(result.hasOverflow).toBe(false);
  });
});