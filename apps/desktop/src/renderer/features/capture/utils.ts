import type {
  CaptureExchangeSummary,
  CaptureHeader,
} from '../../../shared/desktop-api';
import type {
  CaptureFilter,
  InspectorTab,
  ProtocolSegment,
  StatusKind,
  StructuredCaptureFilterField,
  StructuredCaptureFilterPatch,
  TimeLabels,
  TimingSegment,
} from './interfaces';

/** Parse one field-specific Omnibox value into a normalized filter patch. */
export function parseStructuredFilter(
  field: StructuredCaptureFilterField,
  rawValue: string,
): StructuredCaptureFilterPatch | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  switch (field) {
    case 'method':
      return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)
        ? { method: value.toUpperCase() }
        : null;
    case 'status': {
      const status = /^\d{3}$/.test(value) ? Number(value) : Number.NaN;
      return status >= 100 && status <= 599 ? { status } : null;
    }
    case 'host':
      return { host: value };
    case 'type':
      return { type: value.toLowerCase() };
    case 'duration': {
      const match = /^(?:>=?|≥)?\s*(\d+)\s*(?:ms)?$/i.exec(value);
      const minDurationMs = match?.[1] ? Number(match[1]) : Number.NaN;
      return Number.isSafeInteger(minDurationMs) && minDurationMs > 0
        ? { minDurationMs }
        : null;
    }
  }
}

/** Cookie headers live exclusively in the Cookies tab, not the generic Headers tab. */
export function headersWithoutCookies(headers: CaptureHeader[]): CaptureHeader[] {
  return headers.filter((header) => {
    const name = header.name.toLowerCase();
    return name !== 'cookie' && name !== 'set-cookie';
  });
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

/** 把 protocol 归入 Segmented 分段，用于列表分段过滤与命中判断。 */
export function protocolSegment(protocol: string): Exclude<ProtocolSegment, 'all'> | 'other' {
  const label = protocolLabel(protocol);
  if (label === 'h1') {
    return 'h1';
  }
  if (label === 'h2') {
    return 'h2';
  }
  if (label === 'ws') {
    return 'ws';
  }
  return 'other';
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

/** 人类可读的字节数；进行中或无正文显示破折号。 */
export function sizeLabel(bytes: number, locale = 'en'): string {
  const format = (value: number, maximumFractionDigits: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  if (bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${format(bytes, 0)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${format(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${format(bytes / (1024 * 1024), bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
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
  if (protocolSegment(summary.protocol) === 'ws') {
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

/** 判断摘要是否命中字段过滤（search/method/status/host/type/duration），供实时事件复用。 */
export function matchesCoreFilter(
  summary: CaptureExchangeSummary,
  filter: CaptureFilter,
): boolean {
  if (filter.method && summary.method.toUpperCase() !== filter.method.toUpperCase()) {
    return false;
  }
  if (filter.status !== null && summary.statusCode !== filter.status) {
    return false;
  }
  if (filter.host && !(summary.host ?? '').toLowerCase().includes(filter.host.toLowerCase())) {
    return false;
  }
  if (filter.type && !typeLabel(summary.responseMime).toLowerCase().includes(filter.type.toLowerCase())) {
    return false;
  }
  if (
    filter.minDurationMs !== null
    && (summary.durationMs === undefined || summary.durationMs < filter.minDurationMs)
  ) {
    return false;
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

/** 判断摘要是否命中当前 Segmented 分段（客户端视图过滤）。 */
export function matchesSegment(
  summary: CaptureExchangeSummary,
  segment: ProtocolSegment,
): boolean {
  return segment === 'all' || protocolSegment(summary.protocol) === segment;
}

/** 从全量 summary 镜像派生当前可见列表。 */
export function visibleCaptureRows(
  rows: readonly CaptureExchangeSummary[],
  filter: CaptureFilter,
): CaptureExchangeSummary[] {
  return rows.filter(
    (row) => matchesCoreFilter(row, filter) && matchesSegment(row, filter.segment),
  );
}

/** 由 summary 列表构建 id → 下标索引，供实时事件 O(1) 定位。 */
export function buildIndex(rows: CaptureExchangeSummary[]): Map<string, number> {
  const index = new Map<string, number>();
  rows.forEach((row, position) => index.set(row.id, position));
  return index;
}

/** Preserve the user's tab across request selection unless the new request cannot show it. */
export function retainInspectorTab(
  current: InspectorTab,
  available: readonly { id: InspectorTab }[],
  fallback: InspectorTab,
): InspectorTab {
  return available.some((item) => item.id === current) ? current : fallback;
}
