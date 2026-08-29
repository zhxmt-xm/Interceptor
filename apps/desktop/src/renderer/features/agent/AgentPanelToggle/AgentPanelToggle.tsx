import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components';
import styles from './AgentPanelToggle.module.css';

interface AgentPanelToggleProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

/** Global Header command that explicitly opens or closes the Agent side panel. */
export function AgentPanelToggle({ open, onToggle }: AgentPanelToggleProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <IconButton
      automationId={AUTOMATION_IDS.agent.panel.toggle}
      className={open ? styles.open : undefined}
      icon={Bot}
      label={t(open ? 'agent.close' : 'agent.open')}
      onClick={onToggle}
      pressed={open}
      size="sm"
    />
  );
}