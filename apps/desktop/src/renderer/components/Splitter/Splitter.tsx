import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Splitter.module.css';

export interface SplitterProps {
  /** Begin a drag; the parent owns the resize math and clamping. */
  onPointerDown: (event: React.PointerEvent) => void;
  /** `vertical` splits left/right, `horizontal` splits top/bottom. */
  orientation?: 'vertical' | 'horizontal';
  automationId?: AutomationId;
}

/** Drag handle placed between two resizable panes. */
export function Splitter({
  onPointerDown,
  orientation = 'vertical',
  automationId,
}: SplitterProps): React.JSX.Element {
  return (
    <div
      className={cx(
        styles.splitter,
        orientation === 'horizontal' && styles.horizontal,
      )}
      onPointerDown={onPointerDown}
      data-automation-id={automationId}
    >
      <div className={styles.grip} />
    </div>
  );
}
