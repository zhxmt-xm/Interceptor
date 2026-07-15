import { cx } from '../../../components';
import { aggregateTraces } from '../data';
import { useDiagnostics } from '../DiagnosticsProvider';
import styles from './TraceList.module.css';

/** Left diagnostics pane: the scrollable trace/command table. */
export function TraceList(): React.JSX.Element {
  const { records, selectedKey, setSelectedKey } = useDiagnostics();
  const rows = aggregateTraces(records);

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <span>Time</span>
        <span>Command</span>
        <span>Level</span>
        <span>Outcome</span>
        <span className={styles.right}>Duration</span>
      </div>

      <div className={styles.body}>
        {rows.length === 0 ? (
          <div className={styles.empty}>No diagnostics recorded yet.</div>
        ) : (
          rows.map((row) => (
            <button
              type="button"
              key={row.key}
              className={cx(styles.row, row.key === selectedKey && styles.selected)}
              onClick={() => setSelectedKey(row.key)}
            >
              <span className={styles.time}>{row.time}</span>
              <span className={styles.command}>{row.command}</span>
              <span className={cx(styles.level, styles[row.level])}>
                <span className={styles.dot} />
                {row.level}
              </span>
              <span className={cx(styles.outcome, styles[row.outcome])}>
                {row.outcomeLabel}
              </span>
              <span className={styles.duration}>{row.duration}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
