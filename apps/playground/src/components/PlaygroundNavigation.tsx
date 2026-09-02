import { Braces, FlaskConical, RadioTower } from 'lucide-react';

import type { PlaygroundConnectionState, PlaygroundSection } from '../interfaces';
import styles from './PlaygroundNavigation.module.css';

interface PlaygroundNavigationProps {
  readonly connectionState: PlaygroundConnectionState;
  readonly scenarioCount: number;
  readonly section: PlaygroundSection;
  readonly onSectionChange: (section: PlaygroundSection) => void;
}

export function PlaygroundNavigation({ connectionState, scenarioCount, section, onSectionChange }: PlaygroundNavigationProps): React.JSX.Element {
  return (
    <aside className={styles.playgroundNavigation}>
      <div className={styles.playgroundBrand}>
        <span><FlaskConical aria-hidden="true" /></span>
        <div><strong>Interceptor</strong><small>Playground</small></div>
      </div>
      <nav aria-label="Playground" className={styles.playgroundNavigationItems}>
        <button className={section === 'capture' ? styles.active : ''} type="button" onClick={() => onSectionChange('capture')}>
          <RadioTower aria-hidden="true" />
          <span><strong>Capture Lab</strong><small>{scenarioCount} scenarios</small></span>
        </button>
        <button className={section === 'mcp' ? styles.active : ''} type="button" onClick={() => onSectionChange('mcp')}>
          <Braces aria-hidden="true" />
          <span><strong>MCP</strong><small>{connectionState}</small></span>
          <i aria-hidden="true" data-state={connectionState} />
        </button>
      </nav>
      <footer><span>Manual acceptance</span><small>local only</small></footer>
    </aside>
  );
}