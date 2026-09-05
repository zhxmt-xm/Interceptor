import { ClipboardPaste, PlugZap } from 'lucide-react';
import { useState } from 'react';

import type { PlaygroundConnectionState } from '../interfaces';
import styles from './ConnectionPanel.module.css';

interface ConnectionPanelProps {
  readonly error: string;
  readonly state: PlaygroundConnectionState;
  readonly onConnect: (configuration: string) => void;
}

export function ConnectionPanel({ error, state, onConnect }: ConnectionPanelProps): React.JSX.Element {
  const [configuration, setConfiguration] = useState('');
  const connecting = state === 'connecting';
  const submit = (): void => {
    if (configuration.trim().length === 0 || connecting) return;
    onConnect(configuration);
    setConfiguration('');
  };
  return (
    <section className={styles.connectionPanel}>
      <div className={styles.connectionIntro}><span><PlugZap aria-hidden="true" /></span><h1>Connect to Interceptor</h1><p>Paste the configuration copied from Settings &gt; Agent &gt; MCP Server. The Bearer stays in this page memory only.</p></div>
      <label><span>Host configuration</span><textarea aria-label="Host configuration" data-automation-id="playground.mcp.configuration" autoComplete="off" spellCheck={false} value={configuration} onChange={(event) => setConfiguration(event.target.value)} /></label>
      {error ? <div className={styles.connectionError} role="alert">{error}</div> : null}
      <button data-automation-id="playground.mcp.connect" disabled={configuration.trim().length === 0 || connecting} type="button" onClick={submit}><ClipboardPaste aria-hidden="true" />{connecting ? 'Connecting…' : 'Connect'}</button>
    </section>
  );
}