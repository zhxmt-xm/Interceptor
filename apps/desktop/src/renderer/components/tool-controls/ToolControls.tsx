import styles from './ToolControls.module.css';

import { Button, Segmented, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import type { SizeType } from 'antd/es/config-provider/SizeContext';
import type { ReactNode } from 'react';

export type ToolControlSize = 'compact' | 'regular' | 'prominent';

interface ToolIconButtonProps
  extends Omit<ButtonProps, 'aria-label' | 'children' | 'icon' | 'size' | 'type'> {
  label: string;
  icon: ReactNode;
  controlSize?: ToolControlSize;
  active?: boolean;
}

interface ToolSegmentedOption<Value extends string> {
  value: Value;
  label: string;
  icon: ReactNode;
}

interface ToolSegmentedControlProps<Value extends string> {
  label: string;
  value: Value;
  options: ReadonlyArray<ToolSegmentedOption<Value>>;
  onChange: (value: Value) => void;
  controlSize?: ToolControlSize;
  className?: string;
}

const antSizes: Record<ToolControlSize, SizeType> = {
  compact: 'small',
  regular: 'middle',
  prominent: 'large',
};

export function ToolIconButton({
  label,
  icon,
  controlSize = 'regular',
  active = false,
  className,
  ...buttonProps
}: ToolIconButtonProps): React.JSX.Element {
  return (
    <Tooltip title={label}>
      <Button
        {...buttonProps}
        variant="text"
        color="default"
        shape="square"
        size={antSizes[controlSize]}
        className={joinClasses(styles.button, className)}
        data-active={active}
        icon={icon}
        aria-label={label}
      />
    </Tooltip>
  );
}

export function ToolSegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  controlSize = 'regular',
  className,
}: ToolSegmentedControlProps<Value>): React.JSX.Element {
  return (
    <Segmented<Value>
      aria-label={label}
      className={joinClasses(
        styles.segmented,
        className,
      )}
      size={antSizes[controlSize]}
      shape="round"
      value={value}
      onChange={onChange}
      options={options.map((option) => ({
        value: option.value,
        icon: <span aria-hidden="true">{option.icon}</span>,
        label: <span className={styles.visuallyHidden}>{option.label}</span>,
        tooltip: option.label,
      }))}
    />
  );
}

function joinClasses(
  ...classes: Array<string | undefined | false>
): string {
  return classes.filter(Boolean).join(' ');
}