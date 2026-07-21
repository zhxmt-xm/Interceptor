import type { CSSProperties } from 'react';

import { cx } from '../share/cx';
import styles from './MethodBadge.module.css';

export type HttpMethod = 'get' | 'post' | 'put' | 'del';

type MethodTone = 'get' | 'post' | 'put' | 'del';

/**
 * 鎶婂師濮?HTTP 鏂规硶锛堜换鎰忓ぇ灏忓啓銆佺煭鍐欐垨鍏ㄧО锛夊綊涓€涓哄窘鏍囨爣绛句笌閰嶈壊銆?
 * 宸茬煡鏂规硶鏄犲皠鍒拌璁″畾涔夌殑 4 绉嶉厤鑹诧紱鏈煡鏂规硶锛圚EAD/OPTIONS 绛夛級鐢ㄤ腑鎬ц壊銆?
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

