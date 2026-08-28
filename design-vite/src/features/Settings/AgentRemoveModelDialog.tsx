import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import type { AgentModelId } from '../../state/types';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentRemoveModelDialog.module.css';

export function AgentRemoveModelDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const target = state.agentRemoveModelTarget;
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!target) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [target]);
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
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
        <span className={styles.agentRemoveModelIcon}><AlertTriangle aria-hidden="true" /></span>
        <div>
          <h2 id="agent-remove-model-title">Remove {name}</h2>
          <p>Existing chats using this model will switch to the next configured model.</p>
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} ref={cancelButtonRef} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn danger')} type="button" onClick={removeModel}>Confirm remove model</button>
        </footer>
      </section>
    </div>
  );
}