import { Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import type { AgentSessionsSnapshot } from '../../../../shared/desktop-api';
import { AgentSessionActions } from '../data/agentSessionStore';
import { navigateAgentListbox } from '../utils';
import styles from './AgentChatMenu.module.css';

interface AgentChatMenuProps {
  readonly open: boolean;
  readonly sessions: AgentSessionsSnapshot;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onDelete: () => void;
  readonly onRename: () => void;
}

/** Renders the newest-first Chat selector and explicit current-Chat commands. */
export function AgentChatMenu({
  open,
  sessions,
  triggerRef,
  onClose,
  onDelete,
  onRename,
}: AgentChatMenuProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;

  const select = (sessionId: string): void => {
    onClose();
    void AgentSessionActions.select(sessionId).catch(() => undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      aria-label={t('agent.chats')}
      className={styles.menu}
      data-automation-id={AUTOMATION_IDS.agent.chat.menu}
      data-parity="agent-chat-menu"
      onKeyDown={(event) => navigateAgentListbox(event, onClose, triggerRef)}
    >
      <div aria-label={t('agent.chats')} role="listbox">
        {sessions.sessions.map((session) => {
          const selected = session.sessionId === sessions.currentSessionId;
          return (
            <button
              aria-selected={selected}
              className={styles.item}
              autoFocus={selected}
              data-automation-id={AutomationIdFactory.agentSessionOption(session.sessionId)}
              key={session.sessionId}
              role="option"
              tabIndex={selected ? 0 : -1}
              type="button"
              onClick={() => select(session.sessionId)}
            >
              <MessageSquare aria-hidden="true" />
              <span>
                <strong>{session.title}</strong>
                <small>{t('agent.messageCount', { count: session.itemCount })}</small>
              </span>
              {selected ? <Check aria-label={t('agent.selected')} /> : null}
            </button>
          );
        })}
      </div>
      {sessions.currentSessionId !== null ? (
        <div className={styles.actions}>
          <button
            data-automation-id={AUTOMATION_IDS.agent.chat.rename}
            type="button"
            onClick={onRename}
          >
            <Pencil aria-hidden="true" />
            {t('agent.renameCurrentChat')}
          </button>
          <button
            data-automation-id={AUTOMATION_IDS.agent.chat.delete}
            type="button"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
            {t('agent.deleteCurrentChat')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
