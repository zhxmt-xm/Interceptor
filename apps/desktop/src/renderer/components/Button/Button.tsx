import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Button.module.css';

export interface ButtonProps {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'md' | 'sm';
  iconPosition?: 'start' | 'end';
  iconStrokeWidth?: number;
  disabled?: boolean;
  onClick?: () => void;
}

/** Labelled action button (optionally with a leading icon). */
export function Button({
  children,
  icon: Icon,
  variant = 'default',
  size = 'md',
  iconPosition = 'start',
  iconStrokeWidth = 1.9,
  disabled = false,
  onClick,
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx(
        styles.button,
        size === 'sm' && styles.small,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
      )}
      onClick={onClick}
    >
      {Icon && iconPosition === 'start' ? (
        <Icon size={15} strokeWidth={iconStrokeWidth} />
      ) : null}
      {children}
      {Icon && iconPosition === 'end' ? (
        <Icon size={15} strokeWidth={iconStrokeWidth} />
      ) : null}
    </button>
  );
}
