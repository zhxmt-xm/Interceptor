import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './InputBox.module.css';

export interface InputBoxProps {
  children?: ReactNode;
  /** 尾部内嵌插槽（渲染在输入框右侧，如匹配开关）。 */
  trailing?: ReactNode;
  className?: string;
  /** 鍙楁帶鍊硷紱涓?onValueChange 涓€鍚屾彁渚涙椂娓叉煋涓哄彲缂栬緫杈撳叆妗嗐€?*/
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  ariaLabel?: string;
  automationId?: AutomationId;
}

/**
 * 绛夊鍊兼锛氶粯璁ゅ彧璇诲睍绀?children锛涙彁渚?onValueChange 鏃舵覆鏌撲负鍙楁帶 input
 *锛堜繚鎸佸悓涓€瑙嗚锛夈€俢hildren 鍙綔涓哄墠缃浘鏍囦笌杈撳叆妗嗗叡瀛樸€?
 */
export function InputBox({
  children,
  trailing,
  className,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  ariaLabel,
  automationId,
}: InputBoxProps): React.JSX.Element {
  if (onValueChange) {
    return (
      <div className={cx(styles.input, className)}>
        {children}
        <input
          className={styles.field}
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          aria-label={ariaLabel}
          data-automation-id={automationId}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onValueChange(event.target.value)}
        />
        {trailing}
      </div>
    );
  }
  return <div className={cx(styles.input, className)} data-automation-id={automationId}>{children}</div>;
}

