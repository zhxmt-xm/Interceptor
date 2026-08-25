import {
  collectLeaves,
  findLeaf,
  isFolder,
  parseImportedTree,
  replaceLeaf,
  type TreeImportResult,
  type TreeLeafParseResult,
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
  BreakpointScope,
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

/** 为规则行保留前两个chip，同时给overflow Tooltip提供完整有序列表。 */
export function deriveRuleRowChips(rule: RuleDefinition): {
  allChips: Array<[ChipKind, string]>;
  inlineChips: Array<[ChipKind, string]>;
  hasOverflow: boolean;
} {
  const allChips = deriveChips(rule);
  return {
    allChips,
    inlineChips: allChips.slice(0, 2),
    hasOverflow: allChips.length > 2,
  };
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

/**
 * 从 Capture 请求创建断点规则：同一 exchange 的 request 与 response 各断一次，创建即启用。
 *
 * 不做“命中一次后自动失效”：那会是一个既看不到也改不回来的隐藏状态，
 * 停用入口就是 manager 里的开关。
 */
export function createBreakpointRule(
  name: string,
  url: string,
  scope: BreakpointScope,
): RuleDefinition {
  return {
    kind: 'rule',
    id: createNodeId('rule'),
    name,
    enabled: true,
    priority: 0,
    matchers: [breakpointMatcher(url, scope)],
    actions: [
      {
        type: 'breakpoint',
        phase: 'request',
      },
      {
        type: 'breakpoint',
        phase: 'response',
      },
    ],
  };
}

/**
 * 把请求 URL 折算成选定粒度的 matcher。
 *
 * path prefix 用 `contains`：完整 URL 必然以 `scheme://host` 开头，因此对完整 URL 做
 * contains 与 prefix 等价，不必为此给协议新增一种匹配模式。
 */
function breakpointMatcher(url: string, scope: BreakpointScope): RuleMatcher {
  if (scope === 'host') {
    return { type: 'host', value: hostOf(url), mode: 'exact' };
  }
  return {
    type: 'url',
    value: toEndpointUrl(url),
    mode: scope === 'endpoint' ? 'exact' : 'contains',
  };
}

/** 取 URL 的 host（含端口）；无法解析时退回原串。 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** 按类型创建默认 matcher（供“Add condition”）。 */export function createMatcher(type: RuleMatcherType): RuleMatcher {
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
      return {
        type: 'breakpoint',
        phase: 'request',
      };
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

/** RuleSet只有全部叶子规则都填完整时才允许写入Core。 */
export function isRuleSetComplete(nodes: readonly RuleNode[]): boolean {
  return collectLeaves(nodes).every(isRuleComplete);
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

/** 右侧编辑器当前打开的规则草稿（未打开时为 null）。 */
export function selectedRule(state: RulesState): RuleDefinition | null {
  return state.openRuleId ? findLeaf(state.nodes, state.openRuleId) : null;
}

/** 已启用规则数。 */
export function enabledCount(nodes: readonly RuleNode[]): number {
  return collectLeaves(nodes).reduce(
    (total, rule) => total + (rule.enabled ? 1 : 0),
    0,
  );
}

const IMPORT_MATCHER_TYPES = new Set<RuleMatcherType>([
  'method', 'host', 'path', 'url', 'query', 'header', 'status', 'mime',
]);

const IMPORT_ACTION_TYPES = new Set<RuleActionType>([
  'header', 'query', 'body', 'synthetic', 'map-local', 'map-remote',
  'block', 'status', 'delay', 'breakpoint',
]);

const IMPORT_PHASES = new Set(['request', 'response']);
const IMPORT_MATCH_MODES = new Set(['contains', 'exact', 'regex']);

function isImportRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number' && Number.isFinite(value);
}

function hasImportMatcherFields(value: unknown): value is RuleMatcher {
  if (!isImportRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'method':
      return typeof value.value === 'string';
    case 'host':
    case 'path':
    case 'url':
      return typeof value.value === 'string'
        && IMPORT_MATCH_MODES.has(value.mode as string)
        && isOptionalBoolean(value.caseSensitive);
    case 'query':
      return typeof value.key === 'string'
        && IMPORT_MATCH_MODES.has(value.mode as string)
        && isOptionalString(value.value)
        && isOptionalBoolean(value.caseSensitive);
    case 'header':
      return IMPORT_PHASES.has(value.phase as string)
        && typeof value.name === 'string'
        && IMPORT_MATCH_MODES.has(value.mode as string)
        && isOptionalString(value.value)
        && isOptionalBoolean(value.caseSensitive);
    case 'status':
      return typeof value.min === 'number' && Number.isFinite(value.min)
        && typeof value.max === 'number' && Number.isFinite(value.max);
    case 'mime':
      return IMPORT_PHASES.has(value.phase as string)
        && typeof value.value === 'string';
    default:
      return false;
  }
}

function hasImportHeaderPairs(value: unknown): boolean {
  return Array.isArray(value) && value.every((pair) =>
    isImportRecord(pair)
      && typeof pair.name === 'string'
      && typeof pair.value === 'string');
}

function hasImportActionFields(value: unknown): value is RuleAction {
  if (!isImportRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'header':
      return IMPORT_PHASES.has(value.phase as string)
        && new Set(['set', 'append', 'remove']).has(value.op as string)
        && typeof value.name === 'string'
        && isOptionalString(value.value);
    case 'query':
      return new Set(['set', 'remove']).has(value.op as string)
        && typeof value.name === 'string'
        && isOptionalString(value.value);
    case 'body':
      return IMPORT_PHASES.has(value.phase as string)
        && new Set(['text', 'json']).has(value.format as string)
        && typeof value.content === 'string';
    case 'synthetic':
      return typeof value.statusCode === 'number' && Number.isFinite(value.statusCode)
        && (value.headers === undefined || hasImportHeaderPairs(value.headers))
        && isOptionalString(value.body);
    case 'map-local':
      return typeof value.path === 'string';
    case 'map-remote':
      return (value.scheme === undefined || new Set(['http', 'https']).has(value.scheme as string))
        && isOptionalString(value.host)
        && isOptionalNumber(value.port)
        && isOptionalString(value.path);
    case 'block':
      return new Set(['reset', 'close']).has(value.mode as string);
    case 'status':
      return typeof value.statusCode === 'number' && Number.isFinite(value.statusCode);
    case 'delay':
      return IMPORT_PHASES.has(value.phase as string)
        && typeof value.ms === 'number' && Number.isFinite(value.ms);
    case 'breakpoint':
      return IMPORT_PHASES.has(value.phase as string);
    default:
      return false;
  }
}

/** 校验导入文件里的一条规则；结构遍历由 `parseImportedTree` 负责，这里只判断领域字段。 */
function parseImportedRule(
  raw: Record<string, unknown>,
): TreeLeafParseResult<RuleDefinition> {
  if (raw.kind !== 'rule') {
    return { ok: false, reason: 'unknown-kind' };
  }
  if (typeof raw.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid-enabled' };
  }
  if (!Array.isArray(raw.matchers)) {
    return { ok: false, reason: 'invalid-matchers' };
  }
  if (!Array.isArray(raw.actions)) {
    return { ok: false, reason: 'invalid-actions' };
  }
  if (raw.matchers.some((matcher) =>
    !isImportRecord(matcher) || !IMPORT_MATCHER_TYPES.has(matcher.type as RuleMatcherType))) {
    return { ok: false, reason: 'unknown-matcher-type' };
  }
  if (!raw.matchers.every(hasImportMatcherFields)) {
    return { ok: false, reason: 'invalid-matcher-fields' };
  }
  if (raw.actions.some((action) =>
    !isImportRecord(action) || !IMPORT_ACTION_TYPES.has(action.type as RuleActionType))) {
    return { ok: false, reason: 'unknown-action-type' };
  }
  if (!raw.actions.every(hasImportActionFields)) {
    return { ok: false, reason: 'invalid-action-fields' };
  }
  const rule: RuleDefinition = {
    kind: 'rule',
    id: String(raw.id ?? ''),
    name: raw.name as string,
    enabled: raw.enabled,
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    matchers: raw.matchers,
    actions: raw.actions,
  };
  return isRuleComplete(rule)
    ? { ok: true, leaf: rule }
    : { ok: false, reason: 'incomplete-rule' };
}

/** 解析导入文件里的规则树；priority 在追加进当前树后由 `normalizePriorities` 统一重排。 */
export function parseImportedRules(
  value: unknown,
): TreeImportResult<RuleDefinition> {
  return parseImportedTree<RuleDefinition>(
    value,
    parseImportedRule,
    () => createNodeId('rule'),
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
