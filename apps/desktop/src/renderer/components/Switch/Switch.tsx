import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  automationId?: AutomationId;
}

/** Pill toggle. Rendered as a div so it can live inside clickable rows. */
export function Switch({ checked, onChange, className, automationId }: SwitchProps): React.JSX.Element {
  return (
    <div
      className={cx(styles.switch, checked && styles.checked, className)}
      role="switch"
      aria-checked={checked}
      onClick={onChange ? () => onChange(!checked) : undefined}
      data-automation-id={automationId}
    />
  );
}

