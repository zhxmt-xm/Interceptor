import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../cx';
import styles from './Flyout.module.css';

export interface FlyoutProps {
  open: boolean;
  /** Trigger element used to position the portal. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  className?: string;
  placement?: 'right-end' | 'bottom-end';
  /** Dismiss on an outside press. Default true. */
  dismissOnOutsideClick?: boolean;
  children: ReactNode;
}

/**
 * A portal popover anchored to the right of its trigger button with bottom edges
 * aligned. Portals to <body> so the sidebar's overflow can't clip it. Dismissal is a
 * non-intrusive capture-phase outside press (never preventDefault, so other controls
 * stay clickable) plus Escape.
 */
export function Flyout({
  open,
  anchorRef,
  onClose,
  className,
  placement = 'right-end',
  dismissOnOutsideClick = true,
  children,
}: FlyoutProps): React.ReactPortal | null {
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const place = (): void => {
      const anchor = anchorRef.current;
      const pop = popRef.current;
      if (!anchor || !pop) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      if (placement === 'bottom-end') {
        const left = Math.max(
          8,
          Math.min(rect.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8),
        );
        const below = rect.bottom + 6;
        const top = below + pop.offsetHeight <= window.innerHeight - 8
          ? below
          : Math.max(8, rect.top - pop.offsetHeight - 6);
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
      } else {
        pop.style.left = `${Math.round(rect.right + 6)}px`;
        pop.style.top = `${Math.round(rect.bottom - pop.offsetHeight)}px`;
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, placement]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!dismissOnOutsideClick) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !popRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    // Frameless title-bar / resize-border presses are OS-owned and never reach the DOM;
    // Main forwards them so grabbing the title bar (drag/resize) also dismisses the flyout.
    const offChrome = dismissOnOutsideClick
      ? window.interceptor?.onWindowChromePress?.(() => onClose())
      : undefined;
    return () => {
      offChrome?.();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorRef, onClose, dismissOnOutsideClick]);

  if (!open) {
    return null;
  }
  return createPortal(
    <div ref={popRef} className={cx(styles.flyout, className)} role="menu">
      {children}
    </div>,
    document.body,
  );
}
