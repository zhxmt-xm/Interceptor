import { FlaskConical, PlugZap, RotateCw, Trash2 } from 'lucide-react';

import styles from './PlaygroundHeader.module.css';

export function PlaygroundHeader(): React.JSX.Element {
  return (
    <header className={styles.playgroundHeader}>
      <div className={styles.playgroundBrand}>
        <span><FlaskConical aria-hidden="true" /></span>
        <div><strong>Interceptor Playground</strong><small>Manual acceptance workspace</small></div>
      </div>
      <div className={styles.playgroundConnection}>
        <span className={styles.playgroundConnectionState}><i />Connected</span>
        <code>http://127.0.0.1:43127/mcp</code>
        <small>Interceptor 0.1.0 · token sha256 7c91a282…d42a</small>
        <span className={styles.playgroundProtocol}><PlugZap aria-hidden="true" />MCP 2026-07-28</span>
      </div>
      <div className={styles.playgroundCommands}>
        <button aria-label="Reconnect" type="button"><RotateCw aria-hidden="true" /></button>
        <button aria-label="Clear configuration" type="button"><Trash2 aria-hidden="true" /></button>
      </div>
    </header>
  );
}