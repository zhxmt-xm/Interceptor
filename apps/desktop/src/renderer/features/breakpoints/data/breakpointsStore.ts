import { create } from 'zustand';

import type { BreakpointDraft, BreakpointsState } from '../interfaces';
import { draftFromBreakpoint, rowId } from '../utils';

/** Append non-empty normalized header names while preserving first-edit order. */
function rememberEditedHeaderNames(
  editedHeaderNames: readonly string[],
  ...headerNames: readonly string[]
): string[] {
  const remembered = [...editedHeaderNames];
  for (const headerName of headerNames) {
    const normalizedName = headerName.trim().toLowerCase();
    if (normalizedName !== '' && !remembered.includes(normalizedName)) {
      remembered.push(normalizedName);
    }
  }
  return remembered;
}

/** 更新当前草稿并同步回它自己的breakpointId槽位。 */
function updateSelectedDraft(
  state: BreakpointsState,
  update: (draft: BreakpointDraft) => BreakpointDraft,
): BreakpointsState | Partial<BreakpointsState> {
  if (!state.draft) {
    return state;
  }
  const draft = update(state.draft);
  return {
    draft,
    draftsById: {
      ...state.draftsById,
      [draft.breakpointId]: draft,
    },
  };
}

export const useBreakpointsStore = create<BreakpointsState>((set, get) => ({
  breakpoints: [],
  enabled: true,
  selectedId: null,
  draftsById: {},
  draft: null,
  resolving: false,

  applySnapshot: (snapshot) =>
    set((state) => {
      const list = snapshot.breakpoints;
      const draftsById = Object.fromEntries(list.map((breakpoint) => [
        breakpoint.id,
        state.draftsById[breakpoint.id] ?? draftFromBreakpoint(breakpoint),
      ]));
      const selectedId = state.selectedId && list.some((breakpoint) => breakpoint.id === state.selectedId)
        ? state.selectedId
        : list[0]?.id ?? null;
      const draft = selectedId ? draftsById[selectedId] ?? null : null;
      return {
        breakpoints: list,
        enabled: snapshot.enabled,
        selectedId,
        draftsById,
        draft,
      };
    }),

  select: (id) =>
    set((state) => {
      const breakpoint = state.breakpoints.find((bp) => bp.id === id);
      const draft = breakpoint
        ? state.draftsById[id] ?? draftFromBreakpoint(breakpoint)
        : null;
      return breakpoint
        ? {
            selectedId: id,
            draft,
            draftsById: { ...state.draftsById, [id]: draft! },
          }
        : state;
    }),

  clear: () =>
    set({
      breakpoints: [],
      selectedId: null,
      draftsById: {},
      draft: null,
      resolving: false,
    }),

  setMethod: (method) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, method }))),
  setUrl: (url) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, url }))),
  setStatusCode: (statusCode) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, statusCode }))),
  setCloseCode: (closeCode) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, closeCode }))),
  setReplacement: (replacement) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, replacement }))),
  setFile: (file) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, file }))),
  setBody: (body) =>
    set((state) => updateSelectedDraft(state, (draft) => ({ ...draft, body }))),

  addHeader: () =>
    set((state) => updateSelectedDraft(state, (draft) => ({
      ...draft,
      headers: [...draft.headers, { id: rowId(), name: '', value: '' }],
    }))),

  updateHeader: (id, patch) =>
    set((state) => {
      if (!state.draft) {
        return state;
      }
      const currentHeader = state.draft.headers.find((header) => header.id === id);
      if (!currentHeader) {
        return state;
      }
      const nextHeader = { ...currentHeader, ...patch };
      return updateSelectedDraft(state, (draft) => ({
        ...draft,
        headers: draft.headers.map((header) =>
          header.id === id ? nextHeader : header),
        editedHeaderNames: rememberEditedHeaderNames(
          draft.editedHeaderNames,
          currentHeader.name,
          nextHeader.name,
        ),
      }));
    }),

  removeHeader: (id) =>
    set((state) => {
      if (!state.draft) {
        return state;
      }
      const removedHeader = state.draft.headers.find((header) => header.id === id);
      return updateSelectedDraft(state, (draft) => ({
        ...draft,
        headers: draft.headers.filter((header) => header.id !== id),
        editedHeaderNames: rememberEditedHeaderNames(
          draft.editedHeaderNames,
          removedHeader?.name ?? '',
        ),
      }));
    }),

  setResolving: (resolving) => set({ resolving }),
}));
