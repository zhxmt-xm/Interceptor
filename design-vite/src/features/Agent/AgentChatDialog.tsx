import { AlertTriangle, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentChatDialog.module.css';

export function AgentChatDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [title, setTitle] = useState(state.agentChatTitle);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setTitle(state.agentChatTitle), [state.agentChatDialog, state.agentChatTitle]);
  useEffect(() => {
    if (!state.agentChatDialog) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (state.agentChatDialog === 'rename') renameInputRef.current?.focus();
    else cancelButtonRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [state.agentChatDialog]);
  if (!state.agentChatDialog) return null;

  const rename = state.agentChatDialog === 'rename';
  const close = (): void => updateState({ agentChatDialog: '' });
  const saveTitle = (): void => {
    const agentChatTitle = title.trim();
    if (agentChatTitle) updateState({ agentChatTitle, agentChatDialog: '' });
  };
  const deleteChat = (): void => updateState({
    agentChat: 'new',
    agentChatDialog: '',
    agentChatMenu: '',
    agentCurrentModel: state.agentDefaultModel,
    agentMessage: '',
    agentTurnState: 'idle',
    agentExecutionMode: 'ask',
    agentToolApproval: '',
    agentCheckoutExecutionMode: 'ask',
    agentCheckoutToolApproval: '',
  });

  return (
    <div className={styles.agentChatDialogOverlay}>
      <section
        aria-labelledby="agent-chat-dialog-title"
        aria-modal="true"
        className={styles.agentChatDialog}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
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
        <span className={styles.agentChatDialogIcon} data-danger={rename ? 'false' : 'true'}>
          {rename ? <Pencil aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
        </span>
        <div className={styles.agentChatDialogCopy}>
          <h2 id="agent-chat-dialog-title">{rename ? 'Rename chat' : 'Delete chat?'}</h2>
          {rename ? (
            <label>
              <span>Chat title</span>
              <input
                aria-label="Chat title"
                maxLength={80}
                ref={renameInputRef}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveTitle();
                }}
              />
            </label>
          ) : (
            <p>This removes the complete chat history. This action cannot be undone.</p>
          )}
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} ref={cancelButtonRef} type="button" onClick={close}>Cancel</button>
          <button
            className={fixtureClassNames(rename ? 'btn pri' : 'btn danger')}
            disabled={rename && !title.trim()}
            type="button"
            onClick={rename ? saveTitle : deleteChat}
          >
            {rename ? 'Save chat title' : 'Confirm delete chat'}
          </button>
        </footer>
      </section>
    </div>
  );
}