import type { CSSProperties } from 'react';

import { cx } from '../cx';
import styles from './MethodBadge.module.css';

export type HttpMethod = 'get' | 'post' | 'put' | 'del';

type MethodTone = 'get' | 'post' | 'put' | 'del';

/**
 * 把原始 HTTP 方法（任意大小写、短写或全称）归一为徽标标签与配色。
 * 已知方法映射到设计定义的 4 种配色；未知方法（HEAD/OPTIONS 等）用中性色。
 */
function classifyMethod(method: string): { label: string; tone?: MethodTone } {
  switch (method.toUpperCase()) {
    case 'GET':
      return { label: 'GET', tone: 'get' };
    case 'POST':
      return { label: 'POST', tone: 'post' };
    case 'PUT':
      return { label: 'PUT', tone: 'put' };
    case 'PATCH':
      return { label: 'PATCH', tone: 'put' };
    case 'DEL':
    case 'DELETE':
      return { label: 'DEL', tone: 'del' };
    default:
      return { label: method.toUpperCase() };
  }
}

export interface MethodBadgeProps {
  method: string;
  className?: string;
  style?: CSSProperties;
}

/** Monospace HTTP-method pill, colored per method. */
export function MethodBadge({ method, className, style }: MethodBadgeProps): React.JSX.Element {
  const { label, tone } = classifyMethod(method);
  return (
    <span className={cx(styles.badge, tone && styles[tone], className)} style={style}>
      {label}
    </span>
  );
}
