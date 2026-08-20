import { beforeEach, describe, expect, it } from 'vitest';

import { collectLeaves, isFolder } from '@interceptor/core-protocol';

import { useRulesStore } from '../../data/rulesStore';
import { createRule } from '../../utils';

function reset(): void {
  useRulesStore.setState({
    nodes: [],
    revision: 0,
    selectedId: null,
    openRuleId: null,
    expandedFolders: [],
    renamingNodeId: null,
  });
}

describe('rulesStore.importSucceeded', () => {
  beforeEach(reset);

  it('appends imported nodes after the existing ones', () => {
    const existing = { ...createRule('Local'), enabled: true };
    useRulesStore.setState({ nodes: [existing] });

    const imported = { ...createRule('Imported'), id: 'imported-1' };
    useRulesStore.getState().importSucceeded([existing, imported], 2);

    expect(useRulesStore.getState().nodes.map((node) => node.name))
      .toEqual(['Local', 'Imported']);
    expect(useRulesStore.getState().applied.map((node) => node.name))
      .toEqual(['Local', 'Imported']);
    expect(useRulesStore.getState().revision).toBe(2);
  });

  it('renumbers priority across the whole tree so order matches the list', () => {
    useRulesStore.setState({ nodes: [{ ...createRule('Local'), priority: 10 }] });

    const combined = [
      { ...createRule('Local'), priority: 10 },
      { ...createRule('A'), id: 'a', priority: 20 },
      { ...createRule('B'), id: 'b', priority: 30 },
    ];
    useRulesStore.getState().importSucceeded(combined, 2);

    expect(collectLeaves(useRulesStore.getState().nodes).map((rule) => rule.priority))
      .toEqual([10, 20, 30]);
  });

  it('keeps the imported folder structure', () => {
    useRulesStore.getState().importSucceeded([
      {
        kind: 'folder',
        id: 'f',
        name: 'Ads',
        children: [{ ...createRule('Inside'), id: 'inside' }],
      },
    ], 2);

    const folder = useRulesStore.getState().nodes[0];
    expect(folder && isFolder(folder)).toBe(true);
    expect(folder && isFolder(folder) && folder.children[0]?.name).toBe('Inside');
  });

  it('leaves the current selection and open rule untouched', () => {
    const existing = createRule('Local');
    useRulesStore.setState({
      nodes: [existing],
      selectedId: existing.id,
      openRuleId: existing.id,
    });

    useRulesStore.getState().importSucceeded([
      existing,
      { ...createRule('Imported'), id: 'i' },
    ], 2);

    const state = useRulesStore.getState();
    expect(state.selectedId).toBe(existing.id);
    expect(state.openRuleId).toBe(existing.id);
  });

});
