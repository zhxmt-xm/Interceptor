import { describe, expect, it } from 'vitest';

import { parseImportedRules } from '../../utils';

function payload(...nodes: unknown[]): unknown {
  return { nodes };
}

function rule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'rule',
    id: 'file-id',
    name: 'Block ads',
    enabled: true,
    priority: 7,
    matchers: [{ type: 'host', value: 'ads.example', mode: 'contains' }],
    actions: [{ type: 'block', mode: 'reset' }],
    ...overrides,
  };
}

describe('parseImportedRules', () => {
  it('rejects a file whose top level is not a node payload', () => {
    expect(parseImportedRules('nope').ok).toBe(false);
    expect(parseImportedRules({ rules: [] }).ok).toBe(false);
  });

  it('imports a valid rule and regenerates its id', () => {
    const result = parseImportedRules(payload(rule()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(1);
    expect(result.skipped).toEqual([]);
    const imported = result.nodes[0];
    expect(imported?.id).not.toBe('file-id');
    expect(imported?.name).toBe('Block ads');
  });

  it('keeps the enabled flag from the file and counts it', () => {
    const result = parseImportedRules(payload(
      rule({ name: 'On', enabled: true }),
      rule({ name: 'Off', enabled: false }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enabledCount).toBe(1);
  });

  it('rejects a node whose kind is not a rule', () => {
    const result = parseImportedRules(payload(rule({ kind: 'request' })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([{ path: 'Block ads', reason: 'unknown-kind' }]);
  });

  it('rejects a rule whose matchers or actions are not arrays', () => {
    const result = parseImportedRules(payload(
      rule({ name: 'Bad matchers', matchers: 'all' }),
      rule({ name: 'Bad actions', actions: {} }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Bad matchers', reason: 'invalid-matchers' },
      { path: 'Bad actions', reason: 'invalid-actions' },
    ]);
  });

  it('rejects unknown matcher and action types', () => {
    const result = parseImportedRules(payload(
      rule({ name: 'Odd matcher', matchers: [{ type: 'weather', value: 'sunny' }] }),
      rule({ name: 'Odd action', actions: [{ type: 'redirect-all' }] }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Odd matcher', reason: 'unknown-matcher-type' },
      { path: 'Odd action', reason: 'unknown-action-type' },
    ]);
  });

  it('rejects malformed matcher and action fields', () => {
    const result = parseImportedRules(payload(
      rule({
        name: 'Bad matcher fields',
        matchers: [{ type: 'host', value: 42, mode: 'contains' }],
      }),
      rule({
        name: 'Bad action fields',
        actions: [{ type: 'map-local', path: 42 }],
      }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Bad matcher fields', reason: 'invalid-matcher-fields' },
      { path: 'Bad action fields', reason: 'invalid-action-fields' },
    ]);
  });

  it('imports request and response breakpoints', () => {
    const result = parseImportedRules(payload(
      rule({
        name: 'Request breakpoint',
        actions: [{
          type: 'breakpoint',
          phase: 'request',
        }],
      }),
      rule({
        name: 'Response breakpoint',
        actions: [{
          type: 'breakpoint',
          phase: 'response',
        }],
      }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('rejects an enabled flag that is not a boolean', () => {
    const result = parseImportedRules(payload(rule({ enabled: 'yes' })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([{ path: 'Block ads', reason: 'invalid-enabled' }]);
  });

  it('skips an incomplete rule so the accepted set remains immediately saveable', () => {
    const result = parseImportedRules(payload(rule({
      name: 'Unfinished',
      matchers: [{ type: 'host', value: '', mode: 'contains' }],
    })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(0);
    expect(result.skipped).toEqual([
      { path: 'Unfinished', reason: 'incomplete-rule' },
    ]);
  });

  it('keeps valid siblings when one rule inside a folder is malformed', () => {
    const result = parseImportedRules(payload({
      kind: 'folder',
      id: 'f',
      name: 'Ads',
      children: [rule({ name: 'Good' }), rule({ name: 'Broken', actions: 'no' })],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folderCount).toBe(1);
    expect(result.leafCount).toBe(1);
    expect(result.skipped).toEqual([{ path: 'Ads / Broken', reason: 'invalid-actions' }]);
  });
});
