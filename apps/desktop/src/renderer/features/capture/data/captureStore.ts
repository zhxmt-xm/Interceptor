import { create } from 'zustand';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { EMPTY_FILTER } from '../constants';
import { CAPTURE_FACET_FIELDS, type CaptureState } from '../interfaces';
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
  filtersOpen: true,
  filterPanelWidth: 200,
  expandedFacets: ['application'],
  clearedBefore: 0,
  capturing: false,
  loading: false,
  syncRevision: 0,
  error: null,
  transferAction: null,
  proxyReadinessIssue: null,
  linkStatus: {
    endpoint: null,
    systemProxyOwned: false,
    decrypting: false,
    upstream: null,
    upstreamReachable: true,
  },
  httpsSetupOpen: false,
  listScrollTop: 0,
  inspectorTab: 'headers',
  inspectorWidth: 448,
  showQueryParams: loadShowQueryParams(),
  clientAppIcons: new Map(),

  select: (id) => set({ selectedId: id }),

  setSearch: (search) =>
    set((state) => ({ filter: { ...state.filter, search } })),

  toggleFacetValue: (facet, value) => set((state) => {
    const field = CAPTURE_FACET_FIELDS[facet];
    const selected = state.filter[field];
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    return { filter: { ...state.filter, [field]: next } };
  }),

  clearFacet: (facet) => set((state) => ({
    filter: { ...state.filter, [CAPTURE_FACET_FIELDS[facet]]: [] },
  })),

  // 搜索是独立维度：清空筛选只重置 facet，不动搜索框。
  clearAllFilters: () => set((state) => ({ filter: { ...EMPTY_FILTER, search: state.filter.search } })),

  toggleFacetExpanded: (facet) => set((state) => ({
    expandedFacets: state.expandedFacets.includes(facet)
      ? state.expandedFacets.filter((entry) => entry !== facet)
      : [...state.expandedFacets, facet],
  })),

  toggleFiltersOpen: () => set((state) => ({ filtersOpen: !state.filtersOpen })),

  setFilterPanelWidth: (filterPanelWidth) => set({ filterPanelWidth }),

  filterByRule: (ruleId) => set((state) => ({
    filter: { ...EMPTY_FILTER, ruleIds: [ruleId] },
    expandedFacets: state.expandedFacets.includes('rule')
      ? state.expandedFacets
      : [...state.expandedFacets, 'rule'],
    selectedId: [...state.rows].reverse()
      .find((row) => row.ruleIds?.includes(ruleId))?.id ?? null,
    listScrollTop: 0,
  })),

  setCapturing: (capturing) => set({ capturing }),

  setTransferAction: (transferAction) => set({ transferAction }),

  setLinkStatus: (linkStatus) => set({ linkStatus }),

  setHttpsSetupOpen: (httpsSetupOpen) => set({ httpsSetupOpen }),

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

  clearView: (clearedBefore) =>
    set((state) => {
      if (clearedBefore <= state.clearedBefore) {
        return {};
      }
      const rows = state.rows.filter((row) => row.startedAt > clearedBefore);
      return {
        rows,
        indexById: buildIndex(rows),
        selectedId: null,
        listScrollTop: 0,
        clearedBefore,
        syncRevision: state.syncRevision + 1,
        loading: false,
        error: null,
      };
    }),

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
        byId.set(row.id, row);
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

  applyClientAppIcons: (icons) => {
    if (icons.length === 0) {
      return;
    }
    const next = new Map(get().clientAppIcons);
    for (const { clientAppId, icon } of icons) {
      next.set(clientAppId, icon);
    }
    set({ clientAppIcons: next });
  },
}));
