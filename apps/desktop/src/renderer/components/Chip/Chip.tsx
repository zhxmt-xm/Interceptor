import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Chip.module.css';

export interface ChipProps {
  children: ReactNode;
  tone?: 'blue' | 'green' | 'red' | 'yellow';
  className?: string;
}

/** Small monospace status/method chip, colored by tone. */
export function Chip({ children, tone = 'blue', className }: ChipProps): React.JSX.Element {
  return <span className={cx(styles.chip, styles[tone], className)}>{children}</span>;
}
