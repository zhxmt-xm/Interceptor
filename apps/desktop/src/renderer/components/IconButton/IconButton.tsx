import { Tooltip } from 'antd';
import { Loader2, type LucideIcon } from 'lucide-react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Accessible label (rendered as aria-label) and default tooltip text. */
  label: string;
  size?: 'md' | 'sm' | 'xs';
  strokeWidth?: number;
  disabled?: boolean;
  /** Shows a spinner and blocks clicks while an async action runs. */
  loading?: boolean;
  /** Tooltip text; defaults to `label`. Pass null to suppress the tooltip. */
  tooltip?: string | null;
  /** Tooltip shown while blocked to explain why; falls back to the normal tooltip. */
  disabledTooltip?: string;
  onClick?: () => void;
  className?: string;
  automationId?: AutomationId;
  pressed?: boolean;
}

/** Transparent square icon button used across topbars, list bars and editors. */
export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  strokeWidth = 1.9,
  disabled = false,
  loading = false,
  tooltip,
  disabledTooltip,
  onClick,
  className,
  automationId,
  pressed,
}: IconButtonProps): React.JSX.Element {
  const iconSize = size === 'xs' ? 13 : size === 'sm' ? 15 : 18;
  const blocked = disabled || loading;
  const defaultTip = tooltip === undefined ? label : tooltip;
  const tip = blocked && disabledTooltip ? disabledTooltip : defaultTip;
  const button = (
    <button
      type="button"
      disabled={blocked}
      className={cx(
        styles.button,
        size === 'sm' && styles.small,
        size === 'xs' && styles.extraSmall,
        className,
      )}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      data-automation-id={automationId}
    >
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={strokeWidth} className={styles.spinner} />
      ) : (
        <Icon size={iconSize} strokeWidth={strokeWidth} />
      )}
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

