import { Check, Settings2 } from 'lucide-react';
import type { RefObject } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { navigateAgentListbox } from './agentListboxKeyboard';
import { ProviderLogo } from './ProviderLogo';
import styles from './AgentPanelModelMenu.module.css';

interface AgentPanelModelMenuProps {
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AgentPanelModelMenu({ triggerRef }: AgentPanelModelMenuProps): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.agentModelMenu !== 'open') {
    return null;
  }
  const selectModel = (agentCurrentModel: 'deepseek' | 'qwen' | 'added'): void => {
    updateState({ agentCurrentModel, agentModelMenu: '' });
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const deepSeekSelected = state.agentCurrentModel === 'deepseek';
  const qwenSelected = state.agentCurrentModel === 'qwen';
  const deepSeekAvailable = !state.agentRemovedModels.includes('deepseek');
  const qwenAvailable = !state.agentRemovedModels.includes('qwen');
  return (
    <div
      aria-label="Model for this chat"
      className={styles.agentModelMenu}
      data-parity="agent-model-menu"
      onKeyDown={(event) => navigateAgentListbox(
        event,
        () => updateState({ agentModelMenu: '' }),
        triggerRef,
      )}
    >
      <span className={styles.agentModelMenuLabel} id="agent-model-menu-label">Model for this chat</span>
      <div aria-labelledby="agent-model-menu-label" role="listbox">
        {deepSeekAvailable && <button
          aria-selected={deepSeekSelected}
          className={styles.agentModelMenuItem}
          role="option"
          tabIndex={deepSeekSelected ? 0 : -1}
          type="button"
          autoFocus={deepSeekSelected}
          onClick={() => selectModel('deepseek')}
        >
          <ProviderLogo active={deepSeekSelected} brand="deepseek" />
          <span><strong>{state.agentDeepSeekProfile.displayName}</strong><code>{state.agentDeepSeekProfile.modelId}</code></span>
          {deepSeekSelected && <Check aria-label="Selected" />}
        </button>}
        {qwenAvailable && <button
          aria-selected={qwenSelected}
          className={styles.agentModelMenuItem}
          role="option"
          tabIndex={qwenSelected ? 0 : -1}
          type="button"
          autoFocus={qwenSelected}
          onClick={() => selectModel('qwen')}
        >
          <ProviderLogo active={qwenSelected} brand="qwen" />
          <span><strong>{state.agentQwenProfile.displayName}</strong><code>{state.agentQwenProfile.modelId}</code></span>
          {qwenSelected && <Check aria-label="Selected" />}
        </button>}
        {state.agentAddedProfile && !state.agentRemovedModels.includes('added') && (
          <button
            aria-selected={state.agentCurrentModel === 'added'}
            className={styles.agentModelMenuItem}
            role="option"
            tabIndex={state.agentCurrentModel === 'added' ? 0 : -1}
            type="button"
            autoFocus={state.agentCurrentModel === 'added'}
            onClick={() => selectModel('added')}
          >
            <ProviderLogo active={state.agentCurrentModel === 'added'} brand="unknown" />
            <span><strong>{state.agentAddedProfile.displayName}</strong><code>{state.agentAddedProfile.modelId}</code></span>
            {state.agentCurrentModel === 'added' && <Check aria-label="Selected" />}
          </button>
        )}
      </div>
      <button
        className={styles.agentModelMenuManage}
        type="button"
        onClick={() => updateState({
          agentModelMenu: '',
          view: 'settings',
          settings: 'agent',
        })}
      >
        <Settings2 aria-hidden="true" />
        Agent settings…
      </button>
    </div>
  );
}