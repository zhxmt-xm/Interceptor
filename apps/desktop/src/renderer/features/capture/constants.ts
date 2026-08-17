import type { CaptureFacetId, CaptureFilter } from './interfaces';

export const INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'request', labelKey: 'capture.request' },
  { id: 'response', labelKey: 'capture.response' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'cookies', labelKey: 'capture.cookies' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const WEBSOCKET_INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'messages', labelKey: 'capture.messages' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const GRPC_INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'grpc', labelKey: 'capture.messages' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const TLS_TUNNEL_INSPECTOR_TABS = [
  { id: 'tunnel', labelKey: 'capture.tlsTunnel' },
] as const;

/** 筛选分栏的分组顺序，严格跟随列表表头。 */
export const CAPTURE_FACET_IDS = [
  'application',
  'method',
  'host',
  'status',
  'protocol',
  'type',
  'rule',
] as const satisfies readonly CaptureFacetId[];

/** 无法归属到本机应用的请求在 Application facet 里的值。 */
export const UNKNOWN_FACET_VALUE = '\u0000unknown';
/** 上游连接失败、没有状态码的请求在 Status facet 里的值。 */
export const FAILED_FACET_VALUE = '\u0000failed';
/** Application/Status/Type 尚未完成解析时共用的稳定 Pending bucket 值。 */
export const PENDING_FACET_VALUE = '\u0000pending';

/** Protocol facet 按版本从新到旧排，隧道放最后。 */
export const PROTOCOL_FACET_ORDER: readonly string[] = [
  'HTTP/2',
  'HTTP/1.1',
  'HTTP/1.0',
  'WebSocket',
  'TLS tunnel',
];

/** 空过滤条件初值：无搜索、所有 facet 均为 All。 */
export const EMPTY_FILTER: CaptureFilter = {
  search: '',
  apps: [],
  methods: [],
  hosts: [],
  statuses: [],
  protocols: [],
  types: [],
  ruleIds: [],
};

/** 每组 facet 默认最多显示的条目数，其余折叠到 Show more 之后。 */
export const FACET_COLLAPSED_LIMIT = 8;

/** facet 计数的重算间隔；实时流量下每条事件都重算会让整个分栏持续刷新。 */
export const FACET_REFRESH_MS = 600;

/** facet 分组标题的词条 key。 */
export const FACET_LABEL_KEYS = {
  application: 'capture.application',
  method: 'capture.method',
  host: 'capture.host',
  status: 'capture.status',
  protocol: 'capture.protocol',
  type: 'capture.contentType',
  rule: 'capture.rule',
} as const;

/** 文件任务标题的词条 key。 */
export const TRANSFER_HEADING_KEYS = {
  'har-import': 'capture.importingHar',
  'har-export': 'capture.exportingHar',
  'archive-import': 'capture.importingArchive',
  'archive-export': 'capture.exportingArchive',
  'diagnostics-export': 'capture.exportingDiagnostics',
  'body-export': 'capture.savingBody',
} as const;
