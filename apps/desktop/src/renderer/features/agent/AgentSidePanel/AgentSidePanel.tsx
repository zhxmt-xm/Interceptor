import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentChatDialog } from '../AgentChatDialog/AgentChatDialog';
import { AgentPanelComposer } from '../AgentPanelComposer/AgentPanelComposer';
import { AgentPanelHeader } from '../AgentPanelHeader/AgentPanelHeader';
import { AgentPanelTranscript } from '../AgentPanelTranscript/AgentPanelTranscript';
import { AgentPanelUnconfigured } from '../AgentPanelUnconfigured/AgentPanelUnconfigured';
import { useAgentModelsStore } from '../data/agentModelsStore';
import { useAgentSessionStore } from '../data/agentSessionStore';
import styles from './AgentSidePanel.module.css';

interface AgentSidePanelProps {
  readonly onClose: () => void;
  readonly onConfigure: () => void;
}

/** Global Agent panel occupying its own app-grid column. */
export function AgentSidePanel({ onClose, onConfigure }: AgentSidePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const models = useAgentModelsStore((state) => state.snapshot)?.models ?? [];
  const currentSession = useAgentSessionStore((state) => state.currentSession);
  const error = useAgentSessionStore((state) => state.error);
  const [dialogMode, setDialogMode] = useState<'rename' | 'delete' | null>(null);
  const configured = models.length > 0;
  return (
    <aside
      className={`${styles.panel} ${configured ? '' : styles.unconfigured}`}
      data-agent-context="none"
      data-agent-provider={configured ? 'configured' : 'unconfigured'}
      data-automation-id={AUTOMATION_IDS.agent.panel.root}
      data-parity="agent-panel"
    >
      <span aria-hidden="true" className={styles.resizeHandle} />
      {dialogMode !== null ? (
        <AgentChatDialog
          key={`${currentSession?.sessionId ?? 'none'}:${dialogMode}`}
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
        />
      ) : null}
      <AgentPanelHeader
        configured={configured}
        onClose={onClose}
        onDelete={() => setDialogMode('delete')}
        onRename={() => setDialogMode('rename')}
      />
      {!configured ? (
        <AgentPanelUnconfigured onConfigure={onConfigure} />
      ) : currentSession === null ? (
        <div className={styles.noSession}>
          <strong>{t('agent.noChatTitle')}</strong>
          <span>{t('agent.noChatDescription')}</span>
        </div>
      ) : (
        <section
          className={styles.session}
          data-automation-id={AUTOMATION_IDS.agent.session.root}
          data-sequence={currentSession.sequence}
          data-session-id={currentSession.sessionId}
          data-turn-status={currentSession.currentTurn?.status ?? 'idle'}
        >
          <AgentPanelTranscript session={currentSession} />
          <AgentPanelComposer
            models={models}
            onConfigure={onConfigure}
            session={currentSession}
          />
        </section>
      )}
      {error !== null ? <div className={styles.error} role="alert">{error}</div> : null}
    </aside>
  );
}