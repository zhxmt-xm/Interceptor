import { Lock } from 'lucide-react';

import { cx, MethodBadge } from '../../../components';
import type { TrafficRow } from '../data';
import styles from './RequestRow.module.css';

export interface RequestRowProps {
  row: TrafficRow;
  selected: boolean;
  onSelect: () => void;
}

/** A single request row in the capture list. */
export function RequestRow({ row, selected, onSelect }: RequestRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.selected)}
      onClick={onSelect}
    >
      <MethodBadge method={row.method} />
      <span className={styles.host}>
        <span className={styles.hostName}>
          {row.secure ? <Lock size={12} strokeWidth={2.2} /> : null}
          {row.host}
        </span>
        <span className={styles.hostPath}>{row.path}</span>
      </span>
      <span className={cx(styles.status, styles[row.status])}>
        <span className={styles.dot} />
        {row.code}
      </span>
      <span className={styles.proto}>{row.proto}</span>
      <span className={styles.type}>{row.type}</span>
      <span className={styles.size}>{row.size}</span>
      <span className={styles.time}>{row.time}</span>
    </button>
  );
}
