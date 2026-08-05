import type { RuleHeaderPair } from '@interceptor/core-protocol';

import type { ComposerResponse } from '../../../shared/desktop-api';

import {
  DOCUMENT_TABS_HEIGHT,
  MIN_COLLECTION_WIDTH,
  MIN_REQUEST_HEIGHT,
  MIN_RESPONSE_HEIGHT,
  MIN_WORK_WIDTH,
  SPLITTER_TRACK,
  URL_BAR_HEIGHT,
} from './constants';
import type {
  CollectionNode,
  CollectionRequest,
  ComposerBodyType,
  ComposerFieldRow,
  ComposerTiming,
} from './interfaces';

let sequence = 0;

/** 生成集合节点与字段行的本地唯一 ID。 */
export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

/** 新建一行空的键值字段。 */
export function emptyFieldRow(): ComposerFieldRow {
  return { id: nextId('row'), name: '', value: '', enabled: true };
}

/** 新建一条 Untitled 请求；`+` 与空集合首次加载都用它。 */
export function newRequest(): CollectionRequest {
  return {
    kind: 'request',
    id: nextId('req'),
    name: 'Untitled',
    method: 'GET',
    url: '',
    protocol: 'auto',
    query: [],
    headers: [],
    bodyType: 'none',
    bodyText: '',
    bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

/** 新建一个空目录。 */
export function newFolder(name: string): CollectionNode {
  return { kind: 'folder', id: nextId('dir'), name, children: [] };
}

/** 把 query 行拼回 URL；只有启用且有名字的行参与。 */
export function buildRequestUrl(request: CollectionRequest): string {
  const active = request.query.filter(
    (row) => row.enabled && row.name.trim() !== '',
  );
  if (active.length === 0) {
    return request.url;
  }
  const search = active
    .map(
      (row) =>
        `${encodeURIComponent(row.name)}=${encodeURIComponent(row.value)}`,
    )
    .join('&');
  return request.url.includes('?')
    ? `${request.url}&${search}`
    : `${request.url}?${search}`;
}

/** 组装发送用的头部：启用的手工头 + Auth 派生的 authorization。 */
export function buildRequestHeaders(
  request: CollectionRequest,
): RuleHeaderPair[] {
  const headers: RuleHeaderPair[] = request.headers
    .filter((row) => row.enabled && row.name.trim() !== '')
    .map((row) => ({ name: row.name, value: row.value }));

  const { auth } = request;
  if (auth.type === 'bearer' && auth.token) {
    headers.push({ name: 'authorization', value: `Bearer ${auth.token}` });
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    headers.push({
      name: 'authorization',
      value: `Basic ${btoa(`${auth.username}:${auth.password}`)}`,
    });
  }
  return headers;
}

/** 按 bodyType 生成发送正文；Form 在 Renderer 编码为 urlencoded，协议不变。 */
export function buildRequestBody(
  request: CollectionRequest,
): string | undefined {
  if (request.bodyType === 'none') {
    return undefined;
  }
  if (request.bodyType === 'form') {
    const encoded = request.bodyForm
      .filter((row) => row.enabled && row.name.trim() !== '')
      .map(
        (row) =>
          `${encodeURIComponent(row.name)}=${encodeURIComponent(row.value)}`,
      )
      .join('&');
    return encoded.length > 0 ? encoded : undefined;
  }
  return request.bodyText.length > 0 ? request.bodyText : undefined;
}

/** Form 与 JSON 档需要的 content-type；已手工设置时不覆盖。 */
export function defaultContentType(
  request: CollectionRequest,
): string | undefined {
  return request.bodyType === 'json' || request.bodyType === 'form'
    ? bodyContentType(request.bodyType)
    : undefined;
}

/** 把 URL 拆成 scheme 前缀与其余部分，URL 行用不同颜色显示 scheme。 */
export function splitScheme(url: string): [scheme: string, rest: string] {
  const match = /^[a-z][a-z0-9+.-]*:\/\//i.exec(url);
  return match ? [match[0], url.slice(match[0].length)] : ['', url];
}

/** 响应状态的三档色调，驱动状态圆点与历史行颜色。 */
export function statusTone(status: number): 'ok' | 'warn' | 'err' {
  if (status >= 200 && status < 400) {
    return 'ok';
  }
  return status >= 500 || status === 0 ? 'err' : 'warn';
}

/** 取一个响应头的值（大小写不敏感）。 */
export function readHeader(
  response: ComposerResponse,
  name: string,
): string | undefined {
  return response.headers.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/** JSON 正文缩进展示；解析失败时原样返回。 */
export function formatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

/** 从响应头解析 Set-Cookie 行。 */
export function responseCookies(
  response: ComposerResponse,
): Array<{ name: string; value: string }> {
  return response.headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const [pair = ''] = header.value.split(';');
      const separator = pair.indexOf('=');
      return separator === -1
        ? { name: pair.trim(), value: '' }
        : {
            name: pair.slice(0, separator).trim(),
            value: pair.slice(separator + 1).trim(),
          };
    });
}

/** 字节数按 B / KB / MB 折算。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 把分阶段耗时折算成条形图用的偏移与宽度百分比，阶段首尾相接。 */
export function timingPhases(timing: ComposerTiming): Array<{
  id: 'Dns' | 'Tcp' | 'Tls' | 'Request' | 'Waiting' | 'Download';
  durationMs: number;
  offsetPercent: number;
  widthPercent: number;
}> {
  const total = Math.max(timing.totalMs, 1);
  const durations = [
    ['Dns', timing.dnsMs],
    ['Tcp', timing.tcpMs],
    ['Tls', timing.tlsMs],
    ['Request', timing.requestMs],
    ['Waiting', timing.waitingMs],
    ['Download', timing.downloadMs],
  ] as const;

  let elapsed = 0;
  return durations.map(([id, durationMs]) => {
    const offsetPercent = (elapsed / total) * 100;
    elapsed += durationMs;
    return {
      id,
      durationMs,
      offsetPercent,
      // 零耗时阶段也留一条细线，否则时间轴会出现空档看不出阶段存在。
      widthPercent: Math.max((durationMs / total) * 100, 0.5),
    };
  });
}

/** 请求正文按档位对应的 content-type。 */
export function bodyContentType(bodyType: ComposerBodyType): string {
  if (bodyType === 'json') {
    return 'application/json';
  }
  if (bodyType === 'form') {
    return 'application/x-www-form-urlencoded';
  }
  return 'text/plain';
}

/** 把发送时刻折算成「2 分钟前」这类相对时间。 */
export function relativeTime(at: number, locale: string): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) {
    return format.format(seconds, 'second');
  }
  if (Math.abs(seconds) < 3600) {
    return format.format(Math.round(seconds / 60), 'minute');
  }
  return format.format(Math.round(seconds / 3600), 'hour');
}

/** Collection 最多能占到「总宽减去工作区最小宽度」。 */
export function maxCollectionWidth(totalWidth: number): number {
  return Math.max(
    MIN_COLLECTION_WIDTH,
    totalWidth - MIN_WORK_WIDTH - SPLITTER_TRACK,
  );
}

/** 响应区最多能占到「工作区总高减去标签条、URL 行与请求区最小高度」。 */
export function maxResponseHeight(totalHeight: number): number {
  return Math.max(
    MIN_RESPONSE_HEIGHT,
    totalHeight
      - DOCUMENT_TABS_HEIGHT
      - URL_BAR_HEIGHT
      - MIN_REQUEST_HEIGHT
      - SPLITTER_TRACK,
  );
}
