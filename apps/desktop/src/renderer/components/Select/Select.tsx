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
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** 鍙楁帶鍊硷紱涓?options 涓€鍚屾彁渚涙椂娓叉煋涓哄師鐢熶笅鎷夐€夋嫨銆?*/
  value?: string;
  options?: SelectOption[];
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  automationId?: AutomationId;
}

/**
 * 涓嬫媺閫夋嫨瑙﹀彂鍣細榛樿鍙灞曠ず children锛涙彁渚?options 鏃舵覆鏌撲负鍙楁帶鍘熺敓
 * <select>锛堜繚鎸佸悓涓€瑙嗚涓庡熬閮?caret锛夈€?
 */
export function Select({
  children,
  onClick,
  className,
  value,
  options,
  onValueChange,
  ariaLabel,
  automationId,
}: SelectProps): React.JSX.Element {
  if (options) {
    return (
      <div className={cx(styles.select, className)}>
        <select
          className={styles.native}
          value={value}
          aria-label={ariaLabel}
          data-automation-id={automationId}
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
    <div
      className={cx(styles.select, className)}
      onClick={onClick}
      data-automation-id={automationId}
    >
      {children}
      <span className={styles.caret}>
        <ChevronDown size={14} strokeWidth={2} />
      </span>
    </div>
  );
}

