import { ChevronDown, ChevronUp, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../components/IconButton/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { useDesignState } from '../../state/useDesignState';
import { AgentPanelModelMenu } from './AgentPanelModelMenu';
import { AgentSessionUsage } from './AgentSessionUsage';
import { ProviderLogo } from './ProviderLogo';
import styles from './AgentPanelComposer.module.css';

export function AgentPanelComposer(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const [draft, setDraft] = useState('');
  const modelSelectorRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setDraft(''), [state.agentChat]);
  const currentModel = state.agentCurrentModel === 'added' && state.agentAddedProfile
    ? { brand: 'unknown' as const, name: state.agentAddedProfile.displayName }
    : state.agentCurrentModel === 'qwen'
      ? { brand: 'qwen' as const, name: state.agentQwenProfile.displayName }
      : { brand: 'deepseek' as const, name: state.agentDeepSeekProfile.displayName };
  const sendMessage = (): void => {
    const agentMessage = draft.trim();
    if (!agentMessage) return;
    updateState({ agentChat: 'sent', agentMessage, agentTurnState: 'running', agentToolApproval: '' });
    setDraft('');
  };
  return (
    <footer className={styles.agentComposerFooter}>
      <AgentPanelModelMenu triggerRef={modelSelectorRef} />
      <div className={styles.agentComposerMetrics} data-parity="agent-composer-metrics">
        <button
          aria-expanded={state.agentModelMenu === 'open'}
          aria-haspopup="listbox"
          aria-label={currentModel.name}
          className={styles.agentComposerModelButton}
          data-parity="agent-model-select"
          ref={modelSelectorRef}
          type="button"
          onClick={() => updateState({ agentModelMenu: state.agentModelMenu === 'open' ? '' : 'open' })}
        >
          <ProviderLogo active brand={currentModel.brand} />
          <span>{currentModel.name}</span>
          {state.agentModelMenu === 'open'
            ? <ChevronUp aria-hidden="true" />
            : <ChevronDown aria-hidden="true" />}
        </button>
        <span className={styles.agentExecutionMode} data-parity="agent-execution-mode">
          <SegmentedControl
            ariaLabel="Tool execution mode"
            options={[
              { label: 'Ask', value: 'ask' },
              { label: 'Auto', value: 'auto' },
            ]}
            value={state.agentExecutionMode}
            onChange={(agentExecutionMode) => updateState({ agentExecutionMode })}
          />
        </span>
        <AgentSessionUsage />
      </div>
      <div className={styles.agentComposerBox} data-parity="agent-composer">
        <textarea
          aria-label="Message"
          placeholder="Message Agent..."
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) sendMessage();
          }}
        />
        <span className={styles.agentComposerSend} data-parity="agent-send">
          {state.agentTurnState === 'running' ? (
            <IconButton
              icon={<Square aria-hidden="true" />}
              label="Stop response"
              onClick={() => updateState({ agentTurnState: 'stopped' })}
              tone="warning"
            />
          ) : (
            <IconButton disabled={!draft.trim()} icon={<Send aria-hidden="true" />} label="Send message" onClick={sendMessage} />
          )}
        </span>
      </div>
    </footer>
  );
}