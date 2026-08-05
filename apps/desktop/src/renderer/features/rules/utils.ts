import {
  collectLeaves,
  findLeaf,
  isFolder,
  replaceLeaf,
} from '@interceptor/core-protocol';

import type {
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleFolder,
  RuleMatcher,
  RuleMatcherType,
  RuleNode,
} from '../../../shared/desktop-api';
import type { SelectOption } from '../../components';
import type {
  ChipKind,
  RuleIssue,
  RulesState,
} from './interfaces';

/** 把一个 action 映射为规则行 chip（着色 + 标签）。 */
export function actionChip(type: RuleActionType): { kind: ChipKind; labelKey: string } {
  switch (type) {
    case 'map-local':
      return { kind: 'map', labelKey: 'rules.mapLocal' };
    case 'map-remote':
      return { kind: 'remote', labelKey: 'rules.mapRemote' };
    case 'block':
      return { kind: 'block', labelKey: 'rules.block' };
    case 'synthetic':
      return { kind: 'block', labelKey: 'rules.synthetic' };
    case 'delay':
      return { kind: 'flow', labelKey: 'rules.delay' };
    case 'breakpoint':
      return { kind: 'brk', labelKey: 'rules.breakpoint' };
    case 'header':
    case 'query':
    case 'body':
    case 'status':
    default:
      return { kind: 'rewrite', labelKey: 'rules.rewrite' };
  }
}

/** 从规则的 actions 派生去重后的 chip 列表（按标签去重，保持声明顺序）。 */
export function deriveChips(rule: RuleDefinition): Array<[ChipKind, string]> {
  const seen = new Set<string>();
  const chips: Array<[ChipKind, string]> = [];
  for (const action of rule.actions) {
    const chip = actionChip(action.type);
    if (!seen.has(chip.labelKey)) {
      seen.add(chip.labelKey);
      chips.push([chip.kind, chip.labelKey]);
    }
  }
  return chips;
}

/** 从规则的 matchers 派生人类可读的匹配摘要（host · path 等）。 */
export function matchSummary(rule: RuleDefinition, emptySummary?: string): string {
  const parts: string[] = [];
  const host = rule.matchers.find((matcher) => matcher.type === 'host');
  const path = rule.matchers.find((matcher) => matcher.type === 'path');
  const url = rule.matchers.find((matcher) => matcher.type === 'url');
  const method = rule.matchers.find((matcher) => matcher.type === 'method');
  const status = rule.matchers.find((matcher) => matcher.type === 'status');

  if (host && host.type === 'host' && host.value) {
    parts.push(host.value);
  }
  if (url && url.type === 'url' && url.value) {
    parts.push(url.value);
  }
  if (path && path.type === 'path' && path.value) {
    parts.push(path.value);
  }
  if (method && method.type === 'method' && method.value) {
    parts.push(method.value.toUpperCase());
  }
  if (status && status.type === 'status') {
    parts.push(`${status.min}–${status.max}`);
  }
  if (parts.length === 0) {
    return emptySummary ?? `${rule.matchers.length} condition${rule.matchers.length === 1 ? '' : 's'}`;
  }
  return parts.join(' · ');
}

/** 生成规则树节点的唯一 id。 */
function createNodeId(prefix: 'rule' | 'dir'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

/** 新建一个空目录。 */
export function createFolder(name: string): RuleFolder {
  return { kind: 'folder', id: createNodeId('dir'), name, children: [] };
}

/** 新建一条规则：默认一个 host 条件 + 一个请求 header 动作，字段留空待填，因此默认不启用。 */
export function createRule(name = 'New rule'): RuleDefinition {
  return {
    kind: 'rule',
    id: createNodeId('rule'),
    name,
    enabled: false,
    priority: 0,
    matchers: [{ type: 'host', value: '', mode: 'contains' }],
    actions: [{ type: 'header', phase: 'request', op: 'set', name: '', value: '' }],
  };
}

/**
 * 去掉 URL 的 query 与 fragment，只保留 scheme + host + path。
 *
 * 右键建规则的意图是“针对这个接口”，而不是“针对这次请求”：query 里常带
 * access_token / signature / 缓存戳，写进 `workspace.sqlite` 既是秘密明文落盘，
 * 也会让 exact 规则在下一次请求（换了 token）后永远不再命中。
 */
function toEndpointUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : url.slice(0, cut);
  }
}

/** 基于 Capture 请求创建一条 action 草稿：action 参数待填，默认不启用、不自动 Apply。 */
export function createRuleFromRequest(
  name: string,
  url: string,
  actionType: RuleActionType,
): RuleDefinition {
  return {
    kind: 'rule',
    id: createNodeId('rule'),
    name,
    enabled: false,
    priority: 0,
    matchers: [{ type: 'url', value: toEndpointUrl(url), mode: 'exact' }],
    actions: [createAction(actionType)],
  };
}

/** 按类型创建默认 matcher（供“Add condition”）。 */
export function createMatcher(type: RuleMatcherType): RuleMatcher {
  switch (type) {
    case 'method':
      return { type: 'method', value: 'GET' };
    case 'host':
      return { type: 'host', value: '', mode: 'contains' };
    case 'path':
      return { type: 'path', value: '', mode: 'contains' };
    case 'url':
      return { type: 'url', value: '', mode: 'contains' };
    case 'query':
      return { type: 'query', key: '', mode: 'contains', value: '' };
    case 'header':
      return { type: 'header', phase: 'request', name: '', mode: 'contains', value: '' };
    case 'status':
      return { type: 'status', min: 200, max: 299 };
    case 'mime':
      return { type: 'mime', phase: 'response', value: '' };
    default:
      return { type: 'host', value: '', mode: 'contains' };
  }
}

/** 按类型创建默认 action（供“Add action”）。 */
export function createAction(type: RuleActionType): RuleAction {
  switch (type) {
    case 'header':
      return { type: 'header', phase: 'request', op: 'set', name: '', value: '' };
    case 'query':
      return { type: 'query', op: 'set', name: '', value: '' };
    case 'body':
      return { type: 'body', phase: 'response', format: 'json', content: '{}' };
    case 'synthetic':
      return { type: 'synthetic', statusCode: 200, headers: [], body: '' };
    case 'map-local':
      return { type: 'map-local', path: '' };
    case 'map-remote':
      return { type: 'map-remote', host: '' };
    case 'block':
      return { type: 'block', mode: 'reset' };
    case 'status':
      return { type: 'status', statusCode: 200 };
    case 'delay':
      return { type: 'delay', phase: 'response', ms: 1_000 };
    case 'breakpoint':
      return { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' };
    default:
      return { type: 'header', phase: 'request', op: 'set', name: '', value: '' };
  }
}

/** 判断 matcher 是否还有必填字段为空；为空的条件会退化成“匹配一切”。 */
function matcherIsIncomplete(matcher: RuleMatcher): boolean {
  switch (matcher.type) {
    case 'method':
    case 'host':
    case 'path':
    case 'url':
    case 'mime':
      return matcher.value.trim() === '';
    case 'query':
      return matcher.key.trim() === '';
    case 'header':
      return matcher.name.trim() === '';
    case 'status':
      return false;
    default:
      return false;
  }
}

/** 判断 action 是否还有必填字段为空；为空的动作要么无效要么行为不可预期。 */
function actionIsIncomplete(action: RuleAction): boolean {
  switch (action.type) {
    case 'header':
    case 'query':
      return action.name.trim() === '';
    case 'map-local':
      return action.path.trim() === '';
    case 'map-remote':
      return (
        action.scheme === undefined
        && (action.host ?? '').trim() === ''
        && action.port === undefined
        && (action.path ?? '').trim() === ''
      );
    default:
      return false;
  }
}

/**
 * 列出让规则无法安全启用的空字段；空数组表示这条规则可以启用。
 *
 * 只检查“填没填”，不做正则可编译性之类的深度语义判断：真实流量安全由
 * “不完整的规则不能启用、Core 只执行启用的规则”这条边界保证。
 */
export function ruleIssues(rule: RuleDefinition): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (rule.matchers.length === 0) {
    issues.push({ messageKey: 'rules.issueNoConditions' });
  }
  if (rule.actions.length === 0) {
    issues.push({ messageKey: 'rules.issueNoActions' });
  }
  for (const [index, matcher] of rule.matchers.entries()) {
    if (matcherIsIncomplete(matcher)) {
      issues.push({ messageKey: 'rules.issueEmptyCondition', index: index + 1 });
    }
  }
  for (const [index, action] of rule.actions.entries()) {
    if (actionIsIncomplete(action)) {
      issues.push({ messageKey: 'rules.issueEmptyAction', index: index + 1 });
    }
  }
  return issues;
}

/** 规则是否填写完整到可以启用。 */
export function isRuleComplete(rule: RuleDefinition): boolean {
  return ruleIssues(rule).length === 0;
}

/** Translate option labels without changing the stable values stored in rule models. */
export function localizeOptions(
  options: SelectOption[],
  keyPrefix: string,
  translate: (key: string) => string,
): SelectOption[] {
  return options.map((option) => ({
    ...option,
    label: translate(`${keyPrefix}.${option.value || 'keep'}`),
  }));
}

/** 在规则树中替换某条规则，返回新树；未命中原样返回。 */
export function mapRule(
  nodes: readonly RuleNode[],
  id: string,
  update: (rule: RuleDefinition) => RuleDefinition,
): RuleNode[] {
  const rule = findLeaf(nodes, id);
  return rule ? replaceLeaf(nodes, update(rule)) : [...nodes];
}

/** 深拷贝规则树（matchers/actions 也复制），用于保存已应用快照。 */
export function cloneNodes(nodes: readonly RuleNode[]): RuleNode[] {
  return nodes.map((node) =>
    isFolder(node)
      ? { ...node, children: cloneNodes(node.children) }
      : { ...node, matchers: [...node.matchers], actions: [...node.actions] },
  );
}

/** 内容级脏检查：草稿与已应用快照深度不等（改回原值即视为未改动）。 */
export function isRulesDirty(
  nodes: readonly RuleNode[],
  applied: readonly RuleNode[],
): boolean {
  return JSON.stringify(nodes) !== JSON.stringify(applied);
}

/**
 * 按深度优先顺序重排 priority，使 Core 的执行顺序与列表显示顺序一致。
 * 每次改变树结构（新建、删除、拖拽）之后调用。
 */
export function normalizePriorities(nodes: readonly RuleNode[]): RuleNode[] {
  let order = 0;
  const walk = (list: readonly RuleNode[]): RuleNode[] =>
    list.map((node) => {
      if (isFolder(node)) {
        return { ...node, children: walk(node.children) };
      }
      order += 1;
      return { ...node, priority: order * 10 };
    });
  return walk(nodes);
}

/** 选中的规则草稿（无选中时为 null）。 */
export function selectedRule(state: RulesState): RuleDefinition | null {
  return state.selectedId ? findLeaf(state.nodes, state.selectedId) : null;
}

/** 已启用规则数。 */
export function enabledCount(nodes: readonly RuleNode[]): number {
  return collectLeaves(nodes).reduce(
    (total, rule) => total + (rule.enabled ? 1 : 0),
    0,
  );
}

/** 受控数字输入的解析：非法输入回退到给定默认值。 */
export function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 命中次数超过一千按 k 缩写，避免规则行被数字撑开。 */
export function formatHits(count: number, locale = 'en'): string {  if (count >= 1_000) {
    const scaled = count / 1_000;
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: scaled >= 10 ? 0 : 1,
    }).format(scaled)}k`;
  }
  return new Intl.NumberFormat(locale).format(count);
}
