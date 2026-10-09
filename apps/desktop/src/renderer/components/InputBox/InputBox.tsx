import { Input } from 'antd';
import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './InputBox.module.css';

export interface InputBoxProps {
  appearance?: 'value' | 'form';
  inputMode?: 'text' | 'numeric' | 'url';
  children?: ReactNode;
  /** 尾部内嵌插槽（渲染在输入框右侧，如匹配开关）。 */
  trailing?: ReactNode;
  className?: string;
  /** 受控值；与 onValueChange 一同提供时渲染为可编辑输入框。 */
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'password';
  ariaLabel?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  inputDataAttributes?: Readonly<Record<`data-${string}`, string>>;
  step?: number;
  parity?: string;
  automationId?: AutomationId;
}

/**
 * 等宽值框：默认只读展示 children；提供 onValueChange 时渲染为受控 input
 *（保持同一视觉）。children 可作为前置图标与输入框共存。
 */
export function InputBox({
  appearance = 'value',
  inputMode,
  children,
  trailing,
  className,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  ariaLabel,
  ariaInvalid,
  disabled,
  inputDataAttributes,
  step,
  parity,
  automationId,
}: InputBoxProps): React.JSX.Element {
  if (appearance === 'form' && onValueChange) {
    return <Input
      size="middle" type={type} value={value ?? ''} onChange={event => onValueChange(event.target.value)}
      placeholder={placeholder} disabled={disabled} prefix={children} suffix={trailing}
      aria-label={ariaLabel} aria-invalid={ariaInvalid} inputMode={inputMode}
      spellCheck={false} autoComplete="off" className={className}
      data-parity={parity} data-automation-id={automationId} {...inputDataAttributes}
    />;
  }
  if (onValueChange) {
    return (
      <div className={cx(styles.input, className)} data-parity={parity}>
        {children}
        <input
          className={styles.field}
          type={type}
          inputMode={inputMode}
          value={value ?? ''}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          data-automation-id={automationId}
          {...inputDataAttributes}
          step={step}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onValueChange(event.target.value)}
        />
        {trailing}
      </div>
    );
  }
  return (
    <div
      className={cx(styles.input, className)}
      data-automation-id={automationId}
      data-parity={parity}
    >
      {children}
    </div>
  );
}
