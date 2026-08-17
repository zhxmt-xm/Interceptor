import type { AutomationId } from '../../../../shared/automation-ids';
import { cx } from '../../../components';
import styles from './FrameToggle.module.css';

export interface FrameToggleProps {
  label: string;
  automationId: AutomationId;
  selected: boolean;
  onToggle: () => void;
}

/** Multi-select chip for one WebSocket frame kind inside the breakpoint setup panel. */
export function FrameToggle({
  label,
  automationId,
  selected,
  onToggle,
}: FrameToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-automation-id={automationId}
      className={cx(styles.frameToggle, selected && styles.selected)}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
