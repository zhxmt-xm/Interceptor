import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../cx';
import styles from './Flyout.module.css';

export interface FlyoutProps {
  open: boolean;
  /** Trigger the flyout anchors to: opens just past its right edge, bottom edges flush. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * A portal popover anchored to the right of its trigger button with bottom edges
 * aligned. Portals to <body> so the sidebar's overflow can't clip it; closes on
 * outside pointer-down or Escape.
 */
export function Flyout({
  open,
  anchorRef,
  onClose,
  className,
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
      pop.style.left = `${Math.round(rect.right + 6)}px`;
      pop.style.top = `${Math.round(rect.bottom - pop.offsetHeight)}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!popRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorRef, onClose]);

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
