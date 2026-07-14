import type { CSSProperties } from 'react';

import { cx } from '../cx';
import styles from './MethodBadge.module.css';

export type HttpMethod = 'get' | 'post' | 'put' | 'del';

const LABEL: Record<HttpMethod, string> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  del: 'DEL',
};

export interface MethodBadgeProps {
  method: HttpMethod;
  className?: string;
  style?: CSSProperties;
}

/** Monospace HTTP-method pill, colored per method. */
export function MethodBadge({ method, className, style }: MethodBadgeProps): React.JSX.Element {
  return (
    <span className={cx(styles.badge, styles[method], className)} style={style}>
      {LABEL[method]}
    </span>
  );
}
