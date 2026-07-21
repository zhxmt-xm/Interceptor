import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
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
  automationId?: AutomationId;
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
  automationId,
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
      data-automation-id={automationId}
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

