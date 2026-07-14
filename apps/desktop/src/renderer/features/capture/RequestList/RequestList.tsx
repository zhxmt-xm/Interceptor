import { Columns2, Trash2 } from 'lucide-react';

import { Count, IconButton } from '../../../components';
import { ROWS } from '../data';
import { RequestRow } from '../RequestRow/RequestRow';
import styles from './RequestList.module.css';

export interface RequestListProps {
  selected: number;
  onSelect: (index: number) => void;
}

/** Filterable request table (protocol segment, counts and rows). */
export function RequestList({ selected, onSelect }: RequestListProps): React.JSX.Element {
  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <div className={styles.segmented}>
          <span className={styles.active}>All</span>
          <span>H1</span>
          <span>H2</span>
          <span>WS</span>
        </div>
        <span className={styles.spacer} />
        <Count>
          <b>18</b> of 241
        </Count>
        <IconButton icon={Columns2} label="Columns" size="sm" />
        <IconButton icon={Trash2} label="Clear" size="sm" />
      </div>

      <div className={styles.head}>
        <span>Method</span>
        <span>Host · Path</span>
        <span>Status</span>
        <span>Proto</span>
        <span>Type</span>
        <span>Size</span>
        <span>Time</span>
      </div>

      {ROWS.map((row, index) => (
        <RequestRow
          key={index}
          row={row}
          selected={index === selected}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
}
