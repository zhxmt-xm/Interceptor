import type {
  ProtocolDiagnostic,
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleSet,
} from '../../../shared/desktop-api';

/** Rule row chip kind；复用 RuleRow.module.css 的着色类。 */
export type ChipKind = 'map' | 'remote' | 'rewrite' | 'block' | 'throttle' | 'brk';

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
