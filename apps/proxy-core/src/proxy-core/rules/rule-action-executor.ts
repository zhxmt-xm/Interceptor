import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  HeaderOperation,
  RuleAction,
  RuleHeaderPair,
} from '@interceptor/core-protocol';

import type {
  ActionOutcome,
  ActionSummary,
  HeaderBag,
  MutableRequestState,
  MutableResponseState,
  SyntheticResponseInit,
} from './interfaces';

/** 将一条 RuleAction 应用到请求或响应可变状态，并产出无敏感值的审计摘要。 */
export class RuleActionExecutor {
  /** 未应用或未产生改动时复用的稳定结果。 */
  private static readonly NONE: ActionOutcome = { kind: 'none' };
  /** 对请求状态应用一个请求侧 action；Map Local 文件读取保持异步。 */
  async applyRequest(
    state: MutableRequestState,
    action: RuleAction,
  ): Promise<ActionOutcome> {
    switch (action.type) {
      case 'header':
        return action.phase === 'request'
          ? this.headerOutcome(state.headers, action.op, action.name, action.value)
          : RuleActionExecutor.NONE;
      case 'query':
        return this.queryOutcome(state, action.op, action.name, action.value);
      case 'body':
        if (action.phase !== 'request') {
          return RuleActionExecutor.NONE;
        }
        state.body = action.content;
        return {
          kind: 'mutated',
          summary: { action: 'body.set', detail: action.format },
        };
      case 'map-remote':
        return this.mapRemoteOutcome(state, action);
      case 'synthetic':
        return {
          kind: 'respond',
          response: this.syntheticResponse(action),
          summary: { action: 'synthetic', detail: String(action.statusCode) },
        };
      case 'map-local':
        return this.mapLocalOutcome(action.path);
      case 'block':
        return {
          kind: 'block',
          mode: action.mode,
          summary: { action: 'block', detail: action.mode },
        };
      case 'status':
        return RuleActionExecutor.NONE;
      case 'delay':
        return action.phase === 'request'
          ? {
              kind: 'delay',
              ms: action.ms,
              summary: { action: 'delay', detail: `${action.ms}ms` },
            }
          : RuleActionExecutor.NONE;
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
          : RuleActionExecutor.NONE;
      default:
        return RuleActionExecutor.NONE;
    }
  }

  /** 对响应状态应用一个响应侧 action。 */
  applyResponse(
    state: MutableResponseState,
    action: RuleAction,
  ): ActionOutcome {
    switch (action.type) {
      case 'header':
        return action.phase === 'response'
          ? this.headerOutcome(state.headers, action.op, action.name, action.value)
          : RuleActionExecutor.NONE;
      case 'body':
        if (action.phase !== 'response') {
          return RuleActionExecutor.NONE;
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
          : RuleActionExecutor.NONE;
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
          : RuleActionExecutor.NONE;
      default:
        return RuleActionExecutor.NONE;
    }
  }

  /** 应用大小写不敏感的 header set/append/remove。 */
  private applyHeaderOp(
    headers: HeaderBag,
    operation: HeaderOperation,
    name: string,
    value: string | undefined,
  ): ActionSummary | null {
    switch (operation) {
      case 'set':
        if (value === undefined) {
          return null;
        }
        this.removeHeader(headers, name);
        headers[name] = value;
        return { action: 'header.set', detail: name };
      case 'append':
        if (value === undefined) {
          return null;
        }
        this.appendHeader(headers, name, value);
        return { action: 'header.append', detail: name };
      case 'remove':
        return this.removeHeader(headers, name)
          ? { action: 'header.remove', detail: name }
          : null;
      default: {
        const exhaustive: never = operation;
        throw new Error(`Unknown header operation: ${String(exhaustive)}`);
      }
    }
  }

  /** 应用 URL query set/remove 并回写完整 URL。 */
  private applyQueryOp(
    state: MutableRequestState,
    operation: 'set' | 'remove',
    name: string,
    value: string | undefined,
  ): ActionSummary | null {
    let url: URL;
    try {
      url = new URL(state.url);
    } catch {
      return null;
    }
    if (operation === 'set') {
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
    return { action: `query.${operation}`, detail: name };
  }

  /** 返回大小写不敏感匹配的实际 header keys。 */
  private headerKeys(headers: HeaderBag, name: string): string[] {
    const lower = name.toLowerCase();
    return Object.keys(headers).filter((key) => key.toLowerCase() === lower);
  }

  /** 删除全部同名 header 并返回是否发生删除。 */
  private removeHeader(headers: HeaderBag, name: string): boolean {
    const keys = this.headerKeys(headers, name);
    for (const key of keys) {
      delete headers[key];
    }
    return keys.length > 0;
  }

  /** 追加 header 值，已有值时转换为数组。 */
  private appendHeader(headers: HeaderBag, name: string, value: string): void {
    const keys = this.headerKeys(headers, name);
    if (keys.length === 0) {
      headers[name] = value;
      return;
    }
    const [key] = keys;
    if (!key) {
      return;
    }
    const existing = headers[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === 'string') {
      headers[key] = [existing, value];
    } else {
      headers[key] = value;
    }
  }

  /** 将 header 改写摘要包装为 action outcome。 */
  private headerOutcome(
    headers: HeaderBag,
    operation: HeaderOperation,
    name: string,
    value: string | undefined,
  ): ActionOutcome {
    const summary = this.applyHeaderOp(headers, operation, name, value);
    return summary ? { kind: 'mutated', summary } : RuleActionExecutor.NONE;
  }

  /** 将 query 改写摘要包装为 action outcome。 */
  private queryOutcome(
    state: MutableRequestState,
    operation: 'set' | 'remove',
    name: string,
    value: string | undefined,
  ): ActionOutcome {
    const summary = this.applyQueryOp(state, operation, name, value);
    return summary ? { kind: 'mutated', summary } : RuleActionExecutor.NONE;
  }

  /** 将 Map Remote 覆盖应用到目标 URL。 */
  private mapRemoteOutcome(
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
      return RuleActionExecutor.NONE;
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
    return {
      kind: 'mutated',
      summary: { action: 'map-remote', detail: url.host },
    };
  }

  /** 构造 synthetic response 并合并重复 header。 */
  private syntheticResponse(action: {
    statusCode: number;
    headers?: readonly RuleHeaderPair[];
    body?: string;
  }): SyntheticResponseInit {
    const headers: HeaderBag = {};
    for (const pair of action.headers ?? []) {
      this.appendHeader(headers, pair.name, pair.value);
    }
    return { statusCode: action.statusCode, headers, body: action.body };
  }

  /** 读取可信 Renderer 指定的 Map Local 文件并构造短路响应。 */
  private async mapLocalOutcome(filePath: string): Promise<ActionOutcome> {
    const resolved = path.resolve(filePath);
    try {
      const data = await fs.readFile(resolved);
      return {
        kind: 'respond',
        response: {
          statusCode: 200,
          headers: { 'content-type': this.guessMediaType(resolved) },
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

  /** 根据文件扩展名推断有限 MIME。 */
  private guessMediaType(file: string): string {
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
}
