import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './MenuItem.module.css';

export interface MenuItemProps {
  icon: LucideIcon;
  name: string;
  /** Trailing hint text or example. */
  hint: ReactNode;
  /** Render the hint as a bordered tag rather than plain text. */
  tag?: boolean;
  /** Warning-colored tag variant. */
  warn?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  automationId?: AutomationId;
}

/** A single row inside a filter / add-action popover menu. */
export function MenuItem({
  icon: Icon,
  name,
  hint,
  tag,
  warn,
  disabled,
  onClick,
  automationId,
}: MenuItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.item, disabled && styles.disabled)}
      disabled={disabled}
      onClick={onClick}
      data-automation-id={automationId}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span className={styles.name}>{name}</span>
      <span className={cx(styles.hint, tag && styles.tag, warn && styles.warn)}>{hint}</span>
    </button>
  );
}

