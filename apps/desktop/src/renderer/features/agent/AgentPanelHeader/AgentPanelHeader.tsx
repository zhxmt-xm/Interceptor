import { Bot, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components';
import styles from './AgentPanelHeader.module.css';

interface AgentPanelHeaderProps {
  readonly onClose: () => void;
}

/** Header for the unconfigured Agent panel. */
export function AgentPanelHeader({ onClose }: AgentPanelHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className={styles.header} data-parity="agent-panel-header">
      <span className={styles.icon}><Bot aria-hidden="true" /></span>
      <span className={styles.title}>Agent</span>
      <span
        aria-label={t('agent.modelProviderRequired')}
        className={styles.providerRequired}
        role="status"
      />
      <IconButton
        automationId={AUTOMATION_IDS.agent.chat.new}
        disabled
        disabledTooltip={t('agent.newChatUnavailable')}
        icon={Plus}
        label={t('agent.newChat')}
        size="sm"
      />
      <IconButton
        automationId={AUTOMATION_IDS.agent.panel.close}
        icon={X}
        label={t('agent.close')}
        onClick={onClose}
        size="sm"
      />
    </header>
  );
}