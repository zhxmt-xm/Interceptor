import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** 受控值；与 options 一同提供时渲染为原生下拉选择。 */
  value?: string;
  options?: SelectOption[];
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
}

/**
 * 下拉选择触发器：默认只读展示 children；提供 options 时渲染为受控原生
 * <select>（保持同一视觉与尾部 caret）。
 */
export function Select({
  children,
  onClick,
  className,
  value,
  options,
  onValueChange,
  ariaLabel,
}: SelectProps): React.JSX.Element {
  if (options) {
    return (
      <div className={cx(styles.select, className)}>
        <select
          className={styles.native}
          value={value}
          aria-label={ariaLabel}
          onChange={(event) => onValueChange?.(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.caret}>
          <ChevronDown size={14} strokeWidth={2} />
        </span>
      </div>
    );
  }
  return (
    <div className={cx(styles.select, className)} onClick={onClick}>
      {children}
      <span className={styles.caret}>
        <ChevronDown size={14} strokeWidth={2} />
      </span>
    </div>
  );
}
