import { create } from 'zustand';

import {
  appendNode,
  collectLeafIds,
  findNode,
  fitsDepth,
  folderDepth,
  insertNode,
  removeNode as removeTreeNode,
  renameNode as renameTreeNode,
} from '@interceptor/core-protocol';

import type { RulesState } from '../interfaces';
import {
  cloneNodes,
  createAction,
  createFolder,
  createMatcher,
  createRule,
  isRuleComplete,
  mapRule,
  normalizePriorities,
} from '../utils';

/** 往目录里放东西时顺手展开它，否则新建的节点会藏在收起的目录里。 */
function expandTo(expanded: string[], folderId: string | null): string[] {
  return folderId && !expanded.includes(folderId)
    ? [...expanded, folderId]
    : expanded;
}

export const useRulesStore = create<RulesState>((set) => ({  revision: 0,
  initialized: false,
  nodes: [],
  applied: [],
  selectedId: null,
  expandedFolders: [],
  renamingNodeId: null,
  folderMenu: null,
  hits: {},
  loading: false,
  saving: false,
  error: null,
  conflict: false,

  loadRuleSet: (ruleSet) =>
    set((state) => {
      const nodes = cloneNodes(ruleSet.nodes);
      const ruleIds = collectLeafIds(nodes);
      const selectedId =
        state.selectedId && ruleIds.includes(state.selectedId)
          ? state.selectedId
          : (ruleIds[0] ?? null);
      return {
        revision: ruleSet.revision,
        initialized: true,
        nodes,
        applied: cloneNodes(ruleSet.nodes),
        selectedId,
        renamingNodeId: null,
        folderMenu: null,
        loading: false,
        saving: false,
        conflict: false,
        error: null,
      };
    }),

  setHits: (counts) =>
    set(() => {
      const hits: Record<string, number> = {};
      for (const entry of counts) {
        hits[entry.ruleId] = entry.count;
      }
      return { hits };
    }),

  select: (id) => set({ selectedId: id }),

  toggleFolder: (id) =>
    set((state) => ({
      expandedFolders: state.expandedFolders.includes(id)
        ? state.expandedFolders.filter((folderId) => folderId !== id)
        : [...state.expandedFolders, id],
    })),

  beginRename: (id) => set({ renamingNodeId: id, folderMenu: null }),

  setFolderMenu: (menu) => set({ folderMenu: menu }),

  addRule: (name, parentId = null) =>
    set((state) => {
      const rule = createRule(name);
      return {
        nodes: normalizePriorities(appendNode(state.nodes, parentId, rule)),
        selectedId: rule.id,
        expandedFolders: expandTo(state.expandedFolders, parentId),
        folderMenu: null,
      };
    }),

  addRuleDraft: (rule) =>
    set((state) => ({
      nodes: normalizePriorities(appendNode(state.nodes, null, rule)),
      selectedId: rule.id,
    })),

  addFolder: (name, parentId = null) =>
    set((state) => {
      const folder = createFolder(name);
      return {
        nodes: appendNode(state.nodes, parentId, folder),
        expandedFolders: [...expandTo(state.expandedFolders, parentId), folder.id],
        renamingNodeId: folder.id,
        folderMenu: null,
      };
    }),

  removeNode: (id) =>
    set((state) => {
      const nodes = normalizePriorities(removeTreeNode(state.nodes, id));
      const ruleIds = collectLeafIds(nodes);
      return {
        nodes,
        selectedId:
          state.selectedId && ruleIds.includes(state.selectedId)
            ? state.selectedId
            : (ruleIds[0] ?? null),
        folderMenu: null,
      };
    }),

  renameNode: (id, name) =>
    set((state) => ({
      nodes: renameTreeNode(state.nodes, id, name),
      renamingNodeId: null,
    })),

  // 移动 = 删 + 插；超出 3 级上限时保持原样，UI 侧也不会给出落点提示。
  moveNode: (id, position) =>
    set((state) => {
      const moved = findNode(state.nodes, id);
      if (!moved) {
        return state;
      }
      const detached = removeTreeNode(state.nodes, id);
      if (!fitsDepth(folderDepth(detached, position.parentId), moved)) {
        return state;
      }
      return { nodes: normalizePriorities(insertNode(detached, moved, position)) };
    }),

  toggleRule: (id) =>
    set((state) => ({
      nodes: mapRule(state.nodes, id, (rule) =>
        // 字段还没填完的规则不允许启用；已启用的任何时候都可以关掉。
        rule.enabled || isRuleComplete(rule)
          ? { ...rule, enabled: !rule.enabled }
          : rule),
    })),

  addMatcher: (ruleId, type) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        matchers: [...rule.matchers, createMatcher(type)],
      })),
    })),

  updateMatcher: (ruleId, index, matcher) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        matchers: rule.matchers.map((item, position) =>
          position === index ? matcher : item),
      })),
    })),

  removeMatcher: (ruleId, index) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        matchers: rule.matchers.filter((_, position) => position !== index),
      })),
    })),

  addAction: (ruleId, type) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        actions: [...rule.actions, createAction(type)],
      })),
    })),

  updateAction: (ruleId, index, action) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        actions: rule.actions.map((item, position) =>
          position === index ? action : item),
      })),
    })),

  removeAction: (ruleId, index) =>
    set((state) => ({
      nodes: mapRule(state.nodes, ruleId, (rule) => ({
        ...rule,
        actions: rule.actions.filter((_, position) => position !== index),
      })),
    })),

  beginLoad: () => set({ loading: true, error: null }),

  loadFailed: (message) => set({ loading: false, error: message }),

  beginSave: () => set({ saving: true, error: null, conflict: false }),

  saveSucceeded: (revision) =>
    set((state) => ({
      revision,
      applied: cloneNodes(state.nodes),
      saving: false,
      conflict: false,
      error: null,
    })),

  saveFailed: (message, conflict) =>
    set({ saving: false, error: message, conflict }),
}));
