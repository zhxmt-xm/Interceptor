import { describe, expect, it } from 'vitest';

import {
  defaultExpanded,
  flattenJson,
  parseJsonTree,
  valueAtPath,
} from '../BodyViewer/JsonTreeView/jsonTree';

const sample = {
  login: 'octocat',
  plan: { name: 'pro', seats: 3 },
  organizations: ['github', 'acme'],
};

describe('json tree', () => {
  it('expands the root and its direct containers, nothing deeper', () => {
    const expanded = defaultExpanded({ a: { b: { c: 1 } } });
    expect([...expanded].sort()).toEqual(['$', '$.a']);
  });

  it('emits a closing row for every expanded container', () => {
    const rows = flattenJson(sample, defaultExpanded(sample));
    expect(rows.filter((row) => row.closing).map((row) => row.path)).toEqual([
      '$.plan/close',
      '$.organizations/close',
      '$/close',
    ]);
  });

  it('collapsed containers contribute one row and no children', () => {
    const rows = flattenJson(sample, new Set(['$']));
    expect(rows.map((row) => row.path)).toEqual([
      '$',
      '$.login',
      '$.plan',
      '$.organizations',
      '$/close',
    ]);
  });

  it('indexes array children and keeps their depth', () => {
    const rows = flattenJson(sample, defaultExpanded(sample));
    const first = rows.find((row) => row.path === '$.organizations[0]');
    expect(first).toMatchObject({ label: '0', isIndex: true, depth: 2, kind: 'string' });
  });

  it('resolves a node path back to its subtree', () => {
    expect(valueAtPath(sample, '$.plan')).toEqual({ name: 'pro', seats: 3 });
    expect(valueAtPath(sample, '$.organizations[1]')).toBe('acme');
    expect(valueAtPath(sample, '$')).toBe(sample);
    expect(valueAtPath(sample, '$.missing.deep')).toBeUndefined();
  });

  it('parses behind an XSSI guard and refuses non-document roots', () => {
    expect(parseJsonTree(')]}\'\n{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonTree('42')).toBeUndefined();
    expect(parseJsonTree('{"truncated":')).toBeUndefined();
  });
});
