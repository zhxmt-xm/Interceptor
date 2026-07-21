import type { ReactNode } from 'react';

import { cx } from '../share/cx';
import styles from './StatItem.module.css';

export interface StatItemProps {
  children: ReactNode;
  /** Optional leading status dot. */
  dot?: 'red' | 'green' | 'yellow';
  /** Render the value in the tabular monospace style. */
  mono?: boolean;
  /** Push this item (and the rest) to the far end of the status bar. */
  push?: boolean;
}

/** A single status-bar cell: optional dot + label, monospace or not. */
export function StatItem({ children, dot, mono, push }: StatItemProps): React.JSX.Element {
  return (
    <div className={cx(styles.item, mono && styles.mono, push && styles.push)}>
      {dot ? <span className={cx(styles.dot, styles[dot])} /> : null}
      {children}
    </div>
  );
}

