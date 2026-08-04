import { Select as AntSelect } from 'antd';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

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
  /** 用富内容渲染选中项与下拉项，例如彩色 method 徽标。 */
  renderItem?: (value: string) => ReactNode;
}

/** Controlled dropdown selector backed by Ant Design. */
export function Select({
  className,
  value,
  options,
  onValueChange,
  ariaLabel,
  automationId,
  renderItem,
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
      {...(renderItem
        ? {
            labelRender: (item) => renderItem(String(item.value)),
            optionRender: (option) => renderItem(String(option.value)),
          }
        : {})}
    />
  );
}

