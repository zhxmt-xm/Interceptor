import { Bot, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button } from '../../../components';
import styles from './AgentPanelUnconfigured.module.css';

interface AgentPanelUnconfiguredProps {
  readonly onConfigure: () => void;
}

/** Honest empty state shown until the user configures a model. */
export function AgentPanelUnconfigured({ onConfigure }: AgentPanelUnconfiguredProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.empty} data-parity="agent-panel-unconfigured">
      <span className={styles.icon} data-parity="agent-unconfigured-icon"><Bot aria-hidden="true" /></span>
      <h2>{t('agent.connectTitle')}</h2>
      <p>{t('agent.connectDescription')}</p>
      <Button
        automationId={AUTOMATION_IDS.agent.configure}
        icon={Settings2}
        onClick={onConfigure}
        variant="primary"
      >
        {t('agent.configure')}
      </Button>
    </div>
  );
}