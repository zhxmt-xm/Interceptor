import type { RuleDefinition } from '@interceptor/core-protocol';

import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeSummary,
  CaptureHeader,
  HarExportRequest,
  PendingBreakpoint,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../shared/desktop-api';
import {
  BODY_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_MAX_BYTES,
} from '../../../shared/desktop-api';
import {
  CAPTURE_FACET_IDS,
  FAILED_FACET_VALUE,
  PENDING_FACET_VALUE,
  PROTOCOL_FACET_ORDER,
  UNKNOWN_FACET_VALUE,
} from './constants';
import {
  CAPTURE_FACET_FIELDS,
  type CaptureFacetId,
  type CaptureFilter,
  type DirectionFilter,
  type ExportScopeKind,
  type FilterValueOption,
  type InspectorTab,
  type KvRow,
  type StatusKind,
  type TimeLabels,
  type TimingSegment,
} from './interfaces';

/** Breakpoint manager 的紧凑匹配摘要：method 在前，host/path 连写，prefix 明示 `*`。 */
export function breakpointManagerSummary(rule: RuleDefinition): string {
  const method = rule.matchers.find((matcher) => matcher.type === 'method');
  const host = rule.matchers.find((matcher) => matcher.type === 'host');
  const path = rule.matchers.find((
    (matcher) => matcher.type === 'path'
  ));
  const url = rule.matchers.find((matcher) => matcher.type === 'url');
  const methodLabel = method?.type === 'method' ? method.value.toUpperCase() : '';
  const urlLabel = url?.type === 'url'
    ? url.value
    : `${host?.type === 'host' ? host.value : ''}${
        path?.type === 'path'
          ? `${path.value}${path.mode === 'contains' ? '*' : ''}`
          : ''
      }`;
  return [methodLabel, urlLabel].filter(Boolean).join(' ')
    || `${rule.matchers.length} condition${rule.matchers.length === 1 ? '' : 's'}`;
}

/** Cookie headers live exclusively in the Cookies tab, not the generic Headers tab. */
export function headersWithoutCookies(headers: CaptureHeader[]): CaptureHeader[] {  return headers.filter((header) => {
    const name = header.name.toLowerCase();
    return name !== 'cookie' && name !== 'set-cookie';
  });
}

/**
 * 合并 wire header 与规则效果行：request wire 是规则前原值，response wire 是规则后终值。
 * 精确匹配的重复行从 wire 集合移除，四态 effect 按规则执行顺序统一追加展示。
 */
export function headersWithRuleEffects(
  headers: CaptureHeader[],
  phase: 'request' | 'response',
): CaptureHeader[] {
  const wire = headers.filter((header) => !header.ruleEffect);
  const effects = headers.filter((header) => header.ruleEffect);
  const duplicateEffects = phase === 'request'
    ? new Set(['replace', 'remove'])
    : new Set(['set', 'append']);
  for (const effect of effects) {
    if (!effect.ruleEffect || !duplicateEffects.has(effect.ruleEffect)) {
      continue;
    }
    const index = wire.findIndex(
      (header) =>
        header.name.toLowerCase() === effect.name.toLowerCase()
        && header.value === effect.value,
    );
    if (index >= 0) {
      wire.splice(index, 1);
    }
  }
  return [...wire, ...effects];
}

/** Parse every request Cookie header; HTTP/2 may emit one header row per cookie pair. */
export function requestCookiePairs(headers: CaptureHeader[]): Array<[string, string]> {
  return headers
    .filter((header) => header.name.toLowerCase() === 'cookie')
    .flatMap((header) => header.value.split(';'))
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=');
      return separator === -1
        ? [pair, '']
        : [pair.slice(0, separator), pair.slice(separator + 1)];
    });
}

/** Preserve each Set-Cookie response header as one row keyed by its cookie name. */
export function responseCookiePairs(headers: CaptureHeader[]): Array<[string, string]> {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const separator = header.value.indexOf('=');
      const name = separator === -1
        ? header.value
        : header.value.slice(0, separator);
      return [name, header.value];
    });
}

/** 由 HTTP 状态码推导状态点语义：2xx 绿、1xx/3xx 蓝、4xx 黄、5xx 红。 */
export function statusKind(code: number | undefined): StatusKind {
  if (code === undefined) {
    return 'info2';
  }
  if (code >= 500) {
    return 'err';
  }
  if (code >= 400) {
    return 'warn';
  }
  if (code >= 200 && code < 300) {
    return 'ok';
  }
  return 'info2';
}

/** Inspector 顶部 StatusBadge 的语气。 */
export function statusTone(code: number | undefined): 'green' | 'yellow' | 'red' | 'info' {
  const kind = statusKind(code);
  if (kind === 'ok') {
    return 'green';
  }
  if (kind === 'warn') {
    return 'yellow';
  }
  if (kind === 'err') {
    return 'red';
  }
  return 'info';
}

/** 列表 Status 列文本：已知状态码显示码，进行中显示占位，未知显示破折号。 */
export function statusLabel(summary: CaptureExchangeSummary): string {
  if (summary.statusCode !== undefined) {
    return String(summary.statusCode);
  }
  return summary.state === 'pending' || summary.state === 'request-complete'
    ? '···'
    : '—';
}

/** 把原始 protocol 归一为列表 Proto 列的短标签。 */
export function protocolLabel(protocol: string): string {
  const value = protocol.toLowerCase();
  if (value === 'http/1.1' || value === 'http/1.0' || value === 'h1') {
    return 'h1';
  }
  if (value === 'http/2' || value === 'h2') {
    return 'h2';
  }
  if (value === 'http/3' || value === 'h3') {
    return 'h3';
  }
  if (value.includes('websocket') || value === 'ws') {
    return 'ws';
  }
  return value;
}

/** 把 protocol 归一为筛选分栏的 Protocol facet 值；与列表 Proto 列不同，这里区分 HTTP/1.1 与 HTTP/1.0。 */
export function protocolFacetValue(protocol: string): string {
  const value = protocol.toLowerCase();
  if (value === 'http/2' || value === 'h2') {
    return 'HTTP/2';
  }
  if (value === 'http/1.1' || value === 'h1') {
    return 'HTTP/1.1';
  }
  if (value === 'http/1.0') {
    return 'HTTP/1.0';
  }
  if (value.includes('websocket') || value === 'ws') {
    return 'WebSocket';
  }
  if (value === 'connect' || value === 'tls') {
    return 'TLS tunnel';
  }
  return protocol;
}

/** 由响应 MIME 推导列表 Type 列的短类型标签。 */
export function typeLabel(mime: string | undefined): string {
  if (!mime) {
    return '—';
  }
  const essence = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (essence === 'application/x-encrypted-tunnel') {
    return 'encrypted';
  }
  if (essence.startsWith('application/grpc-web')) {
    return 'grpc-web';
  }
  if (essence === 'application/grpc' || essence.startsWith('application/grpc+')) {
    return 'grpc';
  }
  const [group, sub = ''] = essence.split('/');
  if (sub === 'json' || sub.endsWith('+json')) {
    return 'json';
  }
  if (sub === 'javascript' || sub === 'x-javascript' || sub === 'ecmascript') {
    return 'js';
  }
  if (sub === 'html') {
    return 'html';
  }
  if (sub === 'css') {
    return 'css';
  }
  if (sub === 'xml' || sub.endsWith('+xml')) {
    return 'xml';
  }
  if (group === 'image') {
    return sub || 'image';
  }
  if (group === 'font' || sub.includes('font') || sub === 'woff2' || sub === 'woff') {
    return 'font';
  }
  if (group === 'text') {
    return sub || 'text';
  }
  return sub || group || '—';
}

/** 从请求 URL 与 MIME 推导正文保存建议文件名；Main 会再次清理 basename。 */
export function suggestedBodyFileName(
  url: string,
  mime: string | undefined,
  fallback: 'request-body' | 'response-body',
): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    /* URL 不可解析时使用 MIME fallback。 */
  }
  const essence = mime?.split(';', 1)[0]?.trim().toLowerCase();
  const extension = essence === 'video/mp4'
    ? 'mp4'
    : essence === 'video/webm'
      ? 'webm'
      : essence === 'audio/mpeg'
        ? 'mp3'
        : essence === 'audio/mp4'
          ? 'm4a'
          : essence === 'audio/ogg'
            ? 'ogg'
            : essence === 'video/ogg'
              ? 'ogv'
              : 'bin';
  return `${fallback}.${extension}`;
}

export interface BodyPreviewRequest {
  length: number;
  decode: boolean;
  /** 读满上限，预览内容不完整。 */
  limited: boolean;
  /** 图片按自己的上限判定；超过就不读字节，半张图比不显示更糟。 */
  oversizeImage: boolean;
}

/** 计算安全的正文预览读取范围；压缩输入不完整时禁止尝试解码。 */
export function bodyPreviewRequest(body: CaptureBodyRef): BodyPreviewRequest {
  const length = Math.min(body.encodedSize, BODY_PREVIEW_MAX_BYTES);
  const encodings = body.contentEncoding
    ?.split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding && encoding !== 'identity') ?? [];
  return {
    length,
    decode: encodings.length > 0,
    limited: body.encodedSize > length,
    oversizeImage: body.encodedSize > IMAGE_PREVIEW_MAX_BYTES,
  };
}

/** Build honest response timing segments from persisted timestamps only. */
export function responseTimingSegments(
  startedAt: number,
  responseStartedAt: number | undefined,
  completedAt: number | undefined,
): TimingSegment[] {
  if (
    responseStartedAt === undefined
    || completedAt === undefined
    || responseStartedAt < startedAt
    || completedAt < responseStartedAt
  ) {
    return [];
  }
  const waitingMs = responseStartedAt - startedAt;
  const downloadMs = completedAt - responseStartedAt;
  const totalMs = Math.max(1, completedAt - startedAt);
  return [
    {
      id: 'waiting',
      durationMs: waitingMs,
      offsetPercent: 0,
      widthPercent: (waitingMs / totalMs) * 100,
    },
    {
      id: 'download',
      durationMs: downloadMs,
      offsetPercent: (waitingMs / totalMs) * 100,
      widthPercent: (downloadMs / totalMs) * 100,
    },
  ];
}

/** 列表 Time 列文本：已完成显示耗时，WebSocket 显示 open，进行中显示占位。 */
export function timeLabel(
  summary: CaptureExchangeSummary,
  locale = 'en',
  labels: TimeLabels = { closed: 'closed', open: 'open', failed: 'failed' },
): string {
  if (protocolLabel(summary.protocol) === 'tls' && summary.durationMs === undefined) {
    return labels.open;
  }
  if (protocolLabel(summary.protocol) === 'ws') {
    return summary.state === 'completed' || summary.state === 'failed' ? labels.closed : labels.open;
  }
  if (summary.durationMs === undefined) {
    return summary.state === 'failed' ? labels.failed : '···';
  }
  if (summary.durationMs < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(summary.durationMs)} ms`;
  }
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(summary.durationMs / 1000)} s`;
}

/** 列表显示的字节数：优先响应，否则请求。 */
export function displayBytes(summary: CaptureExchangeSummary): number {
  return summary.responseBytes > 0 ? summary.responseBytes : summary.requestBytes;
}

/** 单条摘要在某个 facet 上的取值；一条摘要可能命中多个规则，因此返回数组。 */
export function facetValuesOf(
  summary: CaptureExchangeSummary,
  facet: CaptureFacetId,
): string[] {
  switch (facet) {
    case 'application':
      return summary.appPending
        ? [PENDING_FACET_VALUE]
        : [summary.appId ?? UNKNOWN_FACET_VALUE];
    case 'method':
      return [summary.method.toUpperCase()];
    case 'host':
      return summary.host ? [summary.host] : [];
    case 'status':
      return [statusFacetValue(summary)];
    case 'protocol':
      return [protocolFacetValue(summary.protocol)];
    case 'type':
      return summary.responseMime === undefined
        && (summary.state === 'pending' || summary.state === 'request-complete')
        ? [PENDING_FACET_VALUE]
        : [typeLabel(summary.responseMime)];
    case 'rule':
      return [...new Set(summary.ruleIds ?? [])];
  }
}

/** 失败请求没有状态码，在 Status facet 里归为单独一项。 */
function statusFacetValue(summary: CaptureExchangeSummary): string {
  if (summary.statusCode !== undefined) {
    return String(summary.statusCode);
  }
  return summary.state === 'failed' ? FAILED_FACET_VALUE : PENDING_FACET_VALUE;
}

/** 判断摘要是否命中当前全部筛选（组内 OR、组间 AND），供实时事件与列表派生共用。 */
export function matchesCoreFilter(
  summary: CaptureExchangeSummary,
  filter: CaptureFilter,
): boolean {
  for (const facet of CAPTURE_FACET_IDS) {
    const selected = filter[CAPTURE_FACET_FIELDS[facet]];
    if (selected.length === 0) {
      continue;
    }
    const values = facetValuesOf(summary, facet);
    if (!values.some((value) => selected.includes(value))) {
      return false;
    }
  }
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = `${summary.host ?? ''}${summary.path ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  return true;
}

/** 一次遍历派生全部 facet 的可选值与计数；实时流量下每条摘要只扫一遍。 */
export function allFacetOptions(
  rows: readonly CaptureExchangeSummary[],
): Record<CaptureFacetId, FilterValueOption[]> {
  const buckets = Object.fromEntries(
    CAPTURE_FACET_IDS.map((facet) => [facet, new Map<string, number>()]),
  ) as Record<CaptureFacetId, Map<string, number>>;
  buckets.application.set(PENDING_FACET_VALUE, 0);
  buckets.status.set(PENDING_FACET_VALUE, 0);
  buckets.type.set(PENDING_FACET_VALUE, 0);
  for (const row of rows) {
    for (const facet of CAPTURE_FACET_IDS) {
      const bucket = buckets[facet];
      for (const value of facetValuesOf(row, facet)) {
        bucket.set(value, (bucket.get(value) ?? 0) + 1);
      }
    }
  }
  return Object.fromEntries(
    CAPTURE_FACET_IDS.map((facet) => [facet, sortFacetOptions(facet, buckets[facet])]),
  ) as Record<CaptureFacetId, FilterValueOption[]>;
}

/** Status 按状态码升序、Protocol 按版本高低排；其余 facet 保持首次出现顺序。 */
function sortFacetOptions(
  facet: CaptureFacetId,
  counts: Map<string, number>,
): FilterValueOption[] {
  const entries = [...counts.entries()].map(([value, count]) => ({ value, count }));
  if (facet === 'status') {
    return entries.sort((left, right) => statusOrder(left.value) - statusOrder(right.value));
  }
  if (facet === 'protocol') {
    return entries.sort(
      (left, right) =>
        PROTOCOL_FACET_ORDER.indexOf(left.value) - PROTOCOL_FACET_ORDER.indexOf(right.value),
    );
  }
  const pending = entries.find((entry) => entry.value === PENDING_FACET_VALUE);
  return pending
    ? [...entries.filter((entry) => entry !== pending), pending]
    : entries;
}

/** 数字状态码按码值排，pending/failed 这类哨兵值排在最后。 */
function statusOrder(value: string): number {
  if (value === PENDING_FACET_VALUE) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (value === FAILED_FACET_VALUE) {
    return Number.MAX_SAFE_INTEGER - 1;
  }
  const code = Number.parseInt(value, 10);
  return Number.isNaN(code) ? Number.MAX_SAFE_INTEGER : code;
}

/** 从全量 summary 镜像派生当前可见列表。 */
export function visibleCaptureRows(
  rows: readonly CaptureExchangeSummary[],
  filter: CaptureFilter,
): CaptureExchangeSummary[] {
  return rows.filter((row) => matchesCoreFilter(row, filter));
}

/** 是否有 facet 生效；驱动工具栏 badge 与清空筛选按钮。搜索是独立维度，不计入。 */
export function hasActiveFilter(filter: CaptureFilter): boolean {
  return CAPTURE_FACET_IDS.some((facet) => filter[CAPTURE_FACET_FIELDS[facet]].length > 0);
}

/** 由 summary 列表构建 id → 下标索引，供实时事件 O(1) 定位。 */
export function buildIndex(rows: CaptureExchangeSummary[]): Map<string, number> {
  const index = new Map<string, number>();
  rows.forEach((row, position) => index.set(row.id, position));
  return index;
}

/** 列表/详情展示的请求 path：showQueryParams 关闭时去掉 `?` 之后的 query 串，path 始终保留。 */
export function displayPath(path: string | undefined, showQueryParams: boolean): string {
  const value = path ?? '';
  if (showQueryParams) {
    return value;
  }
  const queryIndex = value.indexOf('?');
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}

/** Preserve the user's tab across request selection unless the new request cannot show it. */
export function retainInspectorTab(
  current: InspectorTab,
  available: readonly { id: InspectorTab }[],
  fallback: InspectorTab,
): InspectorTab {
  return available.some((item) => item.id === current) ? current : fallback;
}

export function headersToRows(headers: CaptureHeader[]): KvRow[] {
  // HTTP/2 伪首部（:method/:status 等）高亮区分于普通头。
  return headers.map((header) => [
    header.name,
    header.value,
    header.isPseudo ? 'a' : undefined,
    undefined,
    header.ruleEffect,
    header.ruleId,
  ]);
}

/** 从绝对/相对 URL 提取查询参数为 KV 行。 */
export function queryRows(url: string): KvRow[] {
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (!search) {
    return [];
  }
  const urlSearchParams = new URLSearchParams(search);
  return Array.from(urlSearchParams.entries(), ([key, value]) => [key, value] as KvRow);
}

/** 从捕获 URL 推断端口，缺失时按 scheme 回退（https→443、http→80）。 */
export function inferPort(url: string | undefined, scheme: string): number {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.port) {
        return Number(parsed.port);
      }
    } catch {
      /* URL 不可解析时按 scheme 回退。 */
    }
  }
  return scheme === 'https' || scheme === 'wss' ? 443 : 80;
}

/** 解析请求 Cookie 头（name=value; …）为 KV 行。 */
export function requestCookieRows(headers: CaptureHeader[]): KvRow[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'cookie')
    .flatMap((header) =>
      header.value
        .split(';')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const separator = pair.indexOf('=');
          return [
            separator === -1 ? pair : pair.slice(0, separator),
            separator === -1 ? '' : pair.slice(separator + 1),
            undefined,
            undefined,
            header.ruleEffect,
            header.ruleId,
          ] as KvRow;
        }),
    );
}

/** 收集响应 Set-Cookie 头（每条一行）为 KV 行。 */
export function responseCookieRows(headers: CaptureHeader[]): KvRow[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const separator = header.value.indexOf('=');
      return [
        separator === -1 ? header.value : header.value.slice(0, separator),
        header.value,
        undefined,
        undefined,
        header.ruleEffect,
        header.ruleId,
      ] as KvRow;
    });
}

export function isGrpcMime(value: string | undefined): boolean {
  const essence = value?.split(';', 1)[0]?.trim().toLowerCase();
  return essence === 'application/grpc'
    || essence?.startsWith('application/grpc+') === true;
}

/**
 * OpenSSL / Node 在**源站**证书校验失败时给出的错误码。
 * 只列 per-host 例外能解决的：链不可信、自签、过期、名称不匹配。
 * 协议协商类失败（EPROTO、ERR_SSL_*）加例外也没用，不在此列。
 */
const ORIGIN_CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

/** Whether this exchange failed because Interceptor could not verify the origin certificate. */
export function isOriginCertificateError(errorCode: string | undefined): boolean {
  return errorCode !== undefined && ORIGIN_CERTIFICATE_ERROR_CODES.has(errorCode);
}

export function formatTimestamp(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

/** 把未知失败收敛成可展示的一行文本。 */
export function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** 从响应头里取一个值（名称需已小写）。 */
export function readHeader(
  headers: CaptureExchangeDetail['responseHeaders'],
  name: string,
): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}

/** 证书有效期按语言格式化；无法解析时原样返回。 */
export function formatCertificateDate(
  value: string | undefined,
  locale: string,
): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

/** WebSocket 方向筛选映射到协议方向；all 不带方向条件。 */
export function filterDirection(
  filter: DirectionFilter,
): WebSocketFrameDirection | undefined {
  if (filter === 'sent') {
    return 'client-to-server';
  }
  if (filter === 'received') {
    return 'server-to-client';
  }
  return undefined;
}

/** pending行暂时代替同一Capture frame；只按Core分配的精确sequence过滤。 */
export function visibleWebSocketHistoryFrames(
  frames: readonly WebSocketFrameSummary[],
  pendingBreakpoints: readonly PendingBreakpoint[],
): WebSocketFrameSummary[] {
  const pendingSequences = new Set(
    pendingBreakpoints.flatMap((breakpoint) =>
      breakpoint.webSocketFrameSequence === undefined
        ? []
        : [breakpoint.webSocketFrameSequence]),
  );
  return frames.filter((frame) => !pendingSequences.has(frame.seq));
}

/** 帧时间相对会话起点显示，毫秒以内保留整数、超过则按秒。 */
export function frameRelativeTime(
  startedAt: number,
  timestamp: number,
  locale: string,
): string {
  const elapsed = Math.max(0, timestamp - startedAt);
  return elapsed < 1_000
    ? `+${new Intl.NumberFormat(locale).format(elapsed)} ms`
    : `+${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(elapsed / 1_000)} s`;
}

/** 二进制载荷复制为十六进制、文本载荷复制为原文。 */
export function payloadClipboardText(bytes: Uint8Array, asText: boolean): string {
  return asText
    ? new TextDecoder().decode(bytes)
    : Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

/** 导出范围折算成协议 scope；filter 范围展开为当前可见行的 ID 集合。 */
export function buildScope(
  kind: ExportScopeKind,
  selectedId: string | null,
  filter: CaptureFilter,
  rows: readonly CaptureExchangeSummary[],
): HarExportRequest['scope'] {
  if (kind === 'selected' && selectedId) {
    return { kind: 'selected', exchangeIds: [selectedId] };
  }
  if (kind === 'filter') {
    return {
      kind: 'selected',
      exchangeIds: visibleCaptureRows(rows, filter).map((row) => row.id),
    };
  }
  return { kind: 'all' };
}

/** 当前筛选条件的一行摘要；无条件时用调用方给的空态文案。 */
export function formatFilter(
  filter: CaptureFilter,
  emptyLabel: string,
): string {  const parts = [
    filter.search ? `search:${filter.search}` : '',
    filter.apps.length > 0 ? `app:${filter.apps.length}` : '',
    filter.methods.length > 0 ? `method:${filter.methods.join(',')}` : '',
    filter.hosts.length > 0 ? `host:${filter.hosts.join(',')}` : '',
    filter.statuses.length > 0 ? `status:${filter.statuses.join(',')}` : '',
    filter.protocols.length > 0 ? `protocol:${filter.protocols.join(',')}` : '',
    filter.types.length > 0 ? `type:${filter.types.join(',')}` : '',
    filter.ruleIds.length > 0 ? `rule:${filter.ruleIds.length}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : emptyLabel;
}

/** 列表是否停靠在底部；差距在一行以内就算贴底，新流量到达时继续自动跟随。 */
export function isScrolledToBottom(
  element: HTMLDivElement,
  rowHeight: number,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= rowHeight;
}
