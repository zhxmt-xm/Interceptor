import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './StatusBadge.module.css';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'green' | 'yellow' | 'red' | 'info';
  className?: string;
}

/** Rounded status badge with a leading dot (e.g. 200 OK, 404, 500, Enabled). */
export function StatusBadge({ children, tone = 'green', className }: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={cx(
        styles.badge,
        tone === 'yellow' && styles.yellow,
        tone === 'red' && styles.red,
        tone === 'info' && styles.info,
        className,
      )}
    >
      <span className={styles.dot} />
      {children}
    </span>
  );
}
