import type { ReactNode } from 'react';

import type {
  CaptureExchangeEvent,
  CaptureHeaderRuleEffect,
  ClientAppIcon,
  CaptureExchangeSummary,
  HarExportRequest,
} from '../../../shared/desktop-api';
import {
  GRPC_INSPECTOR_TABS,
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
  WEBSOCKET_INSPECTOR_TABS,
} from './constants';

/** 列表状态点的语义分类，对应 RequestRow.module.css 的 ok/warn/err/info2。 */
export type StatusKind = 'ok' | 'warn' | 'err' | 'info2';

/** Inspector 里一行键值；后四项只在头部与 Cookie 行上出现。 */
export type KvRow = [
  key: string,
  value: ReactNode,
  accent?: 'a' | 'g',
  copyText?: string,
  ruleEffect?: CaptureHeaderRuleEffect,
  ruleId?: string,
];

/** WebSocket 帧列表的方向筛选。 */
export type DirectionFilter = 'all' | 'sent' | 'received';

/** 导出范围：全部 / 当前筛选 / 当前选中。 */
export type ExportScopeKind = HarExportRequest['scope']['kind'];

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

/** 筛选分栏的 facet 分组，顺序与列表表头一致。 */
export type CaptureFacetId =
  | 'application'
  | 'method'
  | 'host'
  | 'status'
  | 'protocol'
  | 'type'
  | 'rule';

/**
 * 结构化过滤条件：每个 facet 组内多选按 OR，组间按 AND；search 与所有 facet 之间同样是 AND。
 * 所有 facet 值统一用 string，状态码用十进制字符串、失败请求用 'failed'。
 */
export interface CaptureFilter {
  search: string;
  apps: string[];
  methods: string[];
  hosts: string[];
  statuses: string[];
  protocols: string[];
  types: string[];
  ruleIds: string[];
}

/** facet 分组到 CaptureFilter 字段的映射，UI 与过滤逻辑共用一张表。 */
export const CAPTURE_FACET_FIELDS = {
  application: 'apps',
  method: 'methods',
  host: 'hosts',
  status: 'statuses',
  protocol: 'protocols',
  type: 'types',
  rule: 'ruleIds',
} as const satisfies Record<CaptureFacetId, keyof Omit<CaptureFilter, 'search'>>;

/** facet 的单个可选值及其在当前列表中的出现次数。 */
export interface FilterValueOption {
  readonly value: string;
  readonly count: number;
}

/** 底栏展示的抓包链路状态；只包含别处拿不到的全局事实。 */
export interface CaptureLinkStatus {
  /** 本地监听端点；listener 未就绪时为 null。 */
  endpoint: { host: string; port: number } | null;
  /** 系统代理是否已由本应用接管。 */
  systemProxyOwned: boolean;
  /** CA 已信任且 MITM 已开启，即正在解密 HTTPS。 */
  decrypting: boolean;
  /** 抓包流量再转发给的上游代理 host:port；null 表示直连源站。 */
  upstream: string | null;
  /** 上游是否可达；false 表示已临时降级为直连。 */
  upstreamReachable: boolean;
}

/** 会话列表视图状态：只存 Exchange 摘要，不存 header/body。 */
export interface CaptureState {
  /** 当前 Recording 的全部轻量 Exchange summary，按 startedAt 升序（最新在末尾）。 */
  rows: CaptureExchangeSummary[];
  /** id → rows 下标，供实时事件 O(1) 定位更新。 */
  indexById: Map<string, number>;
  selectedId: string | null;
  filter: CaptureFilter;
  /** 左侧筛选分栏是否展开；收起后仍由工具栏 badge 提示列表正被过滤。 */
  filtersOpen: boolean;
  /** 用户拖拽后的筛选分栏宽度。 */
  filterPanelWidth: number;
  /** 用户手动展开的 facet 分组；有值生效的分组无条件展开。 */
  expandedFacets: CaptureFacetId[];
  /** 最近一次已提交清空的单调时间边界；更早开始的迟到事件不得重新进入视图。 */
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
  /** 底栏链路状态；由 refreshLinkStatus 在监听、代理或证书变化后刷新。 */
  linkStatus: CaptureLinkStatus;
  /** HTTPS 解密引导弹层；底栏、Inspector Tunnel 面板都可触发。 */
  httpsSetupOpen: boolean;
  /** 切换 feature 前的列表滚动位置；Capture 重新挂载时恢复。 */
  listScrollTop: number;
  /** 用户最后选择的 Inspector tab；仅在新请求类型不支持时 fallback。 */
  inspectorTab: InspectorTab;
  /** 用户拖拽后的 Inspector 宽度；Capture 重新挂载时恢复。 */
  inspectorWidth: number;
  /** 列表/详情 path 是否展示 query 参数；默认关闭（只显示 path，不含 params）。持久化到 localStorage。 */
  showQueryParams: boolean;
  /**
   * 已收到的本机应用图标：应用 id → PNG data URL（不可读为 null）。
   * Main 取到图标才推送，通常晚于 Exchange 到达，因此必须是响应式状态。
   */
  clientAppIcons: Map<string, string | null>;

  select(id: string | null): void;
  setSearch(search: string): void;
  /** 在 facet 组内切换单个值；组内多选按 OR。 */
  toggleFacetValue(facet: CaptureFacetId, value: string): void;
  /** 把某个 facet 组恢复到 All。 */
  clearFacet(facet: CaptureFacetId): void;
  /** 清空搜索与全部 facet。 */
  clearAllFilters(): void;
  toggleFacetExpanded(facet: CaptureFacetId): void;
  toggleFiltersOpen(): void;
  setFilterPanelWidth(width: number): void;
  filterByRule(ruleId: string): void;
  setCapturing(capturing: boolean): void;
  setTransferAction(action: CaptureTransferAction | null): void;
  setProxyReadinessIssue(issue: ProxyReadinessIssue | null): void;
  setLinkStatus(status: CaptureLinkStatus): void;
  setHttpsSetupOpen(open: boolean): void;
  setListScrollTop(scrollTop: number): void;
  setInspectorTab(tab: InspectorTab): void;
  setInspectorWidth(width: number): void;
  /** 切换列表/详情 path 是否包含 query 参数，并持久化。 */
  toggleQueryParams(): void;
  clearView(clearedBefore: number): void;
  beginLoad(): number;
  loadFailed(message: string): void;
  replaceAllRows(rows: CaptureExchangeSummary[], syncRevision: number): void;
  applyEvents(events: CaptureExchangeEvent[]): void;
  applyClientAppIcons(icons: ClientAppIcon[]): void;
}
