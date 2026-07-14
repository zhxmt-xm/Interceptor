import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Button.module.css';

export interface ButtonProps {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'md' | 'sm';
  iconStrokeWidth?: number;
  onClick?: () => void;
}

/** Labelled action button (optionally with a leading icon). */
export function Button({
  children,
  icon: Icon,
  variant = 'default',
  size = 'md',
  iconStrokeWidth = 1.9,
  onClick,
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(
        styles.button,
        size === 'sm' && styles.small,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
      )}
      onClick={onClick}
    >
      {Icon ? <Icon size={15} strokeWidth={iconStrokeWidth} /> : null}
      {children}
    </button>
  );
}
