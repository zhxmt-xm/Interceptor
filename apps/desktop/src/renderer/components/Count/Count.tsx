import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Count.module.css';

export interface CountProps {
  children: ReactNode;
  className?: string;
}

/** Tabular monospace counter; wrap the emphasized part in <b>. */
export function Count({ children, className }: CountProps): React.JSX.Element {
  return <span className={cx(styles.count, className)}>{children}</span>;
}
