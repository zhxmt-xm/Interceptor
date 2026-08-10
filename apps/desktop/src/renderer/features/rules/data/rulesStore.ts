import { create } from 'zustand';

import {
  appendNode,
  collectLeafIds,
  findLeaf,
  findNode,
  fitsDepth,
  folderDepth,
  insertNode,
  parentFolderId,
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

/** 树变动后把 ID 落回仍存在的规则；原目标没了就退到第一条。 */
function fallbackRuleId(ruleIds: string[], id: string | null): string | null {
  return id && ruleIds.includes(id) ? id : (ruleIds[0] ?? null);
}

/** 新建落点：选中目录就放进去，选中规则就跟它平级，都没选就放根。 */
function createParentId(state: RulesState): string | null {
  if (state.selectedId === null) {
    return null;
  }
  const selected = findNode(state.nodes, state.selectedId);
  if (selected && selected.kind === 'folder') {
    return selected.id;
  }
  return parentFolderId(state.nodes, state.selectedId);
}

export const useRulesStore = create<RulesState>((set) => ({
  revision: 0,
  initialized: false,
  nodes: [],
  applied: [],
  selectedId: null,
  openRuleId: null,
  expandedFolders: [],
  renamingNodeId: null,
  hits: {},
  loading: false,
  saving: false,
  error: null,
  conflict: false,

  loadRuleSet: (ruleSet) =>
    set((state) => {
      const nodes = cloneNodes(ruleSet.nodes);
      const ruleIds = collectLeafIds(nodes);
      const selectedId = fallbackRuleId(ruleIds, state.selectedId);
      return {
        revision: ruleSet.revision,
        initialized: true,
        nodes,
        applied: cloneNodes(ruleSet.nodes),
        selectedId,
        openRuleId: fallbackRuleId(ruleIds, state.openRuleId),
        renamingNodeId: null,
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

  select: (id) =>
    set((state) => ({
      selectedId: id,
      // 只有选中规则才换右侧；选目录保持当前编辑器。
      openRuleId:
        id !== null && findLeaf(state.nodes, id) ? id : state.openRuleId,
    })),

  toggleFolder: (id) =>
    set((state) => ({
      expandedFolders: state.expandedFolders.includes(id)
        ? state.expandedFolders.filter((folderId) => folderId !== id)
        : [...state.expandedFolders, id],
    })),

  expandFolder: (id) =>
    set((state) => ({
      expandedFolders: state.expandedFolders.includes(id)
        ? state.expandedFolders
        : [...state.expandedFolders, id],
    })),

  beginRename: (id) => set({ renamingNodeId: id }),

  addRule: (name, parentId) =>
    set((state) => {
      const rule = createRule(name);
      const target = parentId === undefined ? createParentId(state) : parentId;
      return {
        nodes: normalizePriorities(appendNode(state.nodes, target, rule)),
        selectedId: rule.id,
        openRuleId: rule.id,
        expandedFolders: expandTo(state.expandedFolders, target),
      };
    }),

  addRuleDraft: (rule) =>
    set((state) => ({
      nodes: normalizePriorities(appendNode(state.nodes, null, rule)),
      selectedId: rule.id,
      openRuleId: rule.id,
    })),

  addFolder: (name, parentId) =>
    set((state) => {
      const folder = createFolder(name);
      const target = parentId === undefined ? createParentId(state) : parentId;
      if (!fitsDepth(folderDepth(state.nodes, target), folder)) {
        return state;
      }
      return {
        nodes: appendNode(state.nodes, target, folder),
        expandedFolders: [...expandTo(state.expandedFolders, target), folder.id],
        renamingNodeId: folder.id,
      };
    }),

  removeNode: (id) =>
    set((state) => {
      const nodes = normalizePriorities(removeTreeNode(state.nodes, id));
      const ruleIds = collectLeafIds(nodes);
      return {
        nodes,
        selectedId: fallbackRuleId(ruleIds, state.selectedId),
        openRuleId: fallbackRuleId(ruleIds, state.openRuleId),
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
