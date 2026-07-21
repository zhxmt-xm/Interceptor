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

/** 结构化过滤条件；segment/type/duration 为客户端视图过滤，其余可下推 Core 分页查询。 */
export interface CaptureFilter {
  segment: ProtocolSegment;
  search: string;
  method: string | null;
  status: number | null;
  host: string | null;
  /** 响应类型短标签（json/js/html/font…）子串匹配，对齐列表 Type 列。 */
  type: string | null;
  /** 最小耗时（毫秒）；仅保留 durationMs ≥ 该值的已完成 Exchange。 */
  minDurationMs: number | null;
}

export type StructuredCaptureFilterField =
  | 'method'
  | 'status'
  | 'host'
  | 'type'
  | 'duration';

export type StructuredCaptureFilterPatch = Partial<
  Pick<CaptureFilter, 'method' | 'status' | 'host' | 'type' | 'minDurationMs'>
>;

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

  select(id: string | null): void;
  setSegment(segment: ProtocolSegment): void;
  setSearch(search: string): void;
  setStructuredFilter(
    patch: Partial<
      Pick<CaptureFilter, 'method' | 'status' | 'host' | 'type' | 'minDurationMs'>
    >,
  ): void;
  setCapturing(capturing: boolean): void;
  setTransferAction(action: CaptureTransferAction | null): void;
  setProxyReadinessIssue(issue: ProxyReadinessIssue | null): void;
  setListScrollTop(scrollTop: number): void;
  setInspectorTab(tab: InspectorTab): void;
  setInspectorWidth(width: number): void;
  clearView(clearedBefore?: number): void;
  beginLoad(): number;
  loadFailed(message: string): void;
  replaceAllRows(rows: CaptureExchangeSummary[], syncRevision: number): void;
  applyEvents(events: CaptureExchangeEvent[]): void;
}
