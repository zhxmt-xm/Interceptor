import { AlertTriangle } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import type { AgentModelId } from '../../state/types';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentRemoveModelDialog.module.css';

export function AgentRemoveModelDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const target = state.agentRemoveModelTarget;
  if (!target) return null;

  const name = target === 'deepseek'
    ? state.agentDeepSeekProfile.displayName
    : target === 'qwen'
      ? state.agentQwenProfile.displayName
      : state.agentAddedProfile?.displayName ?? 'Custom model';
  const close = (): void => updateState({ agentRemoveModelTarget: '' });
  const removeModel = (): void => {
    const agentRemovedModels = [...new Set([...state.agentRemovedModels, target])];
    const fallbackOrder: AgentModelId[] = ['deepseek', 'qwen', 'added'];
    const fallback = fallbackOrder.find((modelId) => (
      !agentRemovedModels.includes(modelId)
      && (modelId !== 'added' || state.agentAddedProfile !== null)
    ));
    updateState({
      agentRemovedModels,
      agentRemoveModelTarget: '',
      agentDefaultModel: state.agentDefaultModel === target && fallback ? fallback : state.agentDefaultModel,
      agentCurrentModel: state.agentCurrentModel === target && fallback ? fallback : state.agentCurrentModel,
      agentProvider: fallback ? 'configured' : 'unconfigured',
    });
  };

  return (
    <div className={styles.agentRemoveModelOverlay}>
      <section
        aria-labelledby="agent-remove-model-title"
        aria-modal="true"
        className={styles.agentRemoveModelDialog}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        <span className={styles.agentRemoveModelIcon}><AlertTriangle aria-hidden="true" /></span>
        <div>
          <h2 id="agent-remove-model-title">Remove {name}</h2>
          <p>Existing chats using this model will switch to the next configured model.</p>
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn danger')} type="button" onClick={removeModel}>Confirm remove model</button>
        </footer>
      </section>
    </div>
  );
}