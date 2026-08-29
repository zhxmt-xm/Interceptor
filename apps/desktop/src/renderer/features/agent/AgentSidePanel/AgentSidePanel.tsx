import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentPanelHeader } from '../AgentPanelHeader/AgentPanelHeader';
import { AgentPanelUnconfigured } from '../AgentPanelUnconfigured/AgentPanelUnconfigured';
import styles from './AgentSidePanel.module.css';

interface AgentSidePanelProps {
  readonly onClose: () => void;
  readonly onConfigure: () => void;
}

/** Global Agent panel occupying its own app-grid column. */
export function AgentSidePanel({ onClose, onConfigure }: AgentSidePanelProps): React.JSX.Element {
  return (
    <aside
      className={styles.panel}
      data-agent-context="none"
      data-agent-provider="unconfigured"
      data-automation-id={AUTOMATION_IDS.agent.panel.root}
      data-parity="agent-panel"
    >
      <span aria-hidden="true" className={styles.resizeHandle} />
      <AgentPanelHeader onClose={onClose} />
      <AgentPanelUnconfigured onConfigure={onConfigure} />
    </aside>
  );
}