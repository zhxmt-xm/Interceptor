import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Select.module.css';

export interface SelectProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Read-only select-style trigger with a trailing caret. */
export function Select({ children, onClick, className }: SelectProps): React.JSX.Element {
  return (
    <div className={cx(styles.select, className)} onClick={onClick}>
      {children}
      <span className={styles.caret}>
        <ChevronDown size={14} strokeWidth={2} />
      </span>
    </div>
  );
}
