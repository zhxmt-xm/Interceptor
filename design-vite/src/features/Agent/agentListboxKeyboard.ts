import type { KeyboardEvent, RefObject } from 'react';

export function navigateAgentListbox(
  event: KeyboardEvent<HTMLElement>,
  close: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
): void {
  const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])')];
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    requestAnimationFrame(() => triggerRef.current?.focus());
    return;
  }
  const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLElement));
  let nextIndex: number | undefined;
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = options.length - 1;
  if (nextIndex === undefined || options.length === 0) return;
  event.preventDefault();
  options[nextIndex]?.focus();
}