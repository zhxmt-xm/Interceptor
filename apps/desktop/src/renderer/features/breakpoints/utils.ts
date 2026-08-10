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
    // 看得到原文（WebSocket 消息）时直接进可编辑态；看不到时默认不碰正文。
    replacement: breakpoint.bodyAvailable ? 'text' : 'off',
    body: breakpoint.body ?? '',
  };
}

/** 当前草稿是否真的会替换正文；UI 的 Using original / Using text 标签与此同源。 */
export function replacesBody(draft: BreakpointDraft): boolean {
  return draft.replacement === 'text' && (draft.bodyAvailable || draft.body !== '');
}

/** 当前选中的断点（无选中返回 null）。 */
export function selectedBreakpoint(state: BreakpointsState): PendingBreakpoint | null {
  return state.breakpoints.find((bp) => bp.id === state.selectedId) ?? null;
}

/**
 * 由草稿组装 BreakpointEdit（按阶段包含 method/url 或 statusCode，headers/body 通用）。
 *
 * 只有选了 Text 才可能带 `body`。看不到原文时空输入意味着“没填”而不是“改成空”，
 * 否则只改一个 header 就放行会把真实正文抹掉；看得到原文（WebSocket 消息）时，
 * 清空就是用户的真实意图，必须原样下发。
 */
export function buildEdit(draft: BreakpointDraft): BreakpointEdit {
  const headers = draft.headers
    .filter((header) => header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }));
  const body = replacesBody(draft) ? { body: draft.body } : {};
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
