import type { TreeImportSkip, TreeInsertPosition } from '@interceptor/core-protocol';

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

/** Rule row chip kind；复用 RuleRow.module.css 的着色类。 */
export type ChipKind = 'map' | 'remote' | 'rewrite' | 'block' | 'flow' | 'brk';

/**
 * 从 Capture 行快速创建断点时的匹配粒度。
 * 更细的条件（method 限定、多条件 AND、超时策略）走 Rules 编辑器，不在这里展开。
 */
export type BreakpointScope = 'endpoint' | 'path-prefix' | 'host';

/** 一条规则里还没填完的地方；纯 Renderer 本地概念，不进 wire。 */
export interface RuleIssue {
  /** 描述缺什么的 i18n key。 */
  messageKey: string;
  /** 条件/动作序号（从 1 起），供文案插值。 */
  index?: number;
}

/**
 * 导入预览：确认 Dialog 展示的全部依据，写入树之前产生。
 *
 * 失败只有文件级一种，此时一个节点都定位不到；节点级失败在 `skipped` 里逐项列出。
 */
export type RuleImportPreview =
  | {
      ok: true;
      fileName: string;
      nodes: readonly RuleNode[];
      folderCount: number;
      leafCount: number;
      enabledCount: number;
      skipped: readonly TreeImportSkip[];
    }
  | { ok: false; reason: string };

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
  /**
   * 右侧编辑器正在打开的规则。与 `selectedId` 正交：选中目录只改树上的选择，
   * 右侧保持当前规则，否则点一下目录就丢掉正在编辑的内容。
   */
  openRuleId: string | null;
  /** 展开的目录 ID；纯视图状态，不进 wire。 */
  expandedFolders: string[];
  /** 正在行内重命名的节点。 */
  renamingNodeId: string | null;
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
  /** 幂等展开目录，供拖拽悬停自动展开。 */
  expandFolder(id: string): void;
  beginRename(id: string | null): void;

  addRule(name?: string, parentId?: string | null): void;
  addRuleDraft(rule: RuleDefinition): void;
  /** 导入写入 Core 成功后，原子更新草稿、已应用快照与 revision。 */
  importSucceeded(nodes: readonly RuleNode[], revision: number): void;
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
