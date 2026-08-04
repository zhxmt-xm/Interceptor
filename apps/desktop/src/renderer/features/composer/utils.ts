import type { RuleHeaderPair } from '@interceptor/core-protocol';

import type { ComposerResponse } from '../../../shared/desktop-api';

import {
  DOCUMENT_TABS_HEIGHT,
  FOLDER_MENU_WIDTH,
  FOLDER_ROW_HEIGHT,
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
  FolderMenuAnchor,
  ResponseBodyMode,
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

/** 深度优先查找一条请求。 */
export function findRequest(
  nodes: readonly CollectionNode[],
  requestId: string,
): CollectionRequest | null {
  for (const node of nodes) {
    if (node.kind === 'request') {
      if (node.id === requestId) {
        return node;
      }
      continue;
    }
    const found = findRequest(node.children, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

/** 就地替换一条请求，返回新树；未找到时原样返回。 */
export function replaceRequest(
  nodes: readonly CollectionNode[],
  request: CollectionRequest,
): CollectionNode[] {
  return nodes.map((node) => {
    if (node.kind === 'request') {
      return node.id === request.id ? request : node;
    }
    return { ...node, children: replaceRequest(node.children, request) };
  });
}

/** 按 ID 删除任意节点（目录连同其子树）。 */
export function removeNode(
  nodes: readonly CollectionNode[],
  nodeId: string,
): CollectionNode[] {
  const kept: CollectionNode[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) {
      continue;
    }
    kept.push(
      node.kind === 'folder'
        ? { ...node, children: removeNode(node.children, nodeId) }
        : node,
    );
  }
  return kept;
}

/** 重命名任意节点。 */
export function renameNode(
  nodes: readonly CollectionNode[],
  nodeId: string,
  name: string,
): CollectionNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name };
    }
    return node.kind === 'folder'
      ? { ...node, children: renameNode(node.children, nodeId, name) }
      : node;
  });
}

/** 把新节点追加到指定目录下；folderId 为 null 时追加到根。 */
export function appendNode(
  nodes: readonly CollectionNode[],
  folderId: string | null,
  child: CollectionNode,
): CollectionNode[] {
  if (folderId === null) {
    return [...nodes, child];
  }
  return nodes.map((node) => {
    if (node.kind !== 'folder') {
      return node;
    }
    if (node.id === folderId) {
      return { ...node, children: [...node.children, child] };
    }
    return { ...node, children: appendNode(node.children, folderId, child) };
  });
}

/** 统计一个目录（含子目录）下的请求条数，供目录行右侧计数使用。 */
export function countRequests(nodes: readonly CollectionNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.kind === 'request' ? 1 : countRequests(node.children)),
    0,
  );
}

/** 收集树里的全部请求 ID，用于关闭已被删除的文档。 */
export function collectRequestIds(nodes: readonly CollectionNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'request' ? [node.id] : collectRequestIds(node.children),
  );
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

/** 响应正文的 Monaco 语言：auto 按 content-type 推断。 */
export function responseLanguage(
  response: ComposerResponse,
  mode: ResponseBodyMode,
): string {
  if (mode === 'json') {
    return 'json';
  }
  if (mode === 'text' || mode === 'hex') {
    return 'plaintext';
  }
  const contentType = readHeader(response, 'content-type') ?? '';
  if (/json/i.test(contentType)) {
    return 'json';
  }
  if (/html/i.test(contentType)) {
    return 'html';
  }
  if (/xml/i.test(contentType)) {
    return 'xml';
  }
  return 'plaintext';
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

/** 十六进制视图：每行 16 字节，左侧偏移右侧可打印字符。 */
export function formatHex(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.subarray(offset, offset + 16);
    const hex = [...chunk]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = [...chunk]
      .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}

/** 按模式渲染响应正文；正文以字节传回，文本档统一按 UTF-8 解码。 */
export function renderResponseBody(
  response: ComposerResponse,
  mode: ResponseBodyMode,
): string {
  if (mode === 'hex') {
    return formatHex(response.body);
  }
  const text = new TextDecoder().decode(response.body);
  if (mode === 'text') {
    return text;
  }
  return responseLanguage(response, mode) === 'json' ? formatJson(text) : text;
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

/** 目录操作菜单锚到触发行下方，坐标相对于 Collection 分栏。 */
export function anchorFolderMenu(
  trigger: HTMLElement,
  folderId: string,
): FolderMenuAnchor | null {
  const row = trigger.closest('section');
  const panel = trigger.closest('aside');
  if (!row || !panel) {
    return null;
  }
  const rowBounds = row.getBoundingClientRect();
  const panelBounds = panel.getBoundingClientRect();
  return {
    folderId,
    top: rowBounds.top - panelBounds.top + FOLDER_ROW_HEIGHT,
    left: Math.max(8, rowBounds.right - panelBounds.left - FOLDER_MENU_WIDTH),
  };
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
