import { Bot, ChevronDown, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components';
import { AgentChatMenu } from '../AgentChatMenu/AgentChatMenu';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import styles from './AgentPanelHeader.module.css';

interface AgentPanelHeaderProps {
  readonly configured: boolean;
  readonly onClose: () => void;
  readonly onDelete: () => void;
  readonly onRename: () => void;
}

/** Global Agent header with Runtime-owned Chat selection and lifecycle commands. */
export function AgentPanelHeader({
  configured,
  onClose,
  onDelete,
  onRename,
}: AgentPanelHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const sessions = useAgentSessionStore((state) => state.sessions);
  const currentSession = useAgentSessionStore((state) => state.currentSession);
  const busy = useAgentSessionStore((state) => state.busy);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const createSession = (): void => {
    setMenuOpen(false);
    void AgentSessionActions.create().catch(() => undefined);
  };
  return (
    <header className={styles.header} data-parity="agent-panel-header">
      {sessions !== null ? (
        <AgentChatMenu
          open={menuOpen}
          sessions={sessions}
          triggerRef={selectorRef}
          onClose={() => setMenuOpen(false)}
          onDelete={() => {
            selectorRef.current?.focus();
            setMenuOpen(false);
            onDelete();
          }}
          onRename={() => {
            selectorRef.current?.focus();
            setMenuOpen(false);
            onRename();
          }}
        />
      ) : null}
      <span className={styles.icon}><Bot aria-hidden="true" /></span>
      {configured ? (
        <button
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-label={t('agent.selectChat')}
          className={styles.selector}
          data-automation-id={AUTOMATION_IDS.agent.chat.selector}
          disabled={busy || sessions?.sessions.length === 0}
          ref={selectorRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>{currentSession?.summary.title ?? t('agent.noChat')}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      ) : (
        <span className={styles.title}>Agent</span>
      )}
      <span
        aria-label={t('agent.modelProviderRequired')}
        className={configured ? styles.providerConnected : styles.providerRequired}
        role="status"
      />
      <IconButton
        automationId={AUTOMATION_IDS.agent.chat.new}
        disabled={!configured || busy}
        disabledTooltip={t('agent.newChatUnavailable')}
        icon={Plus}
        label={t('agent.newChat')}
        onClick={createSession}
        size="sm"
      />
      <IconButton
        automationId={AUTOMATION_IDS.agent.panel.close}
        icon={X}
        label={t('agent.close')}
        onClick={onClose}
        size="sm"
      />
    </header>
  );
}