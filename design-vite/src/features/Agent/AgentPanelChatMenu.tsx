import { Check, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { navigateAgentListbox } from './agentListboxKeyboard';
import styles from './AgentPanelChatMenu.module.css';

interface AgentPanelChatMenuProps {
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AgentPanelChatMenu({ triggerRef }: AgentPanelChatMenuProps): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.agentChatMenu !== 'open') return null;

  const restoreTriggerFocus = (): void => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const selectExistingChat = (): void => {
    updateState({ agentChat: 'checkout', agentChatMenu: '', agentCurrentModel: 'deepseek', agentMessage: '' });
    restoreTriggerFocus();
  };
  const selectNewChat = (): void => {
    updateState({ agentChat: 'new', agentChatMenu: '', agentCurrentModel: state.agentDefaultModel, agentMessage: '' });
    restoreTriggerFocus();
  };

  return (
    <div
      aria-label="Chats"
      className={styles.agentChatMenu}
      data-parity="agent-chat-menu"
      onKeyDown={(event) => navigateAgentListbox(
        event,
        () => updateState({ agentChatMenu: '' }),
        triggerRef,
      )}
    >
      <div aria-label="Chats" role="listbox">
        <button
          aria-selected={state.agentChat === 'checkout'}
          className={styles.agentChatMenuItem}
          role="option"
          tabIndex={state.agentChat === 'checkout' ? 0 : -1}
          type="button"
          autoFocus={state.agentChat === 'checkout'}
          onClick={selectExistingChat}
        >
          <MessageSquare aria-hidden="true" />
          <span><strong>{state.agentChatTitle}</strong><small>2 messages</small></span>
          {state.agentChat === 'checkout' && <Check aria-label="Selected" />}
        </button>
        <button
          aria-selected={state.agentChat !== 'checkout'}
          className={styles.agentChatMenuItem}
          role="option"
          tabIndex={state.agentChat !== 'checkout' ? 0 : -1}
          type="button"
          autoFocus={state.agentChat !== 'checkout'}
          onClick={selectNewChat}
        >
          <Plus aria-hidden="true" />
          <span><strong>New chat</strong><small>Start empty</small></span>
          {state.agentChat !== 'checkout' && <Check aria-label="Selected" />}
        </button>
      </div>
      {state.agentChat === 'checkout' && (
        <div className={styles.agentChatMenuActions}>
          <button type="button" onClick={() => updateState({ agentChatDialog: 'rename', agentChatMenu: '' })}>
            <Pencil aria-hidden="true" />Rename current chat
          </button>
          <button type="button" onClick={() => updateState({ agentChatDialog: 'delete', agentChatMenu: '' })}>
            <Trash2 aria-hidden="true" />Delete current chat
          </button>
        </div>
      )}
    </div>
  );
}