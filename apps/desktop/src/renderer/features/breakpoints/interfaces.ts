import type {
  BreakpointsSnapshot,
  PendingBreakpoint,
  WebSocketBreakpointFrame,
} from '../../../shared/desktop-api';

/** 编辑草稿中的 header 行（带本地 id 便于增删）。 */
export interface EditHeaderRow {
  id: string;
  name: string;
  value: string;
}

/** 正文替换模式；off 表示原文原样转发。 */
export type BreakpointReplacement = 'off' | 'text' | 'file';

/** 选中的替换文件；没有 text 说明太大或非文本，只展示元数据。 */
export interface BreakpointFileDraft {
  path: string;
  name: string;
  size: number;
  mediaType: string;
  text?: string;
}

/** 选中断点的可编辑草稿：请求用 method/url、响应用 statusCode，headers/body 两阶段通用。 */
export interface BreakpointDraft {
  breakpointId: string;
  phase: 'request' | 'response' | 'websocket';
  method: string;
  url: string;
  statusCode: number;
  direction?: 'client-to-server' | 'server-to-client';
  /** WebSocket 帧类别；message 之外都是控制帧。 */
  frame?: WebSocketBreakpointFrame;
  opcode?: 1 | 2;
  bodyFormat?: 'text' | 'hex';
  headers: EditHeaderRow[];
  /** 用户显式设置或删除过的 header 名，按首次编辑顺序保留。 */
  editedHeaderNames: string[];
  /** 挂起时是否能看到原始正文；HTTP 头部阶段断点为 false。 */
  bodyAvailable: boolean;
  replacement: BreakpointReplacement;
  body: string;
  /** 仅 close 帧：转发时使用的 close code。 */
  closeCode: number;
  /** 选了 File 档时的文件；还没选时为 null。 */
  file: BreakpointFileDraft | null;
}

export interface BreakpointsState {
  breakpoints: PendingBreakpoint[];
  enabled: boolean;
  /** 队列已满而被自动放行的命中累计数。 */
  autoContinued: number;
  selectedId: string | null;
  draft: BreakpointDraft | null;
  resolving: boolean;

  applySnapshot(snapshot: BreakpointsSnapshot): void;
  /** Core 换代后丢掉旧代的挂起快照。 */
  clear(): void;
  select(id: string): void;
  setMethod(method: string): void;
  setUrl(url: string): void;
  setStatusCode(statusCode: number): void;
  /** 仅 WebSocket close 帧：改写转发时使用的 close code。 */
  setCloseCode(closeCode: number): void;
  setReplacement(replacement: BreakpointReplacement): void;
  setBody(body: string): void;
  /** 写入用户选中的替换文件；null 表示移除当前文件。 */
  setFile(file: BreakpointFileDraft | null): void;
  addHeader(): void;
  updateHeader(id: string, patch: Partial<Omit<EditHeaderRow, 'id'>>): void;
  removeHeader(id: string): void;
  setResolving(resolving: boolean): void;
}
