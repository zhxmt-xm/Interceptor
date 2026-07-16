import { create } from 'zustand';

import type {
  ComposerResponse,
  RuleHeaderPair,
} from '../../../shared/desktop-api';

export type ComposerProtocol = 'auto' | 'http/1.1' | 'h2';
export type RequestTab = 'headers' | 'query' | 'body' | 'auth';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'raw';
export type AuthType = 'none' | 'bearer' | 'basic';

/** 可编辑的 header 行：启用开关 + 名/值（发送时只取启用项）。 */
export interface HeaderRow {
  id: string;
  name: string;
  value: string;
  on: boolean;
}

export interface ComposerAuth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
}

/** 一条发送历史（轻量摘要，不含完整响应正文）。 */
export interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  at: number;
  status: number;
  ok: boolean;
  durationMs: number;
}

const MAX_HISTORY = 50;

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `row-${Date.now()}-${sequence}`;
}

function defaultHeaders(): HeaderRow[] {
  return [
    { id: nextId(), name: 'accept', value: '*/*', on: true },
    { id: nextId(), name: 'user-agent', value: 'Interceptor/1.0', on: true },
  ];
}

export interface ComposerState {
  method: string;
  url: string;
  protocol: ComposerProtocol;
  headers: HeaderRow[];
  body: string;
  auth: ComposerAuth;
  requestTab: RequestTab;
  responseTab: ResponseTab;
  response: ComposerResponse | null;
  sending: boolean;
  sendError: string | null;
  history: HistoryEntry[];

  setMethod(method: string): void;
  setUrl(url: string): void;
  setProtocol(protocol: ComposerProtocol): void;
  setBody(body: string): void;
  setAuth(patch: Partial<ComposerAuth>): void;
  setRequestTab(tab: RequestTab): void;
  setResponseTab(tab: ResponseTab): void;

  addHeader(): void;
  updateHeader(id: string, patch: Partial<Omit<HeaderRow, 'id'>>): void;
  removeHeader(id: string): void;

  setQueryParams(params: Array<{ name: string; value: string }>): void;

  beginSend(): void;
  sendSucceeded(response: ComposerResponse): void;
  sendFailed(message: string): void;
  resetForNew(): void;
  loadFromHistory(entry: HistoryEntry): void;
}

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

/** 解析当前 URL 的查询参数为可编辑行；URL 非法时返回空。 */
export function parseQueryParams(url: string): Array<{ name: string; value: string }> {
  try {
    const parsed = new URL(url);
    return [...parsed.searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

/** 组装发送用的 header 对：启用的手工 header + Auth 派生的 authorization 头。 */
export function buildSendHeaders(state: ComposerState): RuleHeaderPair[] {
  const headers: RuleHeaderPair[] = state.headers
    .filter((header) => header.on && header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));

  if (state.auth.type === 'bearer' && state.auth.token) {
    headers.push({ name: 'authorization', value: `Bearer ${state.auth.token}` });
  } else if (state.auth.type === 'basic' && (state.auth.username || state.auth.password)) {
    const encoded = btoa(`${state.auth.username}:${state.auth.password}`);
    headers.push({ name: 'authorization', value: `Basic ${encoded}` });
  }
  return headers;
}
