import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  children: ReactNode;
  /** Optional trailing count chip. */
  count?: ReactNode;
  className?: string;
}

/** Uppercase section label with an optional monospace count chip. */
export function SectionHeader({ children, count, className }: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={cx(styles.header, className)}>
      {children}
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </div>
  );
}
