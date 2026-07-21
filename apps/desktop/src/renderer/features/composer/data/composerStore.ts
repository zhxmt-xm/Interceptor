import { create } from 'zustand';

import { MAX_HISTORY } from '../constants';
import type { ComposerState, HistoryEntry } from '../interfaces';
import { defaultHeaders, nextId } from '../utils';

export const useComposerStore = create<ComposerState>((set) => ({
  method: 'GET',
  url: 'https://',
  protocol: 'auto',
  headers: defaultHeaders(),
  body: '',
  auth: { type: 'none', token: '', username: '', password: '' },
  requestTab: 'headers',
  responseTab: 'body',
  response: null,
  sending: false,
  sendError: null,
  history: [],

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setProtocol: (protocol) => set({ protocol }),
  setBody: (body) => set({ body }),
  setAuth: (patch) => set((state) => ({ auth: { ...state.auth, ...patch } })),
  setRequestTab: (requestTab) => set({ requestTab }),
  setResponseTab: (responseTab) => set({ responseTab }),

  addHeader: () =>
    set((state) => ({
      headers: [...state.headers, { id: nextId(), name: '', value: '', on: true }],
    })),

  updateHeader: (id, patch) =>
    set((state) => ({
      headers: state.headers.map((header) =>
        header.id === id ? { ...header, ...patch } : header),
    })),

  removeHeader: (id) =>
    set((state) => ({
      headers: state.headers.filter((header) => header.id !== id),
    })),

  setQueryParams: (params) =>
    set((state) => {
      try {
        const url = new URL(state.url);
        url.search = '';
        for (const param of params) {
          if (param.name) {
            url.searchParams.append(param.name, param.value);
          }
        }
        return { url: url.toString() };
      } catch {
        return state;
      }
    }),

  beginSend: () => set({ sending: true, sendError: null }),

  sendSucceeded: (response) =>
    set((state) => {
      const entry: HistoryEntry = {
        id: nextId(),
        method: state.method,
        url: state.url,
        at: Date.now(),
        status: response.status,
        ok: response.ok,
        durationMs: response.durationMs,
      };
      return {
        response,
        sending: false,
        responseTab: 'body',
        history: [entry, ...state.history].slice(0, MAX_HISTORY),
      };
    }),

  sendFailed: (message) => set({ sending: false, sendError: message }),

  resetForNew: () =>
    set({
      method: 'GET',
      url: 'https://',
      protocol: 'auto',
      headers: defaultHeaders(),
      body: '',
      auth: { type: 'none', token: '', username: '', password: '' },
      requestTab: 'headers',
      response: null,
      sendError: null,
    }),

  loadFromHistory: (entry) =>
    set({ method: entry.method, url: entry.url, response: null, sendError: null }),
}));
