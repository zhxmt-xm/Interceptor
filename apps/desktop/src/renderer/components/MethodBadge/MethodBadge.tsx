import type { CSSProperties } from 'react';

import { cx } from '../share/cx';
import styles from './MethodBadge.module.css';
import { classifyMethod } from './utils';

export interface MethodBadgeProps {
  method: string;
  className?: string;
  style?: CSSProperties;
}

/** Monospace HTTP-method pill, colored per method. */
export function MethodBadge({
  method,
  className,
  style,
}: MethodBadgeProps): React.JSX.Element {
  const { label, tone } = classifyMethod(method);
  return (
    <span className={cx(styles.badge, tone && styles[tone], className)} style={style}>
      {label}
    </span>
  );
}
