import type {
  BreakpointEdit,
  BreakpointTimeout,
  PendingBreakpoint,
} from '../../../shared/desktop-api';
import type { BreakpointDraft, BreakpointsState, EditHeaderRow } from './interfaces';

export type BreakpointTimeoutSelection = 'none' | '10' | '30' | '60' | 'custom';

export interface BreakpointTimeoutSelectionState {
  readonly selection: BreakpointTimeoutSelection;
  readonly customSeconds: string;
}

let sequence = 0;

/** 将Timeout控件的选项与Custom秒数转换为显式协议值；无效输入返回null。 */
export function breakpointTimeoutFromSelection(
  selection: BreakpointTimeoutSelection,
  customSeconds: string,
): BreakpointTimeout | null {
  if (selection === 'none') {
    return { mode: 'infinite' };
  }
  const secondsText = selection === 'custom' ? customSeconds : selection;
  if (!/^\d+$/.test(secondsText)) {
    return null;
  }
  const seconds = Number(secondsText);
  const timeoutMs = seconds * 1_000;
  if (seconds <= 0 || !Number.isSafeInteger(seconds) || !Number.isSafeInteger(timeoutMs)) {
    return null;
  }
  return { mode: 'finite', timeoutMs };
}

/** 将协议timeout映射回单一下拉框；非预设有限值使用Custom秒数。 */
export function breakpointTimeoutSelection(
  timeout: BreakpointTimeout,
): BreakpointTimeoutSelectionState {
  if (timeout.mode === 'infinite') {
    return { selection: 'none', customSeconds: '' };
  }
  const seconds = timeout.timeoutMs / 1_000;
  const customSeconds = String(seconds);
  if (seconds === 10 || seconds === 30 || seconds === 60) {
    return { selection: String(seconds) as '10' | '30' | '60', customSeconds };
  }
  return { selection: 'custom', customSeconds };
}

/** 生成断点草稿 header 行的本地 id。 */
export function rowId(): string {
  sequence += 1;
  return `bph-${sequence}`;
}

/** 由等待断点构造可编辑草稿。 */
export function draftFromBreakpoint(breakpoint: PendingBreakpoint): BreakpointDraft {
  return {
    breakpointId: breakpoint.id,
    phase: breakpoint.phase,
    method: breakpoint.method ?? 'GET',
    url: breakpoint.url ?? '',
    statusCode: breakpoint.statusCode ?? 200,
    direction: breakpoint.direction,
    frame: breakpoint.frame,
    opcode: breakpoint.opcode,
    bodyFormat: breakpoint.bodyFormat,
    headers: breakpoint.headers.map((header) => ({
      id: rowId(),
      name: header.name,
      value: header.value,
      ...(header.ruleEffect !== undefined ? { ruleEffect: header.ruleEffect } : {}),
      ...(header.ruleId !== undefined ? { ruleId: header.ruleId } : {}),
    })),
    editedHeaderNames: [],
    bodyAvailable: breakpoint.bodyAvailable,
    replacement: 'off',
    body: breakpoint.body ?? '',
    closeCode: breakpoint.closeCode ?? 1000,
    file: null,
  };
}

/** 将 WebSocket breakpoint snapshot 的 text/hex 正文交给共享 BodyViewer。 */
export function breakpointBodyBytes(body: string, format: 'text' | 'hex' | undefined): Uint8Array {
  if (format !== 'hex') {
    return new TextEncoder().encode(body);
  }
  const bytePairs = body.match(/[0-9a-f]{2}/gi) ?? [];
  return Uint8Array.from(bytePairs.map((pair) => Number.parseInt(pair, 16)));
}

/** 从 snapshot 格式与内容确定只读原文的展示 MIME。 */
export function breakpointBodyMediaType(
  body: string,
  format: 'text' | 'hex' | undefined,
): string {
  if (format === 'hex') {
    return 'application/octet-stream';
  }
  try {
    JSON.parse(body);
    return 'application/json';
  } catch {
    return 'text/plain; charset=utf-8';
  }
}

/** 当前草稿是否真的会替换正文；UI 的 Using original / Using text 标签与此同源。 */
export function replacesBody(draft: BreakpointDraft): boolean {
  if (draft.replacement === 'file') {
    return draft.file !== null;
  }
  return draft.replacement === 'text' && (draft.bodyAvailable || draft.body !== '');
}

/**
 * 这一侧按 HTTP 语义是否**会有**正文。
 *
 * 挂起时正文往往还在传，不能用「Capture 还没给出 body 引用」判断有没有正文：
 * GET 永远等不到，会一直停在接收中。没有 content-length 也没有 chunked 就是没有正文。
 */
export function expectsBody(headers: readonly EditHeaderRow[]): boolean {
  const contentLength = headers.find(
    (header) => header.name.trim().toLowerCase() === 'content-length',
  );
  if (contentLength) {
    return Number.parseInt(contentLength.value.trim(), 10) > 0;
  }
  return headers.some(
    (header) =>
      header.name.trim().toLowerCase() === 'transfer-encoding'
      && header.value.toLowerCase().includes('chunked'),
  );
}

/** 当前选中的断点（无选中返回 null）。 */
export function selectedBreakpoint(state: BreakpointsState): PendingBreakpoint | null {
  return state.breakpoints.find((bp) => bp.id === state.selectedId) ?? null;
}

/**
 * 由草稿组装 BreakpointEdit（按阶段包含 method/url 或 statusCode，headers/body 通用）。
 *
 * 只有选了 Text 或 File 才可能带 `body`。看不到原文时空输入意味着“没填”而不是“改成空”，
 * 否则只改一个 header 就放行会把真实正文抹掉；看得到原文（WebSocket 消息）时，
 * 清空就是用户的真实意图，必须原样下发。
 */
export function buildEdit(draft: BreakpointDraft): BreakpointEdit {
  const headers = draft.headers
    .filter((header) => header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));
  // 文件只传路径，由 Core 直读，大文件与二进制都不经 IPC。
  const body = !replacesBody(draft)
    ? {}
    : draft.replacement === 'file'
      ? { bodyFilePath: draft.file!.path }
      : { body: draft.body };
  const headerIntent = draft.editedHeaderNames.length === 0
    ? {}
    : { editedHeaderNames: [...draft.editedHeaderNames] };
  if (draft.phase === 'request') {
    return { method: draft.method, url: draft.url, headers, ...headerIntent, ...body };
  }
  if (draft.phase === 'websocket') {
    return draft.frame === 'close'
      ? { closeCode: draft.closeCode, ...body }
      : { ...body };
  }
  return { statusCode: draft.statusCode, headers, ...headerIntent, ...body };
}
