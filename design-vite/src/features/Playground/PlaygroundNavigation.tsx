import { Braces, FlaskConical, RadioTower } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { PLAYGROUND_TRAFFIC_SCENARIOS } from './playgroundData';
import styles from './PlaygroundNavigation.module.css';

export function PlaygroundNavigation(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  return (
    <aside className={styles.playgroundNavigation}>
      <div className={styles.playgroundBrand}>
        <span><FlaskConical aria-hidden="true" /></span>
        <div><strong>Interceptor</strong><small>Playground</small></div>
      </div>
      <nav aria-label="Playground" className={styles.playgroundNavigationItems}>
        <button
          className={state.playgroundSection === 'capture' ? styles.active : ''}
          type="button"
          onClick={() => updateState({ playgroundSection: 'capture', playgroundManualStatus: 'not-run' })}
        >
          <RadioTower aria-hidden="true" />
          <span><strong>Capture Lab</strong><small>{PLAYGROUND_TRAFFIC_SCENARIOS.length} scenarios</small></span>
        </button>
        <button
          className={state.playgroundSection === 'mcp' ? styles.active : ''}
          type="button"
          onClick={() => updateState({ playgroundSection: 'mcp', playgroundManualStatus: 'not-run' })}
        >
          <Braces aria-hidden="true" />
          <span><strong>MCP</strong><small>Connected</small></span>
          <i aria-hidden="true" />
        </button>
      </nav>
      <footer><span>Manual acceptance</span><small>local only</small></footer>
    </aside>
  );
}