import { Bot, Settings2 } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './AgentPanelUnconfigured.module.css';

export function AgentPanelUnconfigured(): React.JSX.Element {
  const { updateState } = useDesignState();
  return (
    <div className={styles.agentPanelUnconfigured}>
      <span className={styles.agentPanelUnconfiguredIcon}><Bot aria-hidden="true" /></span>
      <h2>Connect a model to start</h2>
      <p>Add a hosted provider or connect an OpenAI-compatible local model.</p>
      <button
        className={fixtureClassNames('btn pri')}
        type="button"
        onClick={() => updateState({
          view: 'settings',
          settings: 'agent',
        })}
      >
        <Settings2 aria-hidden="true" />
        Configure Agent
      </button>
    </div>
  );
}