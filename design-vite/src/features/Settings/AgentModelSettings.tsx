import { Bot, Check, Plus, Trash2 } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { ProviderLogo, type ProviderBrand } from '../Agent/ProviderLogo';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentModelSettings.module.css';

export function AgentModelSettings(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.settings !== 'agent') {
    return null;
  }

  return (
    <section className={styles.agentModelsPanel} data-parity="agent-model-settings">
      <h2>Agent</h2>
      <p className={fixtureClassNames('desc2')}>
        Configure model providers and defaults used by Agent.
      </p>

      {state.agentProvider === 'unconfigured' ? (
        <div className={styles.agentModelsEmpty} data-parity="agent-settings-empty">
          <span className={styles.agentModelsEmptyIcon} data-parity="agent-settings-empty-icon"><Bot aria-hidden="true" /></span>
          <div data-parity="agent-settings-empty-copy">
            <strong>No models configured</strong>
            <p>Add a hosted provider or connect an OpenAI-compatible local model to start a chat.</p>
          </div>
        </div>
      ) : (
      <section className={styles.modelSettingsSection}>
        <header className={styles.modelSettingsSectionHeader}>
          <div>
            <strong>Configured models</strong>
            <span>Choose the default for new chats. Existing chats keep their selected model.</span>
          </div>
          <button
            className={fixtureClassNames('btn sm')}
            type="button"
            onClick={() => updateState({
              agentProviderDialog: 'custom',
              agentProviderDialogMode: 'add',
              agentProviderDialogTarget: '',
            })}
          >
            <Plus aria-hidden="true" />
            Add provider
          </button>
        </header>
        {([
          {
            id: 'deepseek' as const,
            brand: 'deepseek' as ProviderBrand,
            name: state.agentDeepSeekProfile.displayName,
            detail: `${state.agentDeepSeekProfile.profileName} · ${state.agentDeepSeekProfile.modelId} · key •••• 9K4Q`,
            dialog: 'deepseek' as const,
          },
          {
            id: 'qwen' as const,
            brand: 'qwen' as ProviderBrand,
            name: state.agentQwenProfile.displayName,
            detail: `${state.agentQwenProfile.profileName} · ${state.agentQwenProfile.modelId} · OpenAI-compatible profile`,
            dialog: 'custom' as const,
          },
          ...(state.agentAddedProfile ? [{
            id: 'added' as const,
            brand: 'unknown' as ProviderBrand,
            name: state.agentAddedProfile.displayName,
            detail: `${state.agentAddedProfile.profileName} · ${state.agentAddedProfile.modelId} · OpenAI-compatible profile`,
            dialog: 'custom' as const,
          }] : []),
        ]).filter((model) => !state.agentRemovedModels.includes(model.id)).map((model) => {
          const selected = state.agentDefaultModel === model.id;
          return (
            <div
              className={styles.defaultModelRow}
              data-default={selected ? 'true' : 'false'}
              data-default-model={model.id}
              data-configured-model={model.id}
              key={model.id}
            >
              <span className={styles.modelProviderIcon}><ProviderLogo active brand={model.brand} /></span>
              <div className={styles.modelProviderCopy}>
                <div className={styles.modelProviderName}>
                  <strong>{model.name}</strong>
                  <span className={styles.modelProviderConnected}><Check aria-hidden="true" />Connected</span>
                </div>
                <code>{model.detail}</code>
              </div>
              <div className={styles.modelRowActions}>
                {selected ? (
                  <span className={styles.defaultModelStatus} data-default-status="true">
                    <Check aria-hidden="true" />
                    Default
                  </span>
                ) : (
                  <button
                    aria-label={`Set ${model.name} as default`}
                    className={styles.defaultModelButton}
                    type="button"
                    onClick={() => updateState({ agentDefaultModel: model.id })}
                  >Set default</button>
                )}
                <button
                  aria-label={`Edit ${model.name}`}
                  className={styles.modelProviderAction}
                  type="button"
                  onClick={() => updateState({
                    agentProviderDialog: model.dialog,
                    agentProviderDialogMode: 'edit',
                    agentProviderDialogTarget: model.id,
                  })}
                >Edit</button>
                <button
                  aria-label={`Remove ${model.name}`}
                  className={styles.modelProviderRemove}
                  type="button"
                  onClick={() => updateState({ agentRemoveModelTarget: model.id })}
                ><Trash2 aria-hidden="true" /></button>
              </div>
            </div>
          );
        })}
      </section>
      )}
    </section>
  );
}