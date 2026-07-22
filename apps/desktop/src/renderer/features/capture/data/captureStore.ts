import { create } from 'zustand';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { EMPTY_FILTER } from '../constants';
import type { CaptureState } from '../interfaces';
import { buildIndex } from '../utils';

/** path 是否展示 query 参数的持久化键。 */
const QUERY_PARAMS_KEY = 'interceptor.capture.showQueryParams';

/** 读取持久化的 query 参数显示偏好；缺失或异常时默认关闭（不显示 params）。 */
function loadShowQueryParams(): boolean {
  try {
    return window.localStorage.getItem(QUERY_PARAMS_KEY) === '1';
  } catch {
    return false;
  }
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
  showQueryParams: loadShowQueryParams(),

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

  toggleQueryParams: () =>
    set((state) => {
      const showQueryParams = !state.showQueryParams;
      try {
        window.localStorage.setItem(QUERY_PARAMS_KEY, showQueryParams ? '1' : '0');
      } catch {
        /* localStorage 不可用时保持内存状态即可。 */
      }
      return { showQueryParams };
    }),

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
