import { create } from 'zustand';

import type { BreakpointsState } from '../interfaces';
import { draftFromBreakpoint, rowId } from '../utils';

export const useBreakpointsStore = create<BreakpointsState>((set, get) => ({
  breakpoints: [],
  enabled: true,
  autoContinued: 0,
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
      return {
        breakpoints: list,
        enabled: snapshot.enabled,
        autoContinued: snapshot.autoContinued,
        selectedId,
        draft,
      };
    }),

  select: (id) =>
    set((state) => {
      const breakpoint = state.breakpoints.find((bp) => bp.id === id);
      return breakpoint
        ? { selectedId: id, draft: draftFromBreakpoint(breakpoint) }
        : state;
    }),

  clear: () =>
    set({ breakpoints: [], selectedId: null, draft: null, resolving: false }),

  setMethod: (method) =>
    set((state) => (state.draft ? { draft: { ...state.draft, method } } : state)),
  setUrl: (url) =>
    set((state) => (state.draft ? { draft: { ...state.draft, url } } : state)),
  setStatusCode: (statusCode) =>
    set((state) => (state.draft ? { draft: { ...state.draft, statusCode } } : state)),
  setReplacement: (replacement) =>
    set((state) => (state.draft ? { draft: { ...state.draft, replacement } } : state)),
  setFile: (file) =>
    set((state) => (state.draft ? { draft: { ...state.draft, file } } : state)),
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
