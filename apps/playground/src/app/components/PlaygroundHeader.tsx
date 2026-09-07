import { Download, Play, PlugZap, RotateCcw, RotateCw, Trash2 } from 'lucide-react';

import type { PlaygroundConnectionState, PlaygroundSection } from '../interfaces';
import type { PlaygroundMcpConnection } from '../../mcp/session';
import type { TrafficScenarioDescriptor } from '../../../server/scenarios/interfaces.ts';
import styles from './PlaygroundHeader.module.css';

interface PlaygroundHeaderProps {
  readonly connection: PlaygroundMcpConnection | null;
  readonly connectionState: PlaygroundConnectionState;
  readonly endpoint: string;
  readonly section: PlaygroundSection;
  readonly trafficRunning: boolean;
  readonly trafficScenario?: TrafficScenarioDescriptor;
  readonly onClearConfiguration: () => void;
  readonly onExportReport: () => void;
  readonly onReconnect: () => void;
  readonly onResetRequest: () => void;
  readonly onRunTraffic: () => void;
}

export function PlaygroundHeader({ connection, connectionState, endpoint, section, trafficRunning, trafficScenario, onClearConfiguration, onExportReport, onReconnect, onResetRequest, onRunTraffic }: PlaygroundHeaderProps): React.JSX.Element {
  if (section === 'capture') {
    return (
      <header className={styles.playgroundHeader}>
        <div className={styles.playgroundPageTitle}><strong>Capture Lab</strong><small>Generate observable traffic through Interceptor</small></div>
        <div className={styles.playgroundCaptureStatus}><span><i />Proxy</span><code data-testid="capture-proxy">127.0.0.1:8888</code><small>{trafficScenario?.title ?? 'Loading scenarios…'}</small></div>
        <div className={styles.playgroundCommands}>
          <button data-playground-action="reset-request" disabled={trafficScenario === undefined || trafficRunning} type="button" onClick={onResetRequest}><RotateCcw aria-hidden="true" />Reset request</button>
          <button className={styles.primary} data-playground-action="run" disabled={trafficScenario === undefined || trafficRunning} type="button" onClick={onRunTraffic}><Play aria-hidden="true" />{trafficRunning ? 'Running…' : 'Run'}</button>
        </div>
      </header>
    );
  }
  return (
    <header className={styles.playgroundHeader}>
      <div className={styles.playgroundPageTitle}><strong>MCP</strong><small>Inspect and call the live Tool catalog</small></div>
      <div className={styles.playgroundConnection}><span data-state={connectionState}><i />{connectionState}</span><code>{endpoint || 'No configuration in memory'}</code>{connection ? <small>{connection.serverName} {connection.serverVersion} · token sha256 {connection.credentialFingerprint.slice(0, 8)}…{connection.credentialFingerprint.slice(-4)}</small> : null}<em><PlugZap aria-hidden="true" />MCP 2026-07-28</em></div>
      <div className={styles.playgroundCommands}><button aria-label="Export acceptance report" className={styles.iconOnly} disabled={connection === null} type="button" onClick={onExportReport}><Download aria-hidden="true" /></button><button disabled={!endpoint} type="button" onClick={onReconnect}><RotateCw aria-hidden="true" />Reconnect</button><button aria-label="Clear configuration" className={styles.iconOnly} disabled={!endpoint} type="button" onClick={onClearConfiguration}><Trash2 aria-hidden="true" /></button></div>
    </header>
  );
}