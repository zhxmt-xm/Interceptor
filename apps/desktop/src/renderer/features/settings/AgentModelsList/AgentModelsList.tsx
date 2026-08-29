import { Check, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button/Button';
import { IconButton } from '../../../components/IconButton/IconButton';
import type { AgentModelSummary } from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { ProviderLogo } from '../../agent/ProviderLogo/ProviderLogo';
import { AgentAddProviderMenu } from '../AgentAddProviderMenu/AgentAddProviderMenu';
import styles from './AgentModelsList.module.css';

interface AgentModelsListProps {
  readonly busy: boolean;
  readonly models: readonly AgentModelSummary[];
  readonly onAddCustom: () => void;
  readonly onAddDeepSeek: () => void;
  readonly onEdit: (model: AgentModelSummary) => void;
  readonly onRemove: (model: AgentModelSummary) => void;
  readonly onSetDefault: (providerId: string) => void;
}

/** Renders Runtime's stable redacted model order and explicit row commands. */
export function AgentModelsList({
  busy,
  models,
  onAddCustom,
  onAddDeepSeek,
  onEdit,
  onRemove,
  onSetDefault,
}: AgentModelsListProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <strong>{t('settings.agent.configuredTitle')}</strong>
          <span>{t('settings.agent.configuredDescription')}</span>
        </div>
        <AgentAddProviderMenu
          disabled={busy}
          onAddCustom={onAddCustom}
          onAddDeepSeek={onAddDeepSeek}
        />
      </header>
      {models.map((model) => {
        const credential = model.credentialConfigured
          ? t('settings.agent.keyEnding', { lastFour: model.credentialLastFour })
          : t('settings.agent.noApiKey');
        const provider = model.kind === 'deepseek'
          ? 'DeepSeek'
          : t('settings.agent.customProfile');
        return (
          <div
            className={styles.row}
            data-automation-id={AutomationIdFactory.agentModelRow(model.providerId)}
            data-credential-configured={model.credentialConfigured ? 'true' : 'false'}
            data-default={model.isDefault ? 'true' : 'false'}
            key={model.providerId}
          >
            <span className={styles.providerIcon}>
              <ProviderLogo
                active
                brand={model.kind === 'deepseek' ? 'deepseek' : 'unknown'}
              />
            </span>
            <div className={styles.copy}>
              <div className={styles.name}>
                <strong>{model.profileName}</strong>
                <span className={styles.connected}>
                  <Check aria-hidden="true" />
                  {t('settings.connected')}
                </span>
              </div>
              <code>{model.modelId} · {provider} · {credential}</code>
            </div>
            <div className={styles.actions}>
              {model.isDefault ? (
                <span className={styles.defaultStatus}>
                  <Check aria-hidden="true" />
                  {t('settings.agent.default')}
                </span>
              ) : (
                <Button
                  ariaLabel={t('settings.agent.setDefaultFor', { name: model.profileName })}
                  automationId={AutomationIdFactory.agentModelSetDefault(model.providerId)}
                  className={styles.rowButton}
                  disabled={busy}
                  onClick={() => onSetDefault(model.providerId)}
                  size="sm"
                >
                  {t('settings.agent.setDefault')}
                </Button>
              )}
              <Button
                ariaLabel={t('settings.agent.editProvider', { name: model.profileName })}
                automationId={AutomationIdFactory.agentModelEdit(model.providerId)}
                className={styles.rowButton}
                disabled={busy}
                onClick={() => onEdit(model)}
                size="sm"
              >
                {t('settings.agent.edit')}
              </Button>
              <IconButton
                automationId={AutomationIdFactory.agentModelRemove(model.providerId)}
                className={styles.remove}
                disabled={busy}
                icon={Trash2}
                label={t('settings.agent.removeProvider', { name: model.profileName })}
                onClick={() => onRemove(model)}
                size="sm"
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
