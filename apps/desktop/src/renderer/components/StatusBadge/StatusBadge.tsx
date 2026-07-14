import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './StatusBadge.module.css';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'green' | 'yellow';
  className?: string;
}

/** Rounded "healthy" badge with a leading dot (e.g. 200 OK, Enabled). */
export function StatusBadge({ children, tone = 'green', className }: StatusBadgeProps): React.JSX.Element {
  return (
    <span className={cx(styles.badge, tone === 'yellow' && styles.yellow, className)}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}
