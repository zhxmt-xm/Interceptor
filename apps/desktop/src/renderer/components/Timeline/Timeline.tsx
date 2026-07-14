import styles from './Timeline.module.css';

export interface TimelineEntry {
  label: string;
  time: string;
  /** Bar start offset as a percentage (defaults to 0). */
  left?: number;
  /** Bar width as a percentage. */
  width: number;
}

export interface TimelineProps {
  entries: TimelineEntry[];
}

/** Horizontal phase timeline (label · time · proportional bar). */
export function Timeline({ entries }: TimelineProps): React.JSX.Element {
  return (
    <div className={styles.timeline}>
      {entries.map((entry, index) => (
        <div key={index} className={styles.row}>
          <span className={styles.label}>{entry.label}</span>
          <span className={styles.time}>{entry.time}</span>
          <span className={styles.bar}>
            <i
              style={{
                left: entry.left !== undefined ? `${entry.left}%` : undefined,
                width: `${entry.width}%`,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
