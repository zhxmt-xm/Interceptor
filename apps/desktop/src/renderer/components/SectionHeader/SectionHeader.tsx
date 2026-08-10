import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../share/cx';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  children: ReactNode;
  /** Optional trailing count chip. */
  count?: ReactNode;
  className?: string;
  /** When set the whole header row becomes the toggle hit area and gets a chevron. */
  onClick?: () => void;
  /** Rotates the chevron; only meaningful together with `onClick`. */
  collapsed?: boolean;
}

/** Uppercase section label with an optional monospace count chip. */
export function SectionHeader({
  children,
  count,
  className,
  onClick,
  collapsed = false,
}: SectionHeaderProps): React.JSX.Element {
  const chip = count !== undefined ? <span className={styles.count}>{count}</span> : null;
  if (onClick) {
    return (
      <button type="button" className={cx(styles.header, styles.button, className)} onClick={onClick}>
        {children}
        {chip}
        <ChevronDown
          className={cx(styles.chevron, collapsed && styles.collapsedChevron)}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </button>
    );
  }
  return (
    <div className={cx(styles.header, className)}>
      {children}
      {chip}
    </div>
  );
}

