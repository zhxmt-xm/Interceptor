import styles from './Splitter.module.css';

export interface SplitterProps {
  /** Begin a drag; the parent owns the resize math and clamping. */
  onPointerDown: (event: React.PointerEvent) => void;
}

/** Vertical drag handle used between a list and a detail pane. */
export function Splitter({ onPointerDown }: SplitterProps): React.JSX.Element {
  return (
    <div className={styles.splitter} onPointerDown={onPointerDown}>
      <div className={styles.grip} />
    </div>
  );
}
