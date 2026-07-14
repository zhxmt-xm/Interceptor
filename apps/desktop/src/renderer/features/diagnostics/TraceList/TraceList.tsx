import { useState } from 'react';

import { cx } from '../../../components';
import { LOGS } from '../data';
import styles from './TraceList.module.css';

/** Left diagnostics pane: the scrollable trace/command table. */
export function TraceList(): React.JSX.Element {
  const [selected, setSelected] = useState(2);

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <span>Time</span>
        <span>Command</span>
        <span>Level</span>
        <span>Outcome</span>
        <span className={styles.right}>Duration</span>
      </div>

      {LOGS.map((log, index) => (
        <button
          type="button"
          key={index}
          className={cx(styles.row, index === selected && styles.selected)}
          onClick={() => setSelected(index)}
        >
          <span className={styles.time}>{log.time}</span>
          <span className={styles.command}>{log.command}</span>
          <span className={cx(styles.level, styles[log.level])}>
            <span className={styles.dot} />
            {log.level}
          </span>
          <span className={cx(styles.outcome, styles[log.outcome])}>{log.outcomeLabel}</span>
          <span className={styles.duration}>{log.duration}</span>
        </button>
      ))}
    </div>
  );
}
