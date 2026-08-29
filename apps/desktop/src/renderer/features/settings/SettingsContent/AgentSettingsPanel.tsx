import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from './AgentSettingsPanel.module.css';

/** Agent settings empty state before model configuration is implemented. */
export function AgentSettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={styles.panel} data-parity="agent-model-settings">
      <h2>{t('settings.agent.title')}</h2>
      <p className={styles.description}>{t('settings.agent.description')}</p>
      <div className={styles.empty} data-parity="agent-settings-empty">
        <span className={styles.icon} data-parity="agent-settings-empty-icon"><Bot aria-hidden="true" /></span>
        <div data-parity="agent-settings-empty-copy">
          <strong>{t('settings.agent.emptyTitle')}</strong>
          <p>{t('settings.agent.emptyDescription')}</p>
        </div>
      </div>
    </section>
  );
}