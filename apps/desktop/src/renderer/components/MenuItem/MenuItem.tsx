import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
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
}: MenuItemProps): React.JSX.Element {
  return (
    <div
      className={cx(styles.item, disabled && styles.disabled)}
      onClick={disabled ? undefined : onClick}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span className={styles.name}>{name}</span>
      <span className={cx(styles.hint, tag && styles.tag, warn && styles.warn)}>{hint}</span>
    </div>
  );
}
