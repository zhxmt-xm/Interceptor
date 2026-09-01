import { Download, FlaskConical, PlugZap, RotateCw, Trash2 } from 'lucide-react';

import type { PlaygroundConnectionState } from '../interfaces';
import type { PlaygroundMcpConnection } from '../mcp/session';
import styles from './PlaygroundHeader.module.css';

interface PlaygroundHeaderProps {
  readonly connection: PlaygroundMcpConnection | null;
  readonly connectionState: PlaygroundConnectionState;
  readonly endpoint: string;
  readonly onClearConfiguration: () => void;
  readonly onExportReport: () => void;
  readonly onReconnect: () => void;
}

export function PlaygroundHeader({ connection, connectionState, endpoint, onClearConfiguration, onExportReport, onReconnect }: PlaygroundHeaderProps): React.JSX.Element {
  return (
    <header className={styles.playgroundHeader}>
      <div className={styles.playgroundBrand}><span><FlaskConical aria-hidden="true" /></span><div><strong>Interceptor Playground</strong><small>Manual acceptance workspace</small></div></div>
      <div className={styles.playgroundConnection}><span data-state={connectionState}><i />{connectionState}</span><code>{endpoint || 'No configuration in memory'}</code>{connection ? <small>{connection.serverName} {connection.serverVersion} · token sha256 {connection.credentialFingerprint.slice(0, 8)}…{connection.credentialFingerprint.slice(-4)}</small> : null}<em><PlugZap aria-hidden="true" />MCP 2026-07-28</em></div>
      <div className={styles.playgroundCommands}><button aria-label="Export acceptance report" disabled={connection === null} type="button" onClick={onExportReport}><Download aria-hidden="true" /></button><button aria-label="Reconnect" disabled={!endpoint} type="button" onClick={onReconnect}><RotateCw aria-hidden="true" /></button><button aria-label="Clear configuration" disabled={!endpoint} type="button" onClick={onClearConfiguration}><Trash2 aria-hidden="true" /></button></div>
    </header>
  );
}