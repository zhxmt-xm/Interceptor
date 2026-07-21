import type { LucideIcon } from 'lucide-react';

import { cx } from '../share/cx';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Accessible label (rendered as aria-label). */
  label: string;
  size?: 'md' | 'sm';
  strokeWidth?: number;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Transparent square icon button used across topbars, list bars and editors. */
export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  strokeWidth = 1.9,
  disabled = false,
  onClick,
  className,
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx(styles.button, size === 'sm' && styles.small, className)}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={strokeWidth} />
    </button>
  );
}

