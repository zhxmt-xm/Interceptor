import type { ReactNode } from 'react';

import { cx } from '../share/cx';
import styles from './StatusBadge.module.css';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'green' | 'yellow' | 'red' | 'info';
  dot?: boolean;
  className?: string;
  parityId?: string;
}

/** Rounded status badge with a leading dot (e.g. 200 OK, 404, 500, Enabled). */
export function StatusBadge({
  children,
  tone = 'green',
  dot = true,
  className,
  parityId,
}: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={cx(
        styles.badge,
        tone === 'yellow' && styles.yellow,
        tone === 'red' && styles.red,
        tone === 'info' && styles.info,
        className,
      )}
      data-parity={parityId}
    >
      {dot ? <span className={styles.dot} /> : null}
      {children}
    </span>
  );
}

