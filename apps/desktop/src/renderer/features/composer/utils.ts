import type { RuleHeaderPair } from '../../../shared/desktop-api';
import type { ComposerState, HeaderRow } from './interfaces';

let sequence = 0;

/** 生成 header 行的本地唯一 id。 */
export function nextId(): string {
  sequence += 1;
  return `row-${Date.now()}-${sequence}`;
}

/** 新建 Composer 草稿的默认 header 行。 */
export function defaultHeaders(): HeaderRow[] {
  return [
    { id: nextId(), name: 'accept', value: '*/*', on: true },
    { id: nextId(), name: 'user-agent', value: 'Interceptor/1.0', on: true },
  ];
}

/** 解析当前 URL 的查询参数为可编辑行；URL 非法时返回空。 */
export function parseQueryParams(url: string): Array<{ name: string; value: string }> {
  try {
    const parsed = new URL(url);
    return [...parsed.searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

/** 组装发送用的 header 对：启用的手工 header + Auth 派生的 authorization 头。 */
export function buildSendHeaders(state: ComposerState): RuleHeaderPair[] {
  const headers: RuleHeaderPair[] = state.headers
    .filter((header) => header.on && header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));

  if (state.auth.type === 'bearer' && state.auth.token) {
    headers.push({ name: 'authorization', value: `Bearer ${state.auth.token}` });
  } else if (state.auth.type === 'basic' && (state.auth.username || state.auth.password)) {
    const encoded = btoa(`${state.auth.username}:${state.auth.password}`);
    headers.push({ name: 'authorization', value: `Basic ${encoded}` });
  }
  return headers;
}
