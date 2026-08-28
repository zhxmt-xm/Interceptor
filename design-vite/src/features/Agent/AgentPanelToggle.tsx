import { Bot } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentPanelToggle.module.css';

export function AgentPanelToggle(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const open = state.agentPanel !== 'closed';
  return (
    <div className={styles.agentPanelToggle} data-open={open ? 'true' : 'false'}>
      <IconButton
        icon={<Bot aria-hidden="true" />}
        label={open ? 'Close Agent' : 'Open Agent'}
        onClick={() => updateState({ agentPanel: open ? 'closed' : 'open' })}
        pressed={open}
      />
    </div>
  );
}