/**
 * M7/T7.2 Matcher 编译器：把可序列化的 RuleMatcher 编译为纯匹配判定函数。
 *
 * 编译产物只在 Core 内存，不持久化。匹配在 Mockttp passthrough 的 beforeRequest
 * （请求阶段）/beforeResponse（响应阶段）回调内对每个 Exchange 求值；同一规则的
 * 多个 matcher 为 AND 关系。字符串匹配的大小写策略遵循 HTTP 语义：method/host/
 * header 名/MIME 大小写不敏感，path/url/header 值/query 大小写敏感。
 */

import type {
  KeyMatchMode,
  RuleMatcher,
  StringMatchMode,
} from '@interceptor/core-protocol';

/** HTTP 头集合（大小写不敏感的多值查找），形态兼容 Mockttp headers。 */
export type HeaderBag = Record<string, string | string[] | undefined>;

/** 请求侧可判定字段（beforeRequest 阶段即可求值）。 */
export interface RequestMatchInput {
  readonly method: string;
  readonly url: string;
  readonly host: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: HeaderBag;
  readonly mime?: string;
}

/** 响应侧字段（仅 beforeResponse 阶段可用）。 */
export interface ResponseMatchInput {
  readonly statusCode: number;
  readonly headers: HeaderBag;
  readonly mime?: string;
}

/** 匹配上下文：请求阶段只含 request；响应阶段附带 response。 */
export interface MatchContext {
  readonly request: RequestMatchInput;
  readonly response?: ResponseMatchInput;
}

export type CompiledMatcher = (context: MatchContext) => boolean;

/**
 * 把单个 RuleMatcher 编译为判定函数；正则在编译期预构建，非法正则退化为恒不匹配
 * （collectRuleDiagnostics 已在保存前拦截非法正则，此处为防御性回退）。
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
      const test = compileStringMatch(matcher.mode, matcher.value, false);
      return (ctx) => test(ctx.request.host);
    }
    case 'path': {
      const test = compileStringMatch(matcher.mode, matcher.value, true);
      return (ctx) => test(ctx.request.path);
    }
    case 'url': {
      const test = compileStringMatch(matcher.mode, matcher.value, true);
      return (ctx) => test(ctx.request.url);
    }
    case 'query': {
      const test = compileKeyMatch(matcher.mode, matcher.value);
      return (ctx) => test(ctx.request.query.getAll(matcher.key));
    }
    case 'header': {
      const test = compileKeyMatch(matcher.mode, matcher.value);
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
      const test = compileStringMatch(
        matcher.value.includes('*') ? 'wildcard' : 'exact',
        matcher.value,
        false,
      );
      const phase = matcher.phase;
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
 * 规则至少含 1 个 matcher（wire 校验保证），空数组会恒真——调用方不应传空。
 */
export function compileRuleMatchers(
  matchers: readonly RuleMatcher[],
): CompiledMatcher {
  const compiled = matchers.map(compileMatcher);
  return (ctx) => compiled.every((test) => test(ctx));
}

/**
 * 判断规则是否含只能在响应阶段判定的 matcher（status / response header / response mime）。
 * 供 T7.7 引擎决定请求阶段 action 能否安全求值。
 */
export function requiresResponsePhase(
  matchers: readonly RuleMatcher[],
): boolean {
  return matchers.some(
    (matcher) =>
      matcher.type === 'status' ||
      (matcher.type === 'header' && matcher.phase === 'response') ||
      (matcher.type === 'mime' && matcher.phase === 'response'),
  );
}

function compileStringMatch(
  mode: StringMatchMode,
  pattern: string,
  caseSensitive: boolean,
): (value: string) => boolean {
  switch (mode) {
    case 'exact': {
      if (caseSensitive) {
        return (value) => value === pattern;
      }
      const lower = pattern.toLowerCase();
      return (value) => value.toLowerCase() === lower;
    }
    case 'wildcard': {
      const regex = wildcardToRegExp(pattern, caseSensitive);
      return (value) => regex.test(value);
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
): (values: string[]) => boolean {
  switch (mode) {
    case 'present':
      return (values) => values.length > 0;
    case 'exact':
      return (values) => expected !== undefined && values.includes(expected);
    case 'regex': {
      const regex = expected !== undefined ? safeRegExp(expected, true) : null;
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

/** 把通配符模式（`*` 匹配任意字符）编译为锚定整串的正则。 */
function wildcardToRegExp(pattern: string, caseSensitive: boolean): RegExp {
  const body = pattern
    .split('*')
    .map((segment) => escapeRegExp(segment))
    .join('.*');
  return new RegExp(`^${body}$`, caseSensitive ? '' : 'i');
}

function safeRegExp(pattern: string, caseSensitive: boolean): RegExp | null {
  try {
    return new RegExp(pattern, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 大小写不敏感收集某个 header 名下的全部值（含重复头）。 */
function headerValues(headers: HeaderBag, name: string): string[] {
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
