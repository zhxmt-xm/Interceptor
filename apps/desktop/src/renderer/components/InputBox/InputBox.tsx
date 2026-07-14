import type { ReactNode } from 'react';

import { cx } from '../cx';
import styles from './InputBox.module.css';

export interface InputBoxProps {
  children: ReactNode;
  className?: string;
}

/** Read-only monospace value box (optionally with a leading icon). */
export function InputBox({ children, className }: InputBoxProps): React.JSX.Element {
  return <div className={cx(styles.input, className)}>{children}</div>;
}
