import { cx } from '../cx';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

/** Pill toggle. Rendered as a div so it can live inside clickable rows. */
export function Switch({ checked, onChange, className }: SwitchProps): React.JSX.Element {
  return (
    <div
      className={cx(styles.switch, checked && styles.checked, className)}
      role="switch"
      aria-checked={checked}
      onClick={onChange ? () => onChange(!checked) : undefined}
    />
  );
}
