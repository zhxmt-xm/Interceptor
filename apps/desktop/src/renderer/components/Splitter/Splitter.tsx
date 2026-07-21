import type { AutomationId } from '../../../shared/automation-ids';
import styles from './Splitter.module.css';

export interface SplitterProps {
  /** Begin a drag; the parent owns the resize math and clamping. */
  onPointerDown: (event: React.PointerEvent) => void;
  automationId?: AutomationId;
}

/** Vertical drag handle used between a list and a detail pane. */
export function Splitter({ onPointerDown, automationId }: SplitterProps): React.JSX.Element {
  return (
    <div
      className={styles.splitter}
      onPointerDown={onPointerDown}
      data-automation-id={automationId}
    >
      <div className={styles.grip} />
    </div>
  );
}
