import { create } from 'zustand';

import type {
  CaptureExchangeEvent,
  CaptureExchangeSummary,
} from '../../../shared/desktop-api';
import type { ProtocolSegment } from './row-format';
import type { InspectorTab } from './data';
import { protocolSegment, typeLabel } from './row-format';

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

const EMPTY_FILTER: CaptureFilter = {
  segment: 'all',
  search: '',
  method: null,
  status: null,
  host: null,
  type: null,
  minDurationMs: null,
};

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

function buildIndex(rows: CaptureExchangeSummary[]): Map<string, number> {
  const index = new Map<string, number>();
  rows.forEach((row, position) => index.set(row.id, position));
  return index;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  rows: [],
  indexById: new Map(),
  selectedId: null,
  filter: EMPTY_FILTER,
  clearedBefore: 0,
  capturing: false,
  loading: false,
  syncRevision: 0,
  error: null,
  transferAction: null,
  proxyReadinessIssue: null,
  listScrollTop: 0,
  inspectorTab: 'headers',
  inspectorWidth: 500,

  select: (id) => set({ selectedId: id }),

  setSegment: (segment) =>
    set((state) => ({ filter: { ...state.filter, segment } })),

  setSearch: (search) =>
    set((state) => ({ filter: { ...state.filter, search } })),

  setStructuredFilter: (patch) =>
    set((state) => ({ filter: { ...state.filter, ...patch } })),

  setCapturing: (capturing) => set({ capturing }),

  setTransferAction: (transferAction) => set({ transferAction }),

  setProxyReadinessIssue: (proxyReadinessIssue) => set({
    proxyReadinessIssue,
    ...(proxyReadinessIssue ? { capturing: false } : {}),
  }),

  setListScrollTop: (listScrollTop) => set({ listScrollTop }),

  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  setInspectorWidth: (inspectorWidth) => set({ inspectorWidth }),

  clearView: (clearedBefore = get().clearedBefore) =>
    set((state) => ({
      rows: [],
      indexById: new Map(),
      selectedId: null,
      listScrollTop: 0,
      clearedBefore,
      syncRevision: state.syncRevision + 1,
      loading: false,
      error: null,
    })),

  beginLoad: () => {
    const revision = get().syncRevision;
    set({ loading: true, error: null });
    return revision;
  },

  loadFailed: (message) => set({ loading: false, error: message }),

  replaceAllRows: (loadedRows, syncRevision) => {
    if (get().syncRevision !== syncRevision) {
      return;
    }
    set((state) => {
      const byId = new Map(
        loadedRows.map((row) => [row.id, row] as const),
      );
      for (const row of state.rows) {
        if (row.startedAt > state.clearedBefore) {
          byId.set(row.id, row);
        }
      }
      const rows = Array.from(byId.values()).sort(
        (left, right) => left.startedAt - right.startedAt,
      );
      return {
        rows,
        indexById: buildIndex(rows),
        loading: false,
        error: null,
      };
    });
  },

  applyEvents: (events) => {
    const state = get();
    if (events.length === 0) {
      return;
    }
    const rows = state.rows.slice();
    const inserts: CaptureExchangeSummary[] = [];
    let mutated = false;

    for (const event of events) {
      if (event.summary.startedAt <= state.clearedBefore) {
        continue;
      }
      const position = state.indexById.get(event.summary.id);
      if (position !== undefined) {
        rows[position] = event.summary;
        mutated = true;
      } else {
        inserts.push(event.summary);
      }
    }

    if (inserts.length > 0) {
      // 实时新增的 Exchange 时间戳单调递增，作为一整块后插即保持 startedAt 升序（最新在末尾）。
      inserts.sort((a, b) => a.startedAt - b.startedAt);
      const next = [...rows, ...inserts];
      set({ rows: next, indexById: buildIndex(next) });
    } else if (mutated) {
      set({ rows });
    }
  },
}));
