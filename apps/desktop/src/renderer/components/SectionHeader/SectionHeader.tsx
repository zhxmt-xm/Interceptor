import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';

import { cx } from '../share/cx';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  children: ReactNode;
  /** Optional trailing count chip. */
  count?: ReactNode;
  /** Interactive evidence rendered beside the label, outside the collapse button. */
  extra?: ReactNode;
  className?: string;
  automationId?: AutomationId;
  controlsId?: string;
  toggleLabel?: string;
  /** When set the whole header row becomes the toggle hit area and gets a chevron. */
  onClick?: () => void;
  /** Rotates the chevron; only meaningful together with `onClick`. */
  collapsed?: boolean;
}

/** Uppercase section label with an optional monospace count chip. */
export function SectionHeader({
  children,
  count,
  extra,
  className,
  automationId,
  controlsId,
  toggleLabel,
  onClick,
  collapsed = false,
}: SectionHeaderProps): React.JSX.Element {
  const chip = count !== undefined ? <span className={styles.count}>{count}</span> : null;
  if (onClick && extra) {
    return (
      <div className={cx(styles.header, className)}>
        <button
          type="button"
          aria-controls={controlsId}
          aria-expanded={!collapsed}
          className={styles.labelButton}
          data-automation-id={automationId}
          onClick={onClick}
        >
          {children}
          {chip}
        </button>
        {extra}
        <button
          type="button"
          aria-controls={controlsId}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          className={styles.chevronButton}
          onClick={onClick}
        >
          <ChevronDown
            className={cx(styles.chevron, collapsed && styles.collapsedChevron)}
            strokeWidth={1.9}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        aria-controls={controlsId}
        aria-expanded={!collapsed}
        className={cx(styles.header, styles.button, className)}
        data-automation-id={automationId}
        onClick={onClick}
      >
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

