import { create } from 'zustand';

import type {
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  SessionsPage,
} from '../../../shared/desktop-api';
import type { ProtocolSegment } from './row-format';
import { protocolSegment } from './row-format';

/** 结构化过滤条件；segment 为客户端视图过滤，其余下推 Core 分页查询。 */
export interface CaptureFilter {
  segment: ProtocolSegment;
  search: string;
  method: string | null;
  status: number | null;
  host: string | null;
}

const EMPTY_FILTER: CaptureFilter = {
  segment: 'all',
  search: '',
  method: null,
  status: null,
  host: null,
};

/** 会话列表视图状态：只存 Exchange 摘要，不存 header/body。 */
export interface CaptureState {
  /** 命中当前 Core 过滤条件的行，按 startedAt 降序（最新在前）。 */
  rows: CaptureExchangeSummary[];
  /** id → rows 下标，供实时事件 O(1) 定位更新。 */
  indexById: Map<string, number>;
  selectedId: string | null;
  filter: CaptureFilter;
  /** Live tail 开关；关闭时忽略实时事件，仅保留已加载视图。 */
  live: boolean;
  /** 代理是否正在监听捕获（proxy.status.listening）。 */
  capturing: boolean;
  loading: boolean;
  hasMore: boolean;
  cursor: string | undefined;
  error: string | null;

  select(id: string | null): void;
  setSegment(segment: ProtocolSegment): void;
  setSearch(search: string): void;
  setStructuredFilter(
    patch: Partial<Pick<CaptureFilter, 'method' | 'status' | 'host'>>,
  ): void;
  setLive(live: boolean): void;
  setCapturing(capturing: boolean): void;
  clearView(): void;
  beginLoad(): void;
  loadFailed(message: string): void;
  replaceRows(page: SessionsPage): void;
  appendRows(page: SessionsPage): void;
  applyEvents(events: CaptureExchangeEvent[]): void;
}

/** 判断摘要是否命中 Core 过滤（search/method/status/host），供实时事件复用。 */
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
  live: true,
  capturing: false,
  loading: false,
  hasMore: false,
  cursor: undefined,
  error: null,

  select: (id) => set({ selectedId: id }),

  setSegment: (segment) =>
    set((state) => ({ filter: { ...state.filter, segment } })),

  setSearch: (search) =>
    set((state) => ({ filter: { ...state.filter, search } })),

  setStructuredFilter: (patch) =>
    set((state) => ({ filter: { ...state.filter, ...patch } })),

  setLive: (live) => set({ live }),

  setCapturing: (capturing) => set({ capturing }),

  clearView: () =>
    set({
      rows: [],
      indexById: new Map(),
      selectedId: null,
      cursor: undefined,
      hasMore: false,
      error: null,
    }),

  beginLoad: () => set({ loading: true, error: null }),

  loadFailed: (message) => set({ loading: false, error: message }),

  replaceRows: (page) =>
    set({
      rows: page.items,
      indexById: buildIndex(page.items),
      cursor: page.nextCursor,
      hasMore: page.hasMore,
      loading: false,
      error: null,
    }),

  appendRows: (page) =>
    set((state) => {
      const merged = state.rows.slice();
      for (const item of page.items) {
        if (!state.indexById.has(item.id)) {
          merged.push(item);
        }
      }
      return {
        rows: merged,
        indexById: buildIndex(merged),
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        loading: false,
      };
    }),

  applyEvents: (events) => {
    const state = get();
    if (!state.live || events.length === 0) {
      return;
    }
    const rows = state.rows.slice();
    const inserts: CaptureExchangeSummary[] = [];
    let mutated = false;

    for (const event of events) {
      if (!matchesCoreFilter(event.summary, state.filter)) {
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
      // 实时新增的 Exchange 时间戳单调递增，作为一整块前插即保持 startedAt 降序。
      inserts.sort((a, b) => b.startedAt - a.startedAt);
      const next = [...inserts, ...rows];
      set({ rows: next, indexById: buildIndex(next) });
    } else if (mutated) {
      set({ rows });
    }
  },
}));
