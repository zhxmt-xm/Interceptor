import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** 不可操作：变灰、不响应点击。 */
  disabled?: boolean;
  className?: string;
  automationId?: AutomationId;
}

/** Pill toggle. Rendered as a div so it can live inside clickable rows. */
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  automationId,
}: SwitchProps): React.JSX.Element {
  return (
    <div
      className={cx(
        styles.switch,
        checked && styles.checked,
        disabled && styles.disabled,
        className,
      )}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={onChange && !disabled ? () => onChange(!checked) : undefined}
      data-automation-id={automationId}
    />
  );
}

