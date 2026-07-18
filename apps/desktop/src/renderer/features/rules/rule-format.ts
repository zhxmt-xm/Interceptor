import type { SelectOption } from '../../components';
import type {
  ProtocolDiagnostic,
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleMatcher,
  RuleMatcherType,
} from '../../../shared/desktop-api';

/** Rule row chip kind；复用 RuleRow.module.css 的着色类。 */
export type ChipKind = 'map' | 'remote' | 'rewrite' | 'block' | 'throttle' | 'brk';

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

/** 新建一条规则：默认一个 host 通配匹配 + 一个请求 header set 动作，保证 wire 校验通过。 */
export function createRule(priority: number, name = 'New rule'): RuleDefinition {
  return {
    id: createRuleId(),
    name,
    enabled: true,
    priority,
    matchers: [{ type: 'host', value: '', mode: 'wildcard' }],
    actions: [{ type: 'header', phase: 'request', op: 'set', name: '', value: '' }],
  };
}

/** 按类型创建默认 matcher（供“Add condition”）。 */
export function createMatcher(type: RuleMatcherType): RuleMatcher {
  switch (type) {
    case 'method':
      return { type: 'method', value: 'GET' };
    case 'host':
      return { type: 'host', value: '', mode: 'wildcard' };
    case 'path':
      return { type: 'path', value: '', mode: 'exact' };
    case 'url':
      return { type: 'url', value: '', mode: 'wildcard' };
    case 'query':
      return { type: 'query', key: '', mode: 'present', value: '' };
    case 'header':
      return { type: 'header', phase: 'request', name: '', mode: 'present', value: '' };
    case 'status':
      return { type: 'status', min: 200, max: 299 };
    case 'mime':
      return { type: 'mime', phase: 'response', value: '' };
    default:
      return { type: 'host', value: '', mode: 'wildcard' };
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

/** 从诊断 path（如 `rules[2].matchers[0]`）解析规则下标，供按规则聚合诊断。 */
export function ruleIndexFromPath(path: string | undefined): number | null {
  if (!path) {
    return null;
  }
  const match = /^rules\[(\d+)\]/.exec(path);
  return match ? Number(match[1]) : null;
}

/** 判断某规则（按下标）是否有语义诊断。 */
export function ruleHasDiagnostic(
  index: number,
  diagnostics: readonly ProtocolDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => ruleIndexFromPath(diagnostic.path) === index);
}

export const MATCHER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'method', label: 'Method' },
  { value: 'host', label: 'Host' },
  { value: 'path', label: 'Path' },
  { value: 'url', label: 'URL' },
  { value: 'query', label: 'Query' },
  { value: 'header', label: 'Header' },
  { value: 'status', label: 'Status' },
  { value: 'mime', label: 'MIME' },
];

export const STRING_MODE_OPTIONS: SelectOption[] = [
  { value: 'exact', label: 'equals' },
  { value: 'wildcard', label: 'wildcard' },
  { value: 'regex', label: 'regex' },
];

export const KEY_MODE_OPTIONS: SelectOption[] = [
  { value: 'present', label: 'present' },
  { value: 'exact', label: 'equals' },
  { value: 'regex', label: 'regex' },
];

export const PHASE_OPTIONS: SelectOption[] = [
  { value: 'request', label: 'request' },
  { value: 'response', label: 'response' },
];

export const HEADER_OP_OPTIONS: SelectOption[] = [
  { value: 'set', label: 'Set' },
  { value: 'append', label: 'Append' },
  { value: 'remove', label: 'Remove' },
];

export const QUERY_OP_OPTIONS: SelectOption[] = [
  { value: 'set', label: 'Set' },
  { value: 'remove', label: 'Remove' },
];

export const BODY_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'text', label: 'text' },
  { value: 'json', label: 'JSON' },
];

export const BLOCK_MODE_OPTIONS: SelectOption[] = [
  { value: 'reset', label: 'reset' },
  { value: 'close', label: 'close' },
];

export const SCHEME_OPTIONS: SelectOption[] = [
  { value: '', label: 'keep' },
  { value: 'http', label: 'http' },
  { value: 'https', label: 'https' },
];

export const TIMEOUT_POLICY_OPTIONS: SelectOption[] = [
  { value: 'continue', label: 'continue' },
  { value: 'drop', label: 'drop' },
];

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
