import { splitKvTextLines, type KvTextSegment } from '../utils';

import styles from './KvValue.module.css';

/** 一个等待重算换行的 KV 值；同一 host 在同一帧只会保留最后一次请求。 */
export interface KvLineMeasurement {
  readonly host: HTMLElement;
  readonly value: string;
  /** 当前宽度与动作宽度对应的 key 已经渲染过时返回 true，跳过测量。 */
  isCurrent(key: string): boolean;
  /** 只在确实需要重算时调用，避免每次布局都重新分段。 */
  segments(): readonly KvTextSegment[];
  resolve(result: { readonly key: string; readonly lines: string[] }): void;
}

interface MeasuredValue {
  readonly request: KvLineMeasurement;
  readonly width: number;
  readonly actionsWidth: number;
  readonly key: string;
}

const pending = new Map<HTMLElement, KvLineMeasurement>();
let frame: number | null = null;

/**
 * 把同一帧内所有 KV 换行测量合并到一次布局。
 *
 * 每个值都 append 隐藏 measure、读取 Range 再 remove，逐行执行会让每次拖拽分栏都触发
 * N 次强制布局；集中 append 后统一读取，只付一次布局代价。
 */
export function requestKvLineMeasurement(request: KvLineMeasurement): void {
  pending.set(request.host, request);
  if (frame !== null) {
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = null;
    flushKvLineMeasurements();
  });
}

function flushKvLineMeasurements(): void {
  if (pending.size === 0) {
    return;
  }
  const batch = [...pending.values()];
  pending.clear();

  const measurable: MeasuredValue[] = [];
  for (const request of batch) {
    const { host } = request;
    if (!host.isConnected) {
      continue;
    }
    const width = host.getBoundingClientRect().width;
    const lastLine = host.lastElementChild;
    if (width <= 0 || !lastLine) {
      continue;
    }
    const gap = Number.parseFloat(getComputedStyle(lastLine).columnGap);
    const actionsWidth = Array.from(lastLine.children).reduce(
      (total, action) => total + action.getBoundingClientRect().width + (Number.isFinite(gap) ? gap : 0),
      0,
    );
    const key = `${request.value}\u0000${width}\u0000${actionsWidth}`;
    if (request.isCurrent(key)) {
      continue;
    }
    measurable.push({ request, width, actionsWidth, key });
  }

  if (measurable.length === 0) {
    return;
  }

  // 先挂完所有 measure，再统一读取；Range 读取期间不再改动 DOM，避免每行各触发一次布局。
  const prepared = measurable.map((entry) => {
    const measure = document.createElement('span');
    measure.className = styles.measure!;
    measure.setAttribute('aria-hidden', 'true');
    measure.textContent = entry.request.value;
    measure.style.width = `${Math.max(0, entry.width - entry.actionsWidth)}px`;
    entry.request.host.append(measure);
    return { entry, measure, range: document.createRange() };
  });

  let results: string[][] | null = null;
  try {
    results = prepared.map(({ entry, measure, range }) => splitKvTextLines(
      entry.request.value,
      (start, end) => {
        range.setStart(measure.firstChild!, start);
        range.setEnd(measure.firstChild!, end);
        return range.getBoundingClientRect().top;
      },
      entry.request.segments(),
    ));
  } finally {
    for (const { measure } of prepared) {
      measure.remove();
    }
  }

  if (!results) {
    return;
  }
  const resolved = results;
  prepared.forEach(({ entry }, index) => {
    entry.request.resolve({ key: entry.key, lines: resolved[index]! });
  });
}
