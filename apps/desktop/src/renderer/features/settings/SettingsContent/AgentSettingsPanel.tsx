import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentModelSummary, AgentProviderDraft } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentModelsActions, useAgentModelsStore } from '../../agent/data/agentModelsStore';
import { AgentAddProviderMenu } from '../AgentAddProviderMenu/AgentAddProviderMenu';
import { AgentModelsList } from '../AgentModelsList/AgentModelsList';
import { AgentProviderDialog } from '../AgentProviderDialog/AgentProviderDialog';
import { AgentRemoveProviderDialog } from '../AgentRemoveProviderDialog/AgentRemoveProviderDialog';
import styles from './AgentSettingsPanel.module.css';

interface ProviderDialogTarget {
  readonly kind: AgentProviderDraft['kind'];
  readonly model: AgentModelSummary | null;
}

/** Owns the Settings view over Runtime's redacted Provider snapshot. */
export function AgentSettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const snapshot = useAgentModelsStore((state) => state.snapshot);
  const loading = useAgentModelsStore((state) => state.loading);
  const busy = useAgentModelsStore((state) => state.busy);
  const error = useAgentModelsStore((state) => state.error);
  const clearError = useAgentModelsStore((state) => state.setError);
  const [providerDialog, setProviderDialog] = useState<ProviderDialogTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AgentModelSummary | null>(null);
  const models = snapshot?.models ?? [];

  useEffect(() => {
    void AgentModelsActions.load().catch(() => undefined);
  }, []);

  const openProviderDialog = (
    kind: AgentProviderDraft['kind'],
    model: AgentModelSummary | null,
  ): void => {
    clearError(null);
    setProviderDialog({ kind, model });
  };

  const setDefault = (providerId: string): void => {
    void AgentModelsActions.setDefault(providerId).catch(() => undefined);
  };

  return (
    <section
      className={styles.panel}
      data-automation-id={AUTOMATION_IDS.agent.models.list}
      data-model-count={models.length}
      data-parity="agent-model-settings"
    >
      <h2>{t('settings.agent.title')}</h2>
      <p className={styles.description}>{t('settings.agent.description')}</p>
      {models.length === 0 ? (
        <div className={styles.empty} data-loading={loading ? 'true' : 'false'} data-parity="agent-settings-empty">
          <span className={styles.icon} data-parity="agent-settings-empty-icon"><Bot aria-hidden="true" /></span>
          <div className={styles.emptyCopy} data-parity="agent-settings-empty-copy">
            <strong>{t('settings.agent.emptyTitle')}</strong>
            <p>{t('settings.agent.emptyDescription')}</p>
          </div>
          <AgentAddProviderMenu
            disabled={loading || busy}
            onAddCustom={() => openProviderDialog('openai-compatible', null)}
            onAddDeepSeek={() => openProviderDialog('deepseek', null)}
          />
        </div>
      ) : (
        <AgentModelsList
          busy={busy}
          models={models}
          onAddCustom={() => openProviderDialog('openai-compatible', null)}
          onAddDeepSeek={() => openProviderDialog('deepseek', null)}
          onEdit={(model) => openProviderDialog(model.kind, model)}
          onRemove={(model) => {
            clearError(null);
            setRemoveTarget(model);
          }}
          onSetDefault={setDefault}
        />
      )}
      {error !== null && providerDialog === null && removeTarget === null ? (
        <div className={styles.error} role="alert">{error}</div>
      ) : null}
      {providerDialog !== null ? (
        <AgentProviderDialog
          kind={providerDialog.kind}
          key={`${providerDialog.kind}:${providerDialog.model?.providerId ?? 'new'}`}
          model={providerDialog.model}
          onClose={() => setProviderDialog(null)}
        />
      ) : null}
      {removeTarget !== null ? (
        <AgentRemoveProviderDialog
          model={removeTarget}
          onClose={() => setRemoveTarget(null)}
        />
      ) : null}
    </section>
  );
}