import { AgentPanelComposer } from './AgentPanelComposer';
import { AgentChatDialog } from './AgentChatDialog';
import { AgentPanelHeader } from './AgentPanelHeader';
import { AgentPanelTranscript } from './AgentPanelTranscript';
import { AgentPanelUnconfigured } from './AgentPanelUnconfigured';
import styles from './AgentSidePanel.module.css';
import { useDesignState } from '../../state/useDesignState';

export function AgentSidePanel(): React.JSX.Element | null {
  const { state } = useDesignState();
  if (state.agentPanel === 'closed') {
    return null;
  }
  const unconfigured = state.agentProvider === 'unconfigured';
  return (
    <aside
      className={styles.agentSidePanel}
      data-parity="agent-panel"
    >
      <span className={styles.agentPanelResizeHandle} aria-hidden="true" />
      <AgentChatDialog />
      <AgentPanelHeader />
      {unconfigured ? (
        <AgentPanelUnconfigured />
      ) : (
        <>
          <AgentPanelTranscript />
          <AgentPanelComposer />
        </>
      )}
    </aside>
  );
}