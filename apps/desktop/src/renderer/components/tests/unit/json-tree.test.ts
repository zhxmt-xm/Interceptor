import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { JsonTreeRow } from '../../BodyViewer/JsonTreeView/JsonTreeRow';

import {
  defaultExpanded,
  flattenJson,
  parseJsonTree,
  valueAtPath,
} from '../../BodyViewer/JsonTreeView/jsonTree';

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

describe('JSON row disclosure layout', () => {
  it.each(['$', '$.login', '$/close'])('keeps a disclosure slot for %s without moving the text', (path) => {
    const node = flattenJson(sample, defaultExpanded(sample)).find(node => node.path === path)!;
    const row = JsonTreeRow({ node, expanded: true, selected: false, onToggle: vi.fn(), onContextMenu: vi.fn() });
    const slot = Children.toArray(row.props.children)[0];
    expect(isValidElement(slot) && slot.type).toBe('span');
    if (!isValidElement<{ children: ReactNode; 'aria-hidden'?: boolean }>(slot)) throw new Error('Missing disclosure slot.');
    expect(slot.props['aria-hidden']).toBe(path === '$' ? undefined : true);
    expect(Children.count(slot.props.children)).toBe(path === '$' ? 1 : 0);
  });

  it('keeps the disclosure action inside its slot', () => {
    const onToggle = vi.fn();
    const node = flattenJson(sample, defaultExpanded(sample))[0]!;
    const row = JsonTreeRow({ node, expanded: true, selected: false, onToggle, onContextMenu: vi.fn() });
    const slot = Children.toArray(row.props.children)[0];
    if (!isValidElement<{ children: ReactNode }>(slot)) throw new Error('Missing disclosure slot.');
    const button = Children.toArray(slot.props.children)[0];
    expect(isValidElement(button) && button.type).toBe('button');
    if (!isValidElement<{ onClick(): void; 'aria-expanded': boolean }>(button)) throw new Error('Missing disclosure button.');
    expect(button.props['aria-expanded']).toBe(true);
    button.props.onClick();
    expect(onToggle).toHaveBeenCalledWith('$');
  });
});
