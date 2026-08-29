import type { KeyboardEvent, RefObject } from 'react';

/** Format token counts compactly without hiding exact values from data attributes. */
export function compactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(value);
}

/** Navigate an Agent listbox and restore its trigger when Escape closes it. */
export function navigateAgentListbox(
  event: KeyboardEvent<HTMLElement>,
  close: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
): void {
  const options = [...event.currentTarget.querySelectorAll<HTMLElement>(
    '[role="option"]:not([disabled])',
  )];
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    requestAnimationFrame(() => triggerRef.current?.focus());
    return;
  }
  if (options.length === 0) return;
  const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLElement));
  let nextIndex: number | undefined;
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = options.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  options[nextIndex]?.focus();
}
