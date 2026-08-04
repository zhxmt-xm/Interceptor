import type { AutomationId } from '../../../../shared/automation-ids';
import { Checkbox } from '../../../components';

import styles from './CheckOption.module.css';

export interface CheckOptionProps {
  checked: boolean;
  label: string;
  automationId: AutomationId;
  onChange(checked: boolean): void;
}

/** 脱敏选项的单个复选项。 */
export function CheckOption({
  checked,
  label,
  automationId,
  onChange,
}: CheckOptionProps): React.JSX.Element {
  return (
    <label className={styles.check}>
      <Checkbox checked={checked} onChange={onChange} automationId={automationId} />
      {label}
    </label>
  );
}
