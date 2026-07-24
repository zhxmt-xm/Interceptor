import { Select as AntSelect } from 'antd';
import { ChevronDown } from 'lucide-react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  className?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  automationId?: AutomationId;
}

/** Controlled dropdown selector backed by Ant Design. */
export function Select({
  className,
  value,
  options,
  onValueChange,
  ariaLabel,
  automationId,
}: SelectProps): React.JSX.Element {
  return (
    <AntSelect
      className={cx(styles.antSelect, className)}
      classNames={{
        content: styles.content,
        suffix: styles.suffix,
        popup: {
          root: styles.popup,
          list: styles.popupList,
          listItem: styles.popupItem,
        },
      }}
      value={value}
      options={options}
      listHeight={320}
      onChange={onValueChange}
      aria-label={ariaLabel}
      data-automation-id={automationId}
      suffixIcon={<ChevronDown size={14} strokeWidth={2} />}
    />
  );
}

