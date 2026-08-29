import { AlertTriangle, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import styles from './AgentChatDialog.module.css';

interface AgentChatDialogProps {
  readonly mode: 'rename' | 'delete' | null;
  readonly onClose: () => void;
}

/** Confirms destructive deletion or edits the current Chat title. */
export function AgentChatDialog({ mode, onClose }: AgentChatDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const currentSession = useAgentSessionStore((state) => state.currentSession);
  const busy = useAgentSessionStore((state) => state.busy);
  const [title, setTitle] = useState(currentSession?.summary.title ?? '');
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mode === 'rename') {
      setTitle(currentSession?.summary.title ?? '');
    }
  }, [currentSession?.sessionId, currentSession?.summary.title, mode]);
  useEffect(() => {
    if (mode === null) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (mode === 'rename') {
      titleRef.current?.focus();
    } else {
      dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    return () => returnFocusRef.current?.focus();
  }, [mode]);
  if (mode === null || currentSession === null) return null;
  const rename = mode === 'rename';

  const submit = async (): Promise<void> => {
    try {
      if (rename) {
        await AgentSessionActions.rename(title);
      } else {
        await AgentSessionActions.deleteCurrent();
      }
      onClose();
    } catch {
      return;
    }
  };

  return (
    <div className={styles.overlay}>
      <section
        aria-labelledby="agent-chat-dialog-title"
        aria-modal="true"
        className={styles.dialog}
        data-automation-id={AUTOMATION_IDS.agent.chat.dialog}
        data-mode={mode}
        ref={dialogRef}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )];
          if (focusable.length === 0) return;
          const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
          const nextIndex = event.shiftKey
            ? activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
            : activeIndex === focusable.length - 1 ? 0 : activeIndex + 1;
          event.preventDefault();
          focusable[nextIndex]?.focus();
        }}
      >
        <span className={styles.icon} data-danger={rename ? 'false' : 'true'}>
          {rename ? <Pencil aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
        </span>
        <div className={styles.copy}>
          <h2 id="agent-chat-dialog-title">
            {t(rename ? 'agent.renameChat' : 'agent.deleteChat')}
          </h2>
          {rename ? (
            <label>
              <span>{t('agent.chatTitle')}</span>
              <input
                aria-label={t('agent.chatTitle')}
                data-automation-id={AUTOMATION_IDS.agent.chat.title}
                disabled={busy}
                maxLength={80}
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && title.trim()) void submit();
                }}
              />
            </label>
          ) : (
            <p>{t('agent.deleteChatDescription')}</p>
          )}
        </div>
        <footer>
          <Button
            automationId={AUTOMATION_IDS.agent.chat.cancel}
            disabled={busy}
            onClick={onClose}
          >
            {t('settings.cancel')}
          </Button>
          <Button
            automationId={AUTOMATION_IDS.agent.chat.confirm}
            disabled={rename && title.trim().length === 0}
            loading={busy}
            onClick={() => void submit()}
            variant={rename ? 'primary' : 'danger'}
          >
            {t(rename ? 'agent.saveChatTitle' : 'agent.confirmDeleteChat')}
          </Button>
        </footer>
      </section>
    </div>
  );
}
