import type { ComposerResponse } from '../../../shared/desktop-api';

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
