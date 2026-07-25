import type {
  CaptureExchangeEvent,
  CaptureExchangeSummary,
} from '../../../shared/desktop-api';
import {
  GRPC_INSPECTOR_TABS,
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
  WEBSOCKET_INSPECTOR_TABS,
} from './constants';

/** 列表状态点的语义分类，对应 RequestRow.module.css 的 ok/warn/err/info2。 */
export type StatusKind = 'ok' | 'warn' | 'err' | 'info2';

/** 协议分段（列表顶部 Segmented：All / H1 / H2 / WS）。 */
export type ProtocolSegment = 'all' | 'h1' | 'h2' | 'ws';

export interface TimeLabels {
  closed: string;
  open: string;
  failed: string;
}

export interface TimingSegment {
  readonly id: 'waiting' | 'download';
  readonly durationMs: number;
  readonly offsetPercent: number;
  readonly widthPercent: number;
}

/** Inspector 可用 tab id 集合，随请求类型（HTTP / WebSocket / gRPC / TLS 隧道）而不同。 */
export type InspectorTab =
  | (typeof INSPECTOR_TABS)[number]['id']
  | (typeof WEBSOCKET_INSPECTOR_TABS)[number]['id']
  | (typeof GRPC_INSPECTOR_TABS)[number]['id']
  | (typeof TLS_TUNNEL_INSPECTOR_TABS)[number]['id'];

export type CaptureTransferAction =
  | 'har-import'
  | 'har-export'
  | 'archive-import'
  | 'archive-export';

export interface ProxyReadinessIssue {
  kind: 'listener' | 'system-proxy';
  ownershipLost: boolean;
  message: string | null;
}

/** 结构化过滤条件；method/status/ruleIds 由 Add filter 级联多选当前列表出现的值。 */
export interface CaptureFilter {
  segment: ProtocolSegment;
  search: string;
  method: string[];
  status: number[];
  /** 多个规则按 OR 匹配；与 method/status/search 之间仍为 AND。 */
  ruleIds: string[];
}

export type StructuredCaptureFilterField = 'method' | 'status' | 'ruleIds';

export type StructuredCaptureFilterPatch = Partial<
  Pick<CaptureFilter, 'method' | 'status' | 'ruleIds'>
>;

/** Add filter 级联的单个可选值及其在当前列表中的出现次数。 */
export interface FilterValueOption<T extends string | number> {
  readonly value: T;
  readonly count: number;
}

/** 会话列表视图状态：只存 Exchange 摘要，不存 header/body。 */
export interface CaptureState {
  /** 当前 Recording 的全部轻量 Exchange summary，按 startedAt 升序（最新在末尾）。 */
  rows: CaptureExchangeSummary[];
  /** id → rows 下标，供实时事件 O(1) 定位更新。 */
  indexById: Map<string, number>;
  selectedId: string | null;
  filter: CaptureFilter;
  /** 最近一次持久化清空的点击时间；更早开始的迟到事件不得重新进入视图。 */
  clearedBefore: number;
  /** 代理是否正在监听捕获（proxy.status.listening）。 */
  capturing: boolean;
  loading: boolean;
  /** Clear/Core 代际切换时递增，阻止旧分页结果回填。 */
  syncRevision: number;
  error: string | null;
  /** 当前文件传输命令；null 表示弹层关闭。 */
  transferAction: CaptureTransferAction | null;
  /** Listener 或系统代理未就绪时的统一用户引导状态。 */
  proxyReadinessIssue: ProxyReadinessIssue | null;
  /** 切换 feature 前的列表滚动位置；Capture 重新挂载时恢复。 */
  listScrollTop: number;
  /** 用户最后选择的 Inspector tab；仅在新请求类型不支持时 fallback。 */
  inspectorTab: InspectorTab;
  /** 用户拖拽后的 Inspector 宽度；Capture 重新挂载时恢复。 */
  inspectorWidth: number;
  /** 列表/详情 path 是否展示 query 参数；默认关闭（只显示 path，不含 params）。持久化到 localStorage。 */
  showQueryParams: boolean;

  select(id: string | null): void;
  setSegment(segment: ProtocolSegment): void;
  setSearch(search: string): void;
  setStructuredFilter(patch: StructuredCaptureFilterPatch): void;
  filterByRule(ruleId: string): void;
  setCapturing(capturing: boolean): void;
  setTransferAction(action: CaptureTransferAction | null): void;
  setProxyReadinessIssue(issue: ProxyReadinessIssue | null): void;
  setListScrollTop(scrollTop: number): void;
  setInspectorTab(tab: InspectorTab): void;
  setInspectorWidth(width: number): void;
  /** 切换列表/详情 path 是否包含 query 参数，并持久化。 */
  toggleQueryParams(): void;
  clearView(clearedBefore?: number): void;
  beginLoad(): number;
  loadFailed(message: string): void;
  replaceAllRows(rows: CaptureExchangeSummary[], syncRevision: number): void;
  applyEvents(events: CaptureExchangeEvent[]): void;
}
