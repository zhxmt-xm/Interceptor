import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './InputBox.module.css';

export interface InputBoxProps {
  children?: ReactNode;
  className?: string;
  /** 受控值；与 onValueChange 一同提供时渲染为可编辑输入框。 */
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  ariaLabel?: string;
}

/**
 * 等宽值框：默认只读展示 children；提供 onValueChange 时渲染为受控 input
 *（保持同一视觉）。children 可作为前置图标与输入框共存。
 */
export function InputBox({
  children,
  className,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  ariaLabel,
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
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onValueChange(event.target.value)}
        />
      </div>
    );
  }
  return <div className={cx(styles.input, className)}>{children}</div>;
}
