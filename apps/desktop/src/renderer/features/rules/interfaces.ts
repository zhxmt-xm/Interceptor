import type {
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleSet,
} from '../../../shared/desktop-api';

/** Rule row chip kind；复用 RuleRow.module.css 的着色类。 */
export type ChipKind = 'map' | 'remote' | 'rewrite' | 'block' | 'flow' | 'brk';

/** 一条规则里还没填完的地方；纯 Renderer 本地概念，不进 wire。 */
export interface RuleIssue {
  /** 描述缺什么的 i18n key。 */
  messageKey: string;
  /** 条件/动作序号（从 1 起），供文案插值。 */
  index?: number;
}

/**
 * Rules workspace 视图状态：只持有可编辑的规则草稿（revision + rules）、命中计数与
 * 保存/加载状态。规则完整性在本地纯函数即时派生（`ruleIssues`），不入状态、也不
 * 往返 Core；不完整的规则无法启用，因此永远不会作用于真实流量。
 */
export interface RulesState {
  /** 已持久化的规则集 revision，用于乐观并发（rules.replace 的 expectedRevision）。 */
  revision: number;
  /** 是否已从 Core 载入过规则集；用于跨 feature 创建草稿前去重加载。 */
  initialized: boolean;
  /** 可编辑的规则草稿（本地副本）。 */
  rules: RuleDefinition[];
  selectedId: string | null;
  /** ruleId → 累计命中次数。 */
  hits: Record<string, number>;
  /** 最近一次成功应用或加载的规则快照，用于内容级脏检查（改回原值即视为未改动）。 */
  applied: RuleDefinition[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** 上次保存因 revision 冲突失败（他处已修改），需重新加载。 */
  conflict: boolean;

  loadRuleSet(ruleSet: RuleSet): void;
  setHits(counts: RuleHitCount[]): void;
  select(id: string | null): void;

  addRule(name?: string): void;
  addRuleDraft(rule: RuleDefinition): void;
  removeRule(id: string): void;
  /** 切换启用；字段未填完的规则不允许被启用，已启用的任何时候都可关闭。 */
  toggleRule(id: string): void;
  renameRule(id: string, name: string): void;
  moveRule(id: string, direction: -1 | 1): void;
  moveRuleTo(id: string, targetId: string): void;

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

/** 匹配方式（与 StringMatchMode / KeyMatchMode 共用值域）。 */
export type MatchToggleMode = 'contains' | 'exact' | 'regex';
