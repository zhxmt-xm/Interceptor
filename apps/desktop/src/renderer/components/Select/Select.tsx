import { Select as AntSelect } from 'antd';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  automationId?: AutomationId;
}

export interface SelectProps {
  className?: string;
  /** Extra class for Ant's public selected-content semantic slot. */
  contentClassName?: string;
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
  contentClassName,
  value,
  options,
  onValueChange,
  ariaLabel,
  automationId,
  renderItem,
}: SelectProps): React.JSX.Element {
  const renderOption = (value: string, label: ReactNode): ReactNode => {
    const option = options.find((candidate) => candidate.value === value);
    const content = renderItem ? renderItem(value) : label;
    return option?.automationId
      ? <span data-automation-id={option.automationId}>{content}</span>
      : content;
  };

  return (
    <AntSelect
      className={cx(styles.antSelect, className)}
      classNames={{
        content: cx(styles.content, contentClassName),
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
      {...(renderItem || options.some((option) => option.automationId !== undefined)
        ? {
            ...(renderItem ? { labelRender: (item) => renderItem(String(item.value)) } : {}),
            optionRender: (option) => renderOption(String(option.value), option.label),
          }
        : {})}
    />
  );
}

