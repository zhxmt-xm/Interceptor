import { Check } from 'lucide-react';

import { cx } from '../share/cx';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

/** Square checkbox with a check glyph when on. */
export function Checkbox({ checked, onChange, className }: CheckboxProps): React.JSX.Element {
  return (
    <span
      className={cx(styles.checkbox, checked && styles.checked, className)}
      role="checkbox"
      aria-checked={checked}
      onClick={onChange ? () => onChange(!checked) : undefined}
    >
      {checked ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  );
}

