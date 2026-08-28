import { Bot, ChevronDown, Plus, X } from 'lucide-react';
import { useRef } from 'react';

import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import { AgentPanelChatMenu } from './AgentPanelChatMenu';
import styles from './AgentPanelHeader.module.css';

export function AgentPanelHeader(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const chatSelectorRef = useRef<HTMLButtonElement>(null);
  const unconfigured = state.agentProvider === 'unconfigured';
  const title = unconfigured ? 'Agent' : state.agentChat === 'checkout' ? state.agentChatTitle : 'New chat';
  const newChat = (): void => updateState({
    agentChat: 'new',
    agentChatMenu: '',
    agentCurrentModel: state.agentDefaultModel,
    agentMessage: '',
  });
  return (
    <header className={styles.agentPanelHeader}>
      <AgentPanelChatMenu triggerRef={chatSelectorRef} />
      <span className={styles.agentPanelIcon}><Bot aria-hidden="true" /></span>
      <button
        aria-expanded={state.agentChatMenu === 'open'}
        aria-haspopup="listbox"
        aria-label="Select chat"
        className={styles.agentChatSelector}
        disabled={unconfigured}
        ref={chatSelectorRef}
        type="button"
        onClick={() => updateState({ agentChatMenu: state.agentChatMenu === 'open' ? '' : 'open' })}
      >
        <span>{title}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <span
        className={`${styles.agentProviderOnline} ${unconfigured ? styles.agentProviderOffline : ''}`}
        aria-label={unconfigured ? 'Model provider required' : 'DeepSeek connected'}
      />
      <IconButton disabled={unconfigured} icon={<Plus aria-hidden="true" />} label="New chat" onClick={newChat} />
      <IconButton
        icon={<X aria-hidden="true" />}
        label="Close Agent"
        onClick={() => updateState({ agentPanel: 'closed' })}
      />
    </header>
  );
}