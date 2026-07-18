import { create } from 'zustand';

import type {
  ProtocolDiagnostic,
  RuleAction,
  RuleDefinition,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleActionType,
  RuleSet,
} from '../../../shared/desktop-api';
import { createAction, createMatcher, createRule } from './rule-format';

/**
 * Rules workspace 视图状态：只持有可编辑的规则草稿（revision + rules）、命中计数、
 * 校验诊断与保存/加载状态。所有编辑产出合法的规则模型对象，经 rules.replace 乐观并发
 * 落库。header/body 值均为普通字段，不涉及全局捕获状态。
 */
export interface RulesState {
  /** 已持久化的规则集 revision，用于乐观并发（rules.replace 的 expectedRevision）。 */
  revision: number;
  /** 可编辑的规则草稿（本地副本）。 */
  rules: RuleDefinition[];
  selectedId: string | null;
  /** 语义诊断（重复 id / regex 可编译 / status 区间 / JSON body / map 穿越）。 */
  diagnostics: ProtocolDiagnostic[];
  /** ruleId → 累计命中次数。 */
  hits: Record<string, number>;
  /** 草稿相对已保存快照是否有改动。 */
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** 上次保存因 revision 冲突失败（他处已修改），需重新加载。 */
  conflict: boolean;

  loadRuleSet(ruleSet: RuleSet): void;
  setHits(counts: RuleHitCount[]): void;
  setDiagnostics(diagnostics: ProtocolDiagnostic[]): void;
  select(id: string | null): void;

  addRule(name?: string): void;
  removeRule(id: string): void;
  toggleRule(id: string): void;
  renameRule(id: string, name: string): void;
  moveRule(id: string, direction: -1 | 1): void;

  addMatcher(ruleId: string, type: RuleMatcherType): void;
  updateMatcher(ruleId: string, index: number, matcher: RuleMatcher): void;
  removeMatcher(ruleId: string, index: number): void;

  addAction(ruleId: string, type: RuleActionType): void;
  updateAction(ruleId: string, index: number, action: RuleAction): void;
  removeAction(ruleId: string, index: number): void;

  beginLoad(): void;
  loadFailed(message: string): void;
  beginSave(): void;
  saveSucceeded(revision: number): void;
  saveFailed(message: string, conflict: boolean): void;
}

/** 在规则集中替换某规则，返回新数组；未命中原样返回。 */
function mapRule(
  rules: RuleDefinition[],
  id: string,
  update: (rule: RuleDefinition) => RuleDefinition,
): RuleDefinition[] {
  return rules.map((rule) => (rule.id === id ? update(rule) : rule));
}

function nextPriority(rules: RuleDefinition[]): number {
  if (rules.length === 0) {
    return 100;
  }
  return Math.max(...rules.map((rule) => rule.priority)) + 10;
}

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
      const rules = [...state.rules];
      const moved = rules[index];
      const other = rules[target];
      if (!moved || !other) {
        return state;
      }
      rules[index] = other;
      rules[target] = moved;
      return { rules, dirty: true };
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

/** 选中的规则草稿（无选中时为 null）。 */
export function selectedRule(state: RulesState): RuleDefinition | null {
  return state.rules.find((rule) => rule.id === state.selectedId) ?? null;
}

/** 已启用规则数。 */
export function enabledCount(rules: readonly RuleDefinition[]): number {
  return rules.reduce((total, rule) => total + (rule.enabled ? 1 : 0), 0);
}
