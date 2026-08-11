import { CircleSlash, Play } from 'lucide-react';

import { ActionButton } from '../ActionButton/ActionButton';
import styles from './ActionFooter.module.css';

interface ActionFooterProps {
  readonly forwardLabel: string;
  readonly onContinue: () => void;
  readonly onDrop: () => void;
  readonly onForward: () => void;
}

export function ActionFooter({
  forwardLabel,
  onContinue,
  onDrop,
  onForward,
}: ActionFooterProps): React.JSX.Element {
  return (
    <footer className={styles.actionFooter} data-breakpoint-component="actions">
      <ActionButton
        icon={<CircleSlash aria-hidden="true" />}
        label="Drop"
        tone="danger"
        onClick={onDrop}
      />
      <span className={styles.actionFooterSpacer} />
      <ActionButton label="Continue" onClick={onContinue} />
      <ActionButton
        icon={<Play aria-hidden="true" />}
        label={forwardLabel}
        tone="primary"
        onClick={onForward}
      />
    </footer>
  );
}