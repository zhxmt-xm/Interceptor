/**
 * M7/T7.2 Matcher 编译器：把可序列化的 RuleMatcher 编译为纯匹配判定函数。
 *
 * 编译产物只在 Core 内存，不持久化。匹配在 Mockttp passthrough 的 beforeRequestHead
 * （请求阶段）/beforeResponseHead（响应阶段）回调内对每个 Exchange 求值；同一规则的
 * 多个 matcher 为 AND 关系。字符串匹配的大小写策略遵循 HTTP 语义：method/host/
 * header 名/MIME 大小写不敏感，path/url/header 值/query 大小写敏感。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  BreakpointEdit,
  KeyMatchMode,
  RuleDefinition,
  RuleHeaderPair,
  RuleAction,
  RuleMatcher,
  StringMatchMode,
} from '@interceptor/core-protocol';

import type {
  BreakpointSnapshot,
  BreakpointState,
  BreakpointTimeoutPolicy,
  CompiledMatcher,
  HeaderBag,
  MutableRequestState,
  MutableResponseState,
  RuleHeaderEffect,
} from '../interfaces';

/**
 * 把单个 RuleMatcher 编译为判定函数；正则在编译期预构建，非法正则退化为恒不匹配。
 * 需要响应字段的 matcher（status / response header / response mime）在请求阶段
 * （无 response）返回 false，由引擎按阶段调度。
 */
export function compileMatcher(matcher: RuleMatcher): CompiledMatcher {
  switch (matcher.type) {
    case 'method': {
      const expected = matcher.value.toUpperCase();
      return (ctx) => ctx.request.method.toUpperCase() === expected;
    }
    case 'host': {
      const test = compileStringMatch(matcher.mode, matcher.value, matcher.caseSensitive ?? false);
      return (ctx) => test(ctx.request.host);
    }
    case 'path': {
      const test = compileStringMatch(matcher.mode, matcher.value, matcher.caseSensitive ?? false);
      return (ctx) => test(ctx.request.path);
    }
    case 'url': {
      const test = compileStringMatch(matcher.mode, matcher.value, matcher.caseSensitive ?? false);
      return (ctx) => test(ctx.request.url);
    }
    case 'query': {
      const test = compileKeyMatch(matcher.mode, matcher.value, matcher.caseSensitive ?? false);
      return (ctx) => test(ctx.request.query.getAll(matcher.key));
    }
    case 'header': {
      const test = compileKeyMatch(matcher.mode, matcher.value, matcher.caseSensitive ?? false);
      const name = matcher.name;
      const phase = matcher.phase;
      return (ctx) => {
        const bag =
          phase === 'response' ? ctx.response?.headers : ctx.request.headers;
        return bag !== undefined && test(headerValues(bag, name));
      };
    }
    case 'status': {
      const { min, max } = matcher;
      return (ctx) =>
        ctx.response !== undefined &&
        ctx.response.statusCode >= min &&
        ctx.response.statusCode <= max;
    }
    case 'mime': {
      const phase = matcher.phase;
      const test = compileMimeMatch(matcher.value);
      return (ctx) => {
        const mime =
          phase === 'response' ? ctx.response?.mime : ctx.request.mime;
        return mime !== undefined && test(mime);
      };
    }
    default: {
      const exhaustive: never = matcher;
      throw new Error(`Unknown matcher: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * 把一条规则的 matcher 数组编译为 AND 组合判定。
 * 没有任何条件的规则视为“还没配好”而恒不匹配，不能退化成匹配全部流量。
 */
export function compileRuleMatchers(
  matchers: readonly RuleMatcher[],
): CompiledMatcher {
  if (matchers.length === 0) {
    return () => false;
  }
  const compiled = matchers.map(compileMatcher);
  return (ctx) => compiled.every((test) => test(ctx));
}

/**
 * 将一次真实生效的 header action 展开成 Inspector 事件：set 先替代旧值再设置新值，
 * append 只标新增值，remove 标记全部被删除旧值。
 */
export function buildHeaderEffects(
  ruleId: string,
  action: Extract<RuleAction, { type: 'header' }>,
  previousValues: readonly string[],
): RuleHeaderEffect[] {
  switch (action.op) {
    case 'set':
      return [
        ...previousValues.map((value) => ({
          ruleId,
          phase: action.phase,
          effect: 'replace' as const,
          name: action.name,
          value,
        })),
        ...(action.value === undefined
          ? []
          : [{
              ruleId,
              phase: action.phase,
              effect: 'set' as const,
              name: action.name,
              value: action.value,
            }]),
      ];
    case 'append':
      return action.value === undefined
        ? []
        : [{
          ruleId,
            phase: action.phase,
            effect: 'append',
            name: action.name,
            value: action.value,
          }];
    case 'remove':
      return previousValues.map((value) => ({
        ruleId,
        phase: action.phase,
        effect: 'remove',
        name: action.name,
        value,
      }));
    default: {
      const exhaustive: never = action.op;
      throw new Error(`Unknown header operation: ${String(exhaustive)}`);
    }
  }
}

function compileStringMatch(
  mode: StringMatchMode,
  pattern: string,
  caseSensitive: boolean,
): (value: string) => boolean {
  // 未填写的值意味着“这个条件还没配好”：必须恒不匹配。否则 contains 的
  // `value.includes('')` 与 regex 的空模式都恒真，刚新建、还没输入 host 的规则
  // 会直接命中全部真实流量。
  if (pattern === '') {
    return () => false;
  }
  switch (mode) {
    case 'contains': {
      if (caseSensitive) {
        return (value) => value.includes(pattern);
      }
      const lower = pattern.toLowerCase();
      return (value) => value.toLowerCase().includes(lower);
    }
    case 'exact': {
      if (caseSensitive) {
        return (value) => value === pattern;
      }
      const lower = pattern.toLowerCase();
      return (value) => value.toLowerCase() === lower;
    }
    case 'regex': {
      const regex = safeRegExp(pattern, caseSensitive);
      return regex ? (value) => regex.test(value) : () => false;
    }
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown string match mode: ${String(exhaustive)}`);
    }
  }
}

function compileKeyMatch(
  mode: KeyMatchMode,
  expected: string | undefined,
  caseSensitive: boolean,
): (values: string[]) => boolean {
  const needle = expected ?? '';
  switch (mode) {
    case 'contains': {
      if (caseSensitive) {
        return (values) => values.some((value) => value.includes(needle));
      }
      const lower = needle.toLowerCase();
      return (values) => values.some((value) => value.toLowerCase().includes(lower));
    }
    case 'exact': {
      if (caseSensitive) {
        return (values) => values.includes(needle);
      }
      const lower = needle.toLowerCase();
      return (values) => values.some((value) => value.toLowerCase() === lower);
    }
    case 'regex': {
      const regex = safeRegExp(needle, caseSensitive);
      return regex
        ? (values) => values.some((value) => regex.test(value))
        : () => false;
    }
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown key match mode: ${String(exhaustive)}`);
    }
  }
}

function safeRegExp(pattern: string, caseSensitive: boolean): RegExp | null {
  try {
    return new RegExp(pattern, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

/** MIME 匹配：大小写不敏感；value 含 `*` 时按通配（如 `application/*`），否则精确相等。 */
function compileMimeMatch(pattern: string): (mime: string) => boolean {
  if (pattern.includes('*')) {
    const body = pattern.split('*').map(escapeRegExp).join('.*');
    const regex = new RegExp(`^${body}$`, 'i');
    return (mime) => regex.test(mime);
  }
  const lower = pattern.toLowerCase();
  return (mime) => mime.toLowerCase() === lower;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 大小写不敏感收集某个 header 名下的全部值（含重复头）。 */
export function headerValues(headers: HeaderBag, name: string): string[] {
  const lower = name.toLowerCase();
  const values: string[] = [];
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (Array.isArray(value)) {
        values.push(...value);
      } else if (typeof value === 'string') {
        values.push(value);
      }
    }
  }
  return values;
}

/** 按 priority 升序、ID 稳定比较规则。 */
export function comparePriority(
  first: RuleDefinition,
  second: RuleDefinition,
): number {
  return first.priority !== second.priority
    ? first.priority - second.priority
    : first.id < second.id
      ? -1
      : first.id > second.id
        ? 1
        : 0;
}

/** 判断断点结果是否要求丢弃当前流量。 */
export function isDropped(
  state: BreakpointState,
  timeoutPolicy: BreakpointTimeoutPolicy | undefined,
): boolean {
  return state === 'dropped' ||
    (state === 'timed_out' && timeoutPolicy === 'drop');
}

/** 将断点编辑应用到请求可变状态。 */
export async function applyRequestEdit(
  state: MutableRequestState,
  edit: BreakpointEdit,
): Promise<void> {
  if (edit.method !== undefined) {
    state.method = edit.method;
  }
  if (edit.url !== undefined) {
    state.url = edit.url;
  }
  if (edit.headers !== undefined) {
    state.headers = pairsToBag(edit.headers);
  }
  const fileBody = await readEditBodyFile(edit);
  if (fileBody !== undefined) {
    state.body = fileBody;
  } else if (edit.body !== undefined) {
    state.body = edit.body;
  }
}

/** 将断点编辑应用到响应可变状态。 */
export async function applyResponseEdit(
  state: MutableResponseState,
  edit: BreakpointEdit,
): Promise<void> {
  if (edit.statusCode !== undefined) {
    state.statusCode = edit.statusCode;
  }
  if (edit.headers !== undefined) {
    state.headers = pairsToBag(edit.headers);
  }
  const fileBody = await readEditBodyFile(edit);
  if (fileBody !== undefined) {
    state.body = fileBody;
  } else if (edit.body !== undefined) {
    state.body = edit.body;
  }
}

/**
 * 读取用作替换正文的本地文件。
 * 读不到就当没选过文件：放行时才发现文件没了，原文转发比把正文换成空安全。
 */
async function readEditBodyFile(edit: BreakpointEdit): Promise<Uint8Array | undefined> {
  if (edit.bodyFilePath === undefined) {
    return undefined;
  }
  try {
    return new Uint8Array(await fs.readFile(path.resolve(edit.bodyFilePath)));
  } catch {
    return undefined;
  }
}

/** 将有序 header 对折叠为多值 HeaderBag。 */
export function pairsToBag(pairs: readonly RuleHeaderPair[]): HeaderBag {
  const bag: HeaderBag = {};
  for (const pair of pairs) {
    const existing = bag[pair.name];
    if (existing === undefined) {
      bag[pair.name] = pair.value;
    } else if (Array.isArray(existing)) {
      existing.push(pair.value);
    } else {
      bag[pair.name] = [existing, pair.value];
    }
  }
  return bag;
}

/** 将 HeaderBag 展开为保序 header 对。 */
export function bagToPairs(bag: HeaderBag): RuleHeaderPair[] {
  const pairs: RuleHeaderPair[] = [];
  for (const [name, value] of Object.entries(bag)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        pairs.push({ name, value: item });
      }
    } else if (value !== undefined) {
      pairs.push({ name, value: String(value) });
    }
  }
  return pairs;
}

/** 将完整正文转为 UTF-8 断点快照。 */
export function bodyToString(
  body: string | Uint8Array | undefined,
): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(body);
}

/** 构造请求阶段断点快照；头部阶段挂起，正文还没到达。 */
export function buildRequestSnapshot(
  ruleName: string,
  state: MutableRequestState,
  exchangeId?: string,
): BreakpointSnapshot {
  return {
    ruleName,
    ...(exchangeId !== undefined ? { exchangeId } : {}),
    method: state.method,
    url: state.url,
    headers: bagToPairs(state.headers),
    bodyAvailable: state.body !== undefined,
    body: bodyToString(state.body),
  };
}

/** 构造响应阶段断点快照；头部阶段挂起，正文还没到达。 */
export function buildResponseSnapshot(
  ruleName: string,
  state: MutableResponseState,
  exchangeId?: string,
): BreakpointSnapshot {
  return {
    ruleName,
    ...(exchangeId !== undefined ? { exchangeId } : {}),
    statusCode: state.statusCode,
    headers: bagToPairs(state.headers),
    bodyAvailable: state.body !== undefined,
    body: bodyToString(state.body),
  };
}
