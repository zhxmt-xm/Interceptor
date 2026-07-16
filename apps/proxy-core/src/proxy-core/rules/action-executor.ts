/**
 * M7/T7.3 Action 执行器（header/query 部分）：把 RuleAction 套用到中立的可变请求/
 * 响应状态上，并产出 mutation 摘要供 RuleHit 审计。
 *
 * 与 Mockttp 解耦：rule-engine（T7.7）负责在 Mockttp 回调对象与这里的可变状态之间
 * 转换，本模块只做纯数据改写以便单测。审计摘要只记录 action 类型与目标名，不记录
 * header/query 的值，避免把 Authorization/Cookie/Token 等敏感内容写入 rule_hit。
 *
 * 本任务实现 header（set/append/remove）与 query（set/remove）；body、synthetic、
 * block、status、breakpoint 由 T7.4–T7.6 追加，未处理的 action 返回 null（无改写）。
 */

import type { HeaderOperation, RuleAction } from '@interceptor/core-protocol';

import type { HeaderBag } from './matcher-compiler';

/** 请求阶段可变状态（供请求侧 action 改写）。 */
export interface MutableRequestState {
  method: string;
  url: string;
  headers: HeaderBag;
}

/** 响应阶段可变状态（供响应侧 action 改写）。 */
export interface MutableResponseState {
  statusCode: number;
  headers: HeaderBag;
}

/** 一次实际改写的审计摘要；不记录敏感值，仅记 action 类型与目标名。 */
export interface ActionSummary {
  readonly action: string;
  readonly detail: string;
}

/**
 * 对请求状态套用一个请求侧 action，返回改写摘要；不适用或无改动时返回 null。
 * 请求侧包括 phase=request 的 header set/append/remove 与 query set/remove。
 */
export function applyRequestAction(
  state: MutableRequestState,
  action: RuleAction,
): ActionSummary | null {
  switch (action.type) {
    case 'header':
      return action.phase === 'request'
        ? applyHeaderOp(state.headers, action.op, action.name, action.value)
        : null;
    case 'query':
      return applyQueryOp(state, action.op, action.name, action.value);
    default:
      // body / synthetic / block / status / breakpoint 由 T7.4–T7.6 处理。
      return null;
  }
}

/**
 * 对响应状态套用一个响应侧 action，返回改写摘要；不适用或无改动时返回 null。
 * 本任务仅处理 phase=response 的 header set/append/remove。
 */
export function applyResponseAction(
  state: MutableResponseState,
  action: RuleAction,
): ActionSummary | null {
  switch (action.type) {
    case 'header':
      return action.phase === 'response'
        ? applyHeaderOp(state.headers, action.op, action.name, action.value)
        : null;
    default:
      return null;
  }
}

function applyHeaderOp(
  headers: HeaderBag,
  op: HeaderOperation,
  name: string,
  value: string | undefined,
): ActionSummary | null {
  switch (op) {
    case 'set':
      if (value === undefined) {
        return null;
      }
      removeHeader(headers, name);
      headers[name] = value;
      return { action: 'header.set', detail: name };
    case 'append':
      if (value === undefined) {
        return null;
      }
      appendHeader(headers, name, value);
      return { action: 'header.append', detail: name };
    case 'remove':
      return removeHeader(headers, name)
        ? { action: 'header.remove', detail: name }
        : null;
    default: {
      const exhaustive: never = op;
      throw new Error(`Unknown header operation: ${String(exhaustive)}`);
    }
  }
}

function applyQueryOp(
  state: MutableRequestState,
  op: 'set' | 'remove',
  name: string,
  value: string | undefined,
): ActionSummary | null {
  let url: URL;
  try {
    url = new URL(state.url);
  } catch {
    // 相对/畸形 URL 无法解析 query，跳过改写。
    return null;
  }
  if (op === 'set') {
    if (value === undefined) {
      return null;
    }
    url.searchParams.set(name, value);
  } else {
    if (!url.searchParams.has(name)) {
      return null;
    }
    url.searchParams.delete(name);
  }
  state.url = url.toString();
  return { action: `query.${op}`, detail: name };
}

/** 大小写不敏感返回所有匹配某 header 名的实际 key（HTTP 允许大小写变体与重复）。 */
function headerKeys(headers: HeaderBag, name: string): string[] {
  const lower = name.toLowerCase();
  return Object.keys(headers).filter((key) => key.toLowerCase() === lower);
}

/** 删除所有大小写不敏感同名 header；返回是否有删除。 */
function removeHeader(headers: HeaderBag, name: string): boolean {
  const keys = headerKeys(headers, name);
  for (const key of keys) {
    delete headers[key];
  }
  return keys.length > 0;
}

/** 追加一个 header 值：已存在则合并为数组，否则新建。 */
function appendHeader(headers: HeaderBag, name: string, value: string): void {
  const keys = headerKeys(headers, name);
  if (keys.length === 0) {
    headers[name] = value;
    return;
  }
  const key = keys[0]!;
  const existing = headers[key];
  if (Array.isArray(existing)) {
    existing.push(value);
  } else if (typeof existing === 'string') {
    headers[key] = [existing, value];
  } else {
    headers[key] = value;
  }
}
