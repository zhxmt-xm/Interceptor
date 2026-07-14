import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './FilterChip.module.css';

export interface FilterChipProps {
  children: ReactNode;
  onClick?: () => void;
}

/** Dropdown-style filter trigger with a trailing caret (e.g. Level, Outcome). */
export function FilterChip({ children, onClick }: FilterChipProps): React.JSX.Element {
  return (
    <button type="button" className={styles.filterChip} onClick={onClick}>
      {children}
      <ChevronDown size={13} strokeWidth={2} />
    </button>
  );
}
