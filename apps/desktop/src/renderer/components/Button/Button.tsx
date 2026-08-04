import { Tooltip } from 'antd';
import { Loader2, type LucideIcon } from 'lucide-react';
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
  /** Shows a spinner in the leading icon slot and blocks clicks while an async action runs. */
  loading?: boolean;
  /** Tooltip text; when omitted no tooltip is shown (button text is already visible). */
  tooltip?: string;
  /** Tooltip shown while blocked to explain why. */
  disabledTooltip?: string;
  className?: string;
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
  loading = false,
  tooltip,
  disabledTooltip,
  className,
  onClick,
  automationId,
}: ButtonProps): React.JSX.Element {
  const blocked = disabled || loading;
  const tip = blocked && disabledTooltip ? disabledTooltip : tooltip;
  const button = (
    <button
      type="button"
      disabled={blocked}
      className={cx(
        styles.button,
        size === 'sm' && styles.small,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        className,
      )}
      onClick={onClick}
      data-automation-id={automationId}
    >
      {loading ? (
        <Loader2 size={15} strokeWidth={iconStrokeWidth} className={styles.spinner} />
      ) : Icon && iconPosition === 'start' ? (
        <Icon size={15} strokeWidth={iconStrokeWidth} />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === 'end' ? (
        <Icon size={15} strokeWidth={iconStrokeWidth} />
      ) : null}
    </button>
  );
  if (!tip) {
    return button;
  }
  return (
    <Tooltip title={tip} mouseEnterDelay={0.4}>
      {button}
    </Tooltip>
  );
}

