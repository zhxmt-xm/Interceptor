import { Play, PlugZap, RotateCcw, RotateCw, Trash2 } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { playgroundTrafficScenario } from './playgroundData';
import styles from './PlaygroundHeader.module.css';

export function PlaygroundHeader(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  if (state.playgroundSection === 'capture') {
    const scenario = playgroundTrafficScenario(state.playgroundSelectedScenario);
    return (
      <header className={styles.playgroundHeader}>
        <div className={styles.playgroundPageTitle}><strong>Capture Lab</strong><small>Generate observable traffic through Interceptor</small></div>
        <div className={styles.playgroundCaptureStatus}><span><i />Proxy</span><code>127.0.0.1:8888</code><small>{scenario.title}</small></div>
        <div className={styles.playgroundCommands}>
          <button type="button" onClick={() => updateState({
            playgroundRequestDraft: JSON.stringify(scenario.draft, null, 2),
          })}><RotateCcw aria-hidden="true" />Reset request</button>
          <button className={styles.primary} type="button"><Play aria-hidden="true" />Run</button>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.playgroundHeader}>
      <div className={styles.playgroundPageTitle}><strong>MCP</strong><small>Inspect and call the live Tool catalog</small></div>
      <div className={styles.playgroundConnection}>
        <span className={styles.playgroundConnectionState}><i />Connected</span>
        <code>http://127.0.0.1:43127/mcp</code>
        <small>Interceptor 0.1.0 · token sha256 7c91a282…d42a</small>
        <span className={styles.playgroundProtocol}><PlugZap aria-hidden="true" />MCP 2026-07-28</span>
      </div>
      <div className={styles.playgroundCommands}>
        <button type="button"><RotateCw aria-hidden="true" />Reconnect</button>
        <button aria-label="Clear configuration" className={styles.iconOnly} type="button"><Trash2 aria-hidden="true" /></button>
      </div>
    </header>
  );
}