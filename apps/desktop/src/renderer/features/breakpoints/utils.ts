import type {
  BreakpointEdit,
  PendingBreakpoint,
} from '../../../shared/desktop-api';
import type { BreakpointDraft, BreakpointsState } from './interfaces';

let sequence = 0;

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
    opcode: breakpoint.opcode,
    bodyFormat: breakpoint.bodyFormat,
    headers: breakpoint.headers.map((header) => ({
      id: rowId(),
      name: header.name,
      value: header.value,
    })),
    bodyAvailable: breakpoint.bodyAvailable,
    body: breakpoint.body ?? '',
  };
}

/** 当前选中的断点（无选中返回 null）。 */
export function selectedBreakpoint(state: BreakpointsState): PendingBreakpoint | null {
  return state.breakpoints.find((bp) => bp.id === state.selectedId) ?? null;
}

/**
 * 由草稿组装 BreakpointEdit（按阶段包含 method/url 或 statusCode，headers/body 通用）。
 *
 * 原文不可见且用户没输入新正文时，**不能**带上 `body`：否则只改一个 header 就
 * 点 Continue，也会把真实上传/响应正文整体替换成空字符串。
 */
export function buildEdit(draft: BreakpointDraft): BreakpointEdit {
  const headers = draft.headers
    .filter((header) => header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));
  const body = draft.bodyAvailable || draft.body !== '' ? { body: draft.body } : {};
  if (draft.phase === 'request') {
    return { method: draft.method, url: draft.url, headers, ...body };
  }
  if (draft.phase === 'websocket') {
    return { ...body };
  }
  return { statusCode: draft.statusCode, headers, ...body };
}

/** 断点倒计时格式化（deadline 时间戳 → M:SS）；0/无超时显示 ∞。 */
export function formatCountdown(deadline: number, locale = 'en'): string {
  if (deadline <= 0) {
    return '∞';
  }
  const totalSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const minuteLabel = new Intl.NumberFormat(locale).format(minutes);
  const secondLabel = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(seconds);
  return `${minuteLabel}:${secondLabel}`;
}
