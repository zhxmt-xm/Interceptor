/**
 * M7/T7.3–T7.4 Action 执行器：把 RuleAction 套用到中立的可变请求/响应状态，产出
 * ActionOutcome（改写 / 短路响应 / 阻断 / 无操作）供 rule-engine 调度，改写摘要供
 * RuleHit 审计。
 *
 * 与 Mockttp 解耦：rule-engine（T7.7）在 Mockttp 回调对象与这里的可变状态之间转换。
 * 审计摘要只记 action 类型与目标名，不记 header/query/body 值，避免把
 * Authorization/Cookie/Token/正文写入 rule_hit。
 *
 * 已实现：header(set/append/remove)、query(set/remove)、body(text/json 替换)、
 * synthetic 响应、map-remote(改目标)、map-local(本地文件响应，路径规范化 + 允许根
 * 校验防穿越)、block(reset/close)、status 覆盖、delay/throttle 流控。breakpoint 由 T7.6 追加。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  HeaderOperation,
  RuleAction,
  RuleHeaderPair,
} from '@interceptor/core-protocol';

import type { HeaderBag } from './matcher-compiler';

/** 请求阶段可变状态（供请求侧 action 改写）。 */
export interface MutableRequestState {
  method: string;
  url: string;
  headers: HeaderBag;
  body?: string | Uint8Array;
}

/** 响应阶段可变状态（供响应侧 action 改写）。 */
export interface MutableResponseState {
  statusCode: number;
  headers: HeaderBag;
  body?: string | Uint8Array;
}

/** 短路响应（synthetic / map-local 使用）。 */
export interface SyntheticResponseInit {
  readonly statusCode: number;
  readonly headers: HeaderBag;
  readonly body?: string | Uint8Array;
}

/** 一次实际改写的审计摘要；不记录敏感值，仅记 action 类型与目标名。 */
export interface ActionSummary {
  readonly action: string;
  readonly detail: string;
}

/**
 * 单个 action 的执行结果：
 * - none：不适用或无改动（不产 RuleHit）。
 * - mutated：改写了请求/响应状态，继续后续 action。
 * - respond：短路返回一个响应，不再转发上游。
 * - block：阻断连接（reset/close）。
 */
export type ActionOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'mutated'; readonly summary: ActionSummary }
  | {
      readonly kind: 'respond';
      readonly response: SyntheticResponseInit;
      readonly summary: ActionSummary;
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly summary: ActionSummary;
    }
  | {
      readonly kind: 'delay';
      readonly ms: number;
      readonly summary: ActionSummary;
    }
  | {
      readonly kind: 'throttle';
      readonly bytesPerSecond: number;
      readonly summary: ActionSummary;
    };

export interface ActionExecutorOptions {
  /**
   * Map Local 允许读取的根目录（绝对路径）白名单。为空则拒绝所有 map-local
   * （fail-safe）；规范化后必须落在某个允许根内，否则拒绝，杜绝 `..` 穿越。
   */
  readonly mapLocalRoots?: readonly string[];
}

const NONE: ActionOutcome = { kind: 'none' };

/**
 * 对请求状态套用一个请求侧 action。异步以支持 map-local 读文件。
 * header(request)/query/body(request)/map-remote 为改写；synthetic/map-local 短路
 * 响应；block 阻断；其余（status 响应侧、breakpoint）返回 none。
 */
export async function applyRequestAction(
  state: MutableRequestState,
  action: RuleAction,
  options: ActionExecutorOptions = {},
): Promise<ActionOutcome> {
  switch (action.type) {
    case 'header':
      return action.phase === 'request'
        ? headerOutcome(state.headers, action.op, action.name, action.value)
        : NONE;
    case 'query':
      return queryOutcome(state, action.op, action.name, action.value);
    case 'body':
      if (action.phase !== 'request') {
        return NONE;
      }
      state.body = action.content;
      return {
        kind: 'mutated',
        summary: { action: 'body.set', detail: action.format },
      };
    case 'map-remote':
      return mapRemoteOutcome(state, action);
    case 'synthetic':
      return {
        kind: 'respond',
        response: syntheticResponse(action),
        summary: { action: 'synthetic', detail: String(action.statusCode) },
      };
    case 'map-local':
      return mapLocalOutcome(action.path, options.mapLocalRoots ?? []);
    case 'block':
      return {
        kind: 'block',
        mode: action.mode,
        summary: { action: 'block', detail: action.mode },
      };
    case 'status':
      // status 覆盖仅作用于响应阶段。
      return NONE;
    case 'delay':
      return action.phase === 'request'
        ? {
            kind: 'delay',
            ms: action.ms,
            summary: { action: 'delay', detail: `${action.ms}ms` },
          }
        : NONE;
    case 'throttle':
      return action.phase === 'request'
        ? {
            kind: 'throttle',
            bytesPerSecond: action.bytesPerSecond,
            summary: {
              action: 'throttle',
              detail: `${action.bytesPerSecond}bps`,
            },
          }
        : NONE;
    default:
      // breakpoint 由 T7.6 处理。
      return NONE;
  }
}

/**
 * 对响应状态套用一个响应侧 action：phase=response 的 header 与 body 改写。
 * status 覆盖与 breakpoint 由 T7.5 / T7.6 追加。
 */
export function applyResponseAction(
  state: MutableResponseState,
  action: RuleAction,
): ActionOutcome {
  switch (action.type) {
    case 'header':
      return action.phase === 'response'
        ? headerOutcome(state.headers, action.op, action.name, action.value)
        : NONE;
    case 'body':
      if (action.phase !== 'response') {
        return NONE;
      }
      state.body = action.content;
      return {
        kind: 'mutated',
        summary: { action: 'body.set', detail: action.format },
      };
    case 'status':
      state.statusCode = action.statusCode;
      return {
        kind: 'mutated',
        summary: { action: 'status', detail: String(action.statusCode) },
      };
    case 'delay':
      return action.phase === 'response'
        ? {
            kind: 'delay',
            ms: action.ms,
            summary: { action: 'delay', detail: `${action.ms}ms` },
          }
        : NONE;
    case 'throttle':
      return action.phase === 'response'
        ? {
            kind: 'throttle',
            bytesPerSecond: action.bytesPerSecond,
            summary: {
              action: 'throttle',
              detail: `${action.bytesPerSecond}bps`,
            },
          }
        : NONE;
    default:
      return NONE;
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

function headerOutcome(
  headers: HeaderBag,
  op: HeaderOperation,
  name: string,
  value: string | undefined,
): ActionOutcome {
  const summary = applyHeaderOp(headers, op, name, value);
  return summary ? { kind: 'mutated', summary } : NONE;
}

function queryOutcome(
  state: MutableRequestState,
  op: 'set' | 'remove',
  name: string,
  value: string | undefined,
): ActionOutcome {
  const summary = applyQueryOp(state, op, name, value);
  return summary ? { kind: 'mutated', summary } : NONE;
}

function mapRemoteOutcome(
  state: MutableRequestState,
  action: {
    scheme?: 'http' | 'https';
    host?: string;
    port?: number;
    path?: string;
  },
): ActionOutcome {
  let url: URL;
  try {
    url = new URL(state.url);
  } catch {
    return NONE;
  }
  if (action.scheme) {
    url.protocol = `${action.scheme}:`;
  }
  if (action.host) {
    url.hostname = action.host;
  }
  if (action.port !== undefined) {
    url.port = String(action.port);
  }
  if (action.path !== undefined) {
    const queryIndex = action.path.indexOf('?');
    if (queryIndex >= 0) {
      url.pathname = action.path.slice(0, queryIndex);
      url.search = action.path.slice(queryIndex);
    } else {
      url.pathname = action.path;
    }
  }
  state.url = url.toString();
  return { kind: 'mutated', summary: { action: 'map-remote', detail: url.host } };
}

function syntheticResponse(action: {
  statusCode: number;
  headers?: readonly RuleHeaderPair[];
  body?: string;
}): SyntheticResponseInit {
  const headers: HeaderBag = {};
  for (const pair of action.headers ?? []) {
    appendHeader(headers, pair.name, pair.value);
  }
  return { statusCode: action.statusCode, headers, body: action.body };
}

async function mapLocalOutcome(
  filePath: string,
  roots: readonly string[],
): Promise<ActionOutcome> {
  const resolved = path.resolve(filePath);
  const permitted =
    roots.length > 0 &&
    roots.some((root) => isWithin(path.resolve(root), resolved));
  if (!permitted) {
    // fail-safe：无允许根或超出允许根（含 `..` 穿越），拒绝短路，继续正常转发。
    return NONE;
  }
  try {
    const data = await fs.readFile(resolved);
    return {
      kind: 'respond',
      response: {
        statusCode: 200,
        headers: { 'content-type': guessMediaType(resolved) },
        body: new Uint8Array(data),
      },
      summary: { action: 'map-local', detail: path.basename(resolved) },
    };
  } catch {
    return {
      kind: 'respond',
      response: {
        statusCode: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'Map Local target not found.',
      },
      summary: { action: 'map-local', detail: 'not-found' },
    };
  }
}

/** 判断规范化后的 target 是否在规范化后的 root 之内（含相等）。 */
function isWithin(root: string, target: string): boolean {
  if (target === root) {
    return true;
  }
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function guessMediaType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.json':
      return 'application/json';
    case '.html':
    case '.htm':
      return 'text/html';
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.txt':
      return 'text/plain';
    case '.xml':
      return 'application/xml';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
