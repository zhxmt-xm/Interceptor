import type { LucideIcon } from 'lucide-react';

import { cx } from '../cx';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Accessible label (rendered as aria-label). */
  label: string;
  size?: 'md' | 'sm';
  strokeWidth?: number;
  onClick?: () => void;
  className?: string;
}

/** Transparent square icon button used across topbars, list bars and editors. */
export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  strokeWidth = 1.9,
  onClick,
  className,
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.button, size === 'sm' && styles.small, className)}
      onClick={onClick}
      aria-label={label}
    >
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={strokeWidth} />
    </button>
  );
}
