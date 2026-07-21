import { create } from 'zustand';

import type { RulesState } from '../interfaces';
import {
  createAction,
  createMatcher,
  createRule,
  mapRule,
  nextPriority,
  reorderRules,
} from '../utils';

export const useRulesStore = create<RulesState>((set, get) => ({
  revision: 0,
  rules: [],
  selectedId: null,
  diagnostics: [],
  hits: {},
  dirty: false,
  loading: false,
  saving: false,
  error: null,
  conflict: false,

  loadRuleSet: (ruleSet) =>
    set((state) => {
      const rules = ruleSet.rules.map((rule) => ({
        ...rule,
        matchers: [...rule.matchers],
        actions: [...rule.actions],
      }));
      const selectedId =
        state.selectedId && rules.some((rule) => rule.id === state.selectedId)
          ? state.selectedId
          : (rules[0]?.id ?? null);
      return {
        revision: ruleSet.revision,
        rules,
        selectedId,
        dirty: false,
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

  setDiagnostics: (diagnostics) => set({ diagnostics }),

  select: (id) => set({ selectedId: id }),

  addRule: (name) =>
    set((state) => {
      const rule = createRule(nextPriority(state.rules), name);
      return { rules: [...state.rules, rule], selectedId: rule.id, dirty: true };
    }),

  removeRule: (id) =>
    set((state) => {
      const rules = state.rules.filter((rule) => rule.id !== id);
      const selectedId =
        state.selectedId === id ? (rules[0]?.id ?? null) : state.selectedId;
      return { rules, selectedId, dirty: true };
    }),

  toggleRule: (id) =>
    set((state) => ({
      rules: mapRule(state.rules, id, (rule) => ({ ...rule, enabled: !rule.enabled })),
      dirty: true,
    })),

  renameRule: (id, name) =>
    set((state) => ({
      rules: mapRule(state.rules, id, (rule) => ({ ...rule, name })),
      dirty: true,
    })),

  moveRule: (id, direction) =>
    set((state) => {
      const index = state.rules.findIndex((rule) => rule.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.rules.length) {
        return state;
      }
      return { rules: reorderRules(state.rules, index, target), dirty: true };
    }),

  moveRuleTo: (id, targetId) =>
    set((state) => {
      const sourceIndex = state.rules.findIndex((rule) => rule.id === id);
      const targetIndex = state.rules.findIndex((rule) => rule.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return state;
      }
      return {
        rules: reorderRules(state.rules, sourceIndex, targetIndex),
        dirty: true,
      };
    }),

  addMatcher: (ruleId, type) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        matchers: [...rule.matchers, createMatcher(type)],
      })),
      dirty: true,
    })),

  updateMatcher: (ruleId, index, matcher) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        matchers: rule.matchers.map((item, position) =>
          position === index ? matcher : item),
      })),
      dirty: true,
    })),

  removeMatcher: (ruleId, index) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        matchers: rule.matchers.filter((_, position) => position !== index),
      })),
      dirty: true,
    })),

  addAction: (ruleId, type) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        actions: [...rule.actions, createAction(type)],
      })),
      dirty: true,
    })),

  updateAction: (ruleId, index, action) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        actions: rule.actions.map((item, position) =>
          position === index ? action : item),
      })),
      dirty: true,
    })),

  removeAction: (ruleId, index) =>
    set((state) => ({
      rules: mapRule(state.rules, ruleId, (rule) => ({
        ...rule,
        actions: rule.actions.filter((_, position) => position !== index),
      })),
      dirty: true,
    })),

  beginLoad: () => set({ loading: true, error: null }),

  loadFailed: (message) => set({ loading: false, error: message }),

  beginSave: () => set({ saving: true, error: null, conflict: false }),

  saveSucceeded: (revision) =>
    set({ revision, saving: false, dirty: false, conflict: false, error: null }),

  saveFailed: (message, conflict) =>
    set({ saving: false, error: message, conflict }),
}));
