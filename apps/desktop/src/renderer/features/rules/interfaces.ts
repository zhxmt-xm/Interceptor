import type { TreeInsertPosition } from '@interceptor/core-protocol';

import type {
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleNode,
  RuleSet,
} from '../../../shared/desktop-api';

/** 目录操作菜单的锚点：菜单挂在触发它的目录行上。 */
export interface FolderMenuAnchor {
  folderId: string;
  top: number;
  left: number;
}

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
 * Rules workspace 视图状态：只持有可编辑的规则树草稿（revision + nodes）、命中计数与
 * 保存/加载状态。规则完整性在本地纯函数即时派生（`ruleIssues`），不入状态、也不
 * 往返 Core；不完整的规则无法启用，因此永远不会作用于真实流量。
 *
 * 目录只组织规则，不参与匹配；执行顺序由 priority 决定，而 priority 在每次结构变更后
 * 按树的深度优先顺序重排，因此「看到的顺序」始终等于「执行顺序」。
 */
export interface RulesState {
  /** 已持久化的规则集 revision，用于乐观并发（rules.replace 的 expectedRevision）。 */
  revision: number;
  /** 是否已从 Core 载入过规则集；用于跨 feature 创建草稿前去重加载。 */
  initialized: boolean;
  /** 可编辑的规则树草稿（本地副本）。 */
  nodes: RuleNode[];
  selectedId: string | null;
  /** 展开的目录 ID；纯视图状态，不进 wire。 */
  expandedFolders: string[];
  /** 正在行内重命名的节点。 */
  renamingNodeId: string | null;
  /** 打开中的目录操作菜单及其锚点。 */
  folderMenu: FolderMenuAnchor | null;
  /** ruleId → 累计命中次数。 */
  hits: Record<string, number>;
  /** 最近一次成功应用或加载的规则快照，用于内容级脏检查（改回原值即视为未改动）。 */
  applied: RuleNode[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** 上次保存因 revision 冲突失败（他处已修改），需重新加载。 */
  conflict: boolean;

  loadRuleSet(ruleSet: RuleSet): void;
  setHits(counts: RuleHitCount[]): void;
  select(id: string | null): void;
  toggleFolder(id: string): void;
  beginRename(id: string | null): void;
  setFolderMenu(menu: FolderMenuAnchor | null): void;

  addRule(name?: string, parentId?: string | null): void;
  addRuleDraft(rule: RuleDefinition): void;
  addFolder(name: string, parentId?: string | null): void;
  /** 删除任意节点；目录连同其子树一起删除。 */
  removeNode(id: string): void;
  renameNode(id: string, name: string): void;
  /** 拖拽落点已定后的移动；超过 3 级上限时保持原样。 */
  moveNode(id: string, position: TreeInsertPosition): void;
  /** 切换启用；字段未填完的规则不允许被启用，已启用的任何时候都可关闭。 */
  toggleRule(id: string): void;

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
