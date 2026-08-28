import { AlertTriangle, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentChatDialog.module.css';

export function AgentChatDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [title, setTitle] = useState(state.agentChatTitle);

  useEffect(() => setTitle(state.agentChatTitle), [state.agentChatDialog, state.agentChatTitle]);
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
  });

  return (
    <div className={styles.agentChatDialogOverlay}>
      <section
        aria-labelledby="agent-chat-dialog-title"
        aria-modal="true"
        className={styles.agentChatDialog}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'Enter' && rename) saveTitle();
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
                autoFocus
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
          ) : (
            <p>This removes the complete chat history. This action cannot be undone.</p>
          )}
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
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