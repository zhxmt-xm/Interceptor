import { describe, expect, it } from 'vitest';

import {
  MAX_FOLDER_DEPTH,
  parseImportedTree,
  type TreeLeaf,
} from '../../tree';

interface TestLeaf extends TreeLeaf {
  readonly kind: 'rule';
  readonly enabled: boolean;
}

/** 领域校验替身：叶子的 kind 与字段合法性都归领域判断，通用遍历只负责结构。 */
function parseLeaf(raw: Record<string, unknown>) {
  if (raw.kind !== 'rule') {
    return { ok: false as const, reason: 'unknown-kind' };
  }
  if (typeof raw.enabled !== 'boolean') {
    return { ok: false as const, reason: 'invalid-enabled' };
  }
  return {
    ok: true as const,
    leaf: {
      kind: 'rule' as const,
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      enabled: raw.enabled,
    },
  };
}

let counter = 0;
const createId = (): string => `new-${++counter}`;

function parse(value: unknown) {
  counter = 0;
  return parseImportedTree<TestLeaf>(value, parseLeaf, createId);
}

describe('parseImportedTree', () => {
  it('rejects a payload whose nodes are not an array', () => {
    expect(parse({ nodes: 'oops' }).ok).toBe(false);
    expect(parse(null).ok).toBe(false);
    expect(parse({}).ok).toBe(false);
  });

  it('regenerates every id so a file can be imported twice without collisions', () => {
    const result = parse({
      nodes: [
        { kind: 'folder', id: 'file-folder', name: 'Ads', children: [
          { kind: 'rule', id: 'file-rule', name: 'Block', enabled: true },
        ] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const folder = result.nodes[0];
    expect(folder.id).not.toBe('file-folder');
    expect(folder.kind === 'folder' && folder.children[0].id).not.toBe('file-rule');
  });

  it('keeps the enabled flag exactly as the file declares it', () => {
    const result = parse({
      nodes: [
        { kind: 'rule', id: 'a', name: 'On', enabled: true },
        { kind: 'rule', id: 'b', name: 'Off', enabled: false },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.map((node) => (node as TestLeaf).enabled)).toEqual([true, false]);
    expect(result.enabledCount).toBe(1);
  });

  it('preserves the folder structure declared in the file', () => {
    const result = parse({
      nodes: [
        { kind: 'folder', id: 'f1', name: 'A', children: [
          { kind: 'folder', id: 'f2', name: 'B', children: [
            { kind: 'rule', id: 'r', name: 'Deep', enabled: true },
          ] },
        ] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folderCount).toBe(2);
    expect(result.leafCount).toBe(1);
  });

  it('skips an invalid leaf but keeps its siblings', () => {
    const result = parse({
      nodes: [
        { kind: 'folder', id: 'f', name: 'Ads', children: [
          { kind: 'rule', id: 'ok', name: 'Good', enabled: true },
          { kind: 'rule', id: 'bad', name: 'Broken', enabled: 'yes' },
        ] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(1);
    expect(result.skipped).toEqual([
      { path: 'Ads / Broken', reason: 'invalid-enabled' },
    ]);
  });

  it('skips a whole subtree when the folder itself is malformed', () => {
    const result = parse({
      nodes: [
        { kind: 'folder', id: 'f', name: 'Broken', children: 'nope' },
        { kind: 'rule', id: 'r', name: 'Kept', enabled: true },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(1);
    expect(result.folderCount).toBe(0);
    expect(result.skipped).toEqual([
      { path: 'Broken', reason: 'invalid-children' },
    ]);
  });

  it('skips nodes deeper than the folder depth limit instead of lifting them', () => {
    const result = parse({
      nodes: [
        { kind: 'folder', id: 'f1', name: 'L1', children: [
          { kind: 'folder', id: 'f2', name: 'L2', children: [
            { kind: 'folder', id: 'f3', name: 'L3', children: [
              { kind: 'folder', id: 'f4', name: 'L4', children: [] },
            ] },
          ] },
        ] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folderCount).toBe(MAX_FOLDER_DEPTH);
    expect(result.skipped).toEqual([
      { path: 'L1 / L2 / L3 / L4', reason: 'exceeds-depth' },
    ]);
  });

  it('reports an unknown kind and a non-object entry by position', () => {
    const result = parse({
      nodes: [
        { kind: 'mystery', id: 'x', name: 'Odd' },
        42,
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Odd', reason: 'unknown-kind' },
      { path: '#2', reason: 'not-an-object' },
    ]);
  });

  it('falls back to a positional label when the name is unusable', () => {
    const result = parse({
      nodes: [
        { kind: 'rule', id: 'a', name: 42, enabled: true },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: '#1', reason: 'missing-name' },
    ]);
  });
});
