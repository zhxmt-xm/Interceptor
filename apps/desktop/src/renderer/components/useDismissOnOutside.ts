import { useEffect, useRef, type RefObject } from 'react';

export interface DismissOnOutsideOptions {
  /** Opt out of dismissal while keeping the hook mounted. Default true. */
  enabled?: boolean;
  /** Also dismiss on Escape. Default true. */
  closeOnEscape?: boolean;
}

/**
 * Non-intrusive outside-press dismissal for a popover/menu. While `open`, a
 * capture-phase `pointerdown` on the document closes it when the press lands outside
 * every element in `refs` (the surface plus its trigger). It never calls
 * `preventDefault`/`stopPropagation`, so the very same click still activates whatever
 * it hits — the popover adds no backdrop and does not block interaction with any other
 * control (unlike a full-window click-catcher).
 *
 * Caveat: a bare click on the OS-owned frameless title-bar drag region emits no DOM
 * event, so it cannot be observed here; clicking any real control or content dismisses.
 */
export function useDismissOnOutside(
  open: boolean,
  onDismiss: () => void,
  refs: Array<RefObject<HTMLElement | null>>,
  { enabled = true, closeOnEscape = true }: DismissOnOutsideOptions = {},
): void {
  // Read the latest refs/callback inside stable listeners so a fresh array or inline
  // handler each render neither resubscribes nor captures a stale closure.
  const latest = useRef({ onDismiss, refs, closeOnEscape });
  latest.current = { onDismiss, refs, closeOnEscape };

  useEffect(() => {
    if (!open || !enabled) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && latest.current.refs.every((ref) => !ref.current?.contains(target))) {
        latest.current.onDismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (latest.current.closeOnEscape && event.key === 'Escape') {
        latest.current.onDismiss();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    // Frameless title-bar / resize-border presses are OS-owned and never reach the DOM;
    // Main forwards them so grabbing the title bar (drag/resize) also dismisses the overlay.
    const offChrome = window.interceptor?.onWindowChromePress?.(() => {
      latest.current.onDismiss();
    });
    return () => {
      offChrome?.();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, enabled]);
}
