import type {
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleMatcher,
  RuleMatcherType,
} from '../../../shared/desktop-api';
import type { SelectOption } from '../../components';
import type { ChipKind, RuleIssue, RulesState } from './interfaces';

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
    case 'throttle':
      return { kind: 'throttle', labelKey: 'rules.throttle' };
    case 'delay':
      return { kind: 'throttle', labelKey: 'rules.delay' };
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

/** 生成新规则唯一 id。 */
function createRuleId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `rule-${uuid}`;
}

/** 新建一条规则：默认一个 host 条件 + 一个请求 header 动作，字段留空待填，因此默认不启用。 */
export function createRule(priority: number, name = 'New rule'): RuleDefinition {
  return {
    id: createRuleId(),
    name,
    enabled: false,
    priority,
    matchers: [{ type: 'host', value: '', mode: 'contains' }],
    actions: [{ type: 'header', phase: 'request', op: 'set', name: '', value: '' }],
  };
}

/** 基于 Capture 请求完整 URL 创建一条 action 草稿；action 参数待填，默认不启用、不自动 Apply。 */
export function createRuleFromRequest(
  priority: number,
  name: string,
  url: string,
  actionType: RuleActionType,
): RuleDefinition {
  return {
    id: createRuleId(),
    name,
    enabled: false,
    priority,
    matchers: [{ type: 'url', value: url, mode: 'exact' }],
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
    case 'throttle':
      return { type: 'throttle', phase: 'response', bytesPerSecond: 51_200 };
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

/** 在规则集中替换某规则，返回新数组；未命中原样返回。 */
export function mapRule(
  rules: RuleDefinition[],
  id: string,
  update: (rule: RuleDefinition) => RuleDefinition,
): RuleDefinition[] {
  return rules.map((rule) => (rule.id === id ? update(rule) : rule));
}

/** 深拷贝规则数组（matchers/actions 也复制），用于保存已应用快照。 */
export function cloneRules(rules: readonly RuleDefinition[]): RuleDefinition[] {
  return rules.map((rule) => ({
    ...rule,
    matchers: [...rule.matchers],
    actions: [...rule.actions],
  }));
}

/** 内容级脏检查：草稿与已应用快照深度不等（改回原值即视为未改动）。 */
export function isRulesDirty(
  rules: readonly RuleDefinition[],
  applied: readonly RuleDefinition[],
): boolean {
  return JSON.stringify(rules) !== JSON.stringify(applied);
}

/** 计算新增规则的优先级：取现有最大值 + 10，空集从 100 起。 */
export function nextPriority(rules: RuleDefinition[]): number {
  if (rules.length === 0) {
    return 100;
  }
  return Math.max(...rules.map((rule) => rule.priority)) + 10;
}

/** Reorder the draft and reassign ascending priorities so list order equals execution order. */
export function reorderRules(
  rules: RuleDefinition[],
  sourceIndex: number,
  targetIndex: number,
): RuleDefinition[] {
  const reordered = [...rules];
  const [moved] = reordered.splice(sourceIndex, 1);
  if (!moved) {
    return rules;
  }
  reordered.splice(targetIndex, 0, moved);

  const existingPriorities = rules
    .map((rule) => rule.priority)
    .sort((left, right) => left - right);
  const prioritiesAreDistinct = existingPriorities.every(
    (priority, index) => index === 0 || priority > (existingPriorities[index - 1] ?? priority),
  );

  return reordered.map((rule, index) => ({
    ...rule,
    priority: prioritiesAreDistinct
      ? (existingPriorities[index] ?? (index + 1) * 10)
      : (index + 1) * 10,
  }));
}

/** 选中的规则草稿（无选中时为 null）。 */
export function selectedRule(state: RulesState): RuleDefinition | null {
  return state.rules.find((rule) => rule.id === state.selectedId) ?? null;
}

/** 已启用规则数。 */
export function enabledCount(rules: readonly RuleDefinition[]): number {
  return rules.reduce((total, rule) => total + (rule.enabled ? 1 : 0), 0);
}
