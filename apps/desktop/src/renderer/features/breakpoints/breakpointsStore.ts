import { create } from 'zustand';

import type {
  BreakpointEdit,
  BreakpointsSnapshot,
  PendingBreakpoint,
} from '../../../shared/desktop-api';

/** 编辑草稿中的 header 行（带本地 id 便于增删）。 */
export interface EditHeaderRow {
  id: string;
  name: string;
  value: string;
}

/** 选中断点的可编辑草稿：请求用 method/url、响应用 statusCode，headers/body 两阶段通用。 */
export interface BreakpointDraft {
  breakpointId: string;
  phase: 'request' | 'response' | 'websocket';
  method: string;
  url: string;
  statusCode: number;
  direction?: 'client-to-server' | 'server-to-client';
  opcode?: 1 | 2;
  bodyFormat?: 'text' | 'hex';
  headers: EditHeaderRow[];
  body: string;
}

let sequence = 0;
function rowId(): string {
  sequence += 1;
  return `bph-${sequence}`;
}

function draftFromBreakpoint(breakpoint: PendingBreakpoint): BreakpointDraft {
  return {
    breakpointId: breakpoint.id,
    phase: breakpoint.phase,
    method: breakpoint.method ?? 'GET',
    url: breakpoint.url ?? '',
    statusCode: breakpoint.statusCode ?? 200,
    direction: breakpoint.direction,
    opcode: breakpoint.opcode,
    bodyFormat: breakpoint.bodyFormat,
    headers: breakpoint.headers.map((header) => ({
      id: rowId(),
      name: header.name,
      value: header.value,
    })),
    body: breakpoint.body ?? '',
  };
}

export interface BreakpointsState {
  breakpoints: PendingBreakpoint[];
  enabled: boolean;
  selectedId: string | null;
  draft: BreakpointDraft | null;
  resolving: boolean;

  applySnapshot(snapshot: BreakpointsSnapshot): void;
  select(id: string): void;
  setMethod(method: string): void;
  setUrl(url: string): void;
  setStatusCode(statusCode: number): void;
  setBody(body: string): void;
  addHeader(): void;
  updateHeader(id: string, patch: Partial<Omit<EditHeaderRow, 'id'>>): void;
  removeHeader(id: string): void;
  setResolving(resolving: boolean): void;
}

export const useBreakpointsStore = create<BreakpointsState>((set, get) => ({
  breakpoints: [],
  enabled: true,
  selectedId: null,
  draft: null,
  resolving: false,

  applySnapshot: (snapshot) =>
    set((state) => {
      const list = snapshot.breakpoints;
      let selectedId = state.selectedId;
      let draft = state.draft;

      // 选中项仍存在则保留草稿；消失则切到第一个并重建草稿。
      if (selectedId && !list.some((bp) => bp.id === selectedId)) {
        selectedId = null;
        draft = null;
      }
      if (!selectedId && list.length > 0) {
        selectedId = list[0]!.id;
        draft = draftFromBreakpoint(list[0]!);
      }
      if (list.length === 0) {
        selectedId = null;
        draft = null;
      }
      return { breakpoints: list, enabled: snapshot.enabled, selectedId, draft };
    }),

  select: (id) =>
    set((state) => {
      const breakpoint = state.breakpoints.find((bp) => bp.id === id);
      return breakpoint
        ? { selectedId: id, draft: draftFromBreakpoint(breakpoint) }
        : state;
    }),

  setMethod: (method) =>
    set((state) => (state.draft ? { draft: { ...state.draft, method } } : state)),
  setUrl: (url) =>
    set((state) => (state.draft ? { draft: { ...state.draft, url } } : state)),
  setStatusCode: (statusCode) =>
    set((state) => (state.draft ? { draft: { ...state.draft, statusCode } } : state)),
  setBody: (body) =>
    set((state) => (state.draft ? { draft: { ...state.draft, body } } : state)),

  addHeader: () =>
    set((state) =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              headers: [...state.draft.headers, { id: rowId(), name: '', value: '' }],
            },
          }
        : state),

  updateHeader: (id, patch) =>
    set((state) =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              headers: state.draft.headers.map((header) =>
                header.id === id ? { ...header, ...patch } : header),
            },
          }
        : state),

  removeHeader: (id) =>
    set((state) =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              headers: state.draft.headers.filter((header) => header.id !== id),
            },
          }
        : state),

  setResolving: (resolving) => set({ resolving }),
}));

/** 当前选中的断点（无选中返回 null）。 */
export function selectedBreakpoint(state: BreakpointsState): PendingBreakpoint | null {
  return state.breakpoints.find((bp) => bp.id === state.selectedId) ?? null;
}

/** 由草稿组装 BreakpointEdit（按阶段包含 method/url 或 statusCode，headers/body 通用）。 */
export function buildEdit(draft: BreakpointDraft): BreakpointEdit {
  const headers = draft.headers
    .filter((header) => header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));
  if (draft.phase === 'request') {
    return { method: draft.method, url: draft.url, headers, body: draft.body };
  }
  if (draft.phase === 'websocket') {
    return { body: draft.body };
  }
  return { statusCode: draft.statusCode, headers, body: draft.body };
}

/** 断点倒计时格式化（deadline 时间戳 → M:SS）；0/无超时显示 ∞。 */
export function formatCountdown(deadline: number): string {
  if (deadline <= 0) {
    return '∞';
  }
  const totalSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
