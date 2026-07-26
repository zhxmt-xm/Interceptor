import type {
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
  /** 挂起时是否能看到原始正文；HTTP 头部阶段断点为 false。 */
  bodyAvailable: boolean;
  body: string;
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
