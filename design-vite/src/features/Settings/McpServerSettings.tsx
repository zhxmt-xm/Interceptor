import { Switch } from 'antd';
import { Code2, Copy, Plus, RefreshCw, Server, Trash2, TriangleAlert } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './McpServerSettings.module.css';

const MCP_ENDPOINT = 'http://127.0.0.1:43127/mcp';

export function McpServerSettings(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const enabled = state.mcpServerState !== 'disabled';
  const conflict = state.mcpServerState === 'conflict';
  const endpointAssigned = state.mcpEndpointAssigned || enabled;
  const hasClient = state.mcpClientLabel.length > 0;

  const setEnabled = (nextEnabled: boolean): void => {
    updateState(nextEnabled
      ? { mcpServerState: 'running', mcpEndpointAssigned: true }
      : { mcpServerState: 'disabled' });
  };

  return (
    <section
      className={styles.mcpServerSettings}
      data-parity="mcp-server-settings"
      data-server-state={state.mcpServerState}
    >
      <header className={styles.mcpServerHeader}>
        <span className={styles.mcpServerIcon}><Server aria-hidden="true" /></span>
        <div className={styles.mcpServerHeading}>
          <strong>MCP server</strong>
          <span>Connect external AI hosts to the same Interceptor tools and capture state.</span>
        </div>
        <span className={styles.mcpServerStatus} data-state={state.mcpServerState}>
          <i aria-hidden="true" />
          {conflict ? 'Port unavailable' : enabled ? 'Running' : 'Off'}
        </span>
        <Switch
          aria-label="Enable MCP server"
          checked={enabled}
          size="small"
          onChange={setEnabled}
        />
      </header>

      <div className={styles.mcpEndpointRow}>
        <div className={styles.mcpEndpointCopy}>
          <span>Endpoint</span>
          {endpointAssigned ? <code>{MCP_ENDPOINT}</code> : <strong>No listener</strong>}
        </div>
        {conflict ? (
          <button
            className={fixtureClassNames('btn sm')}
            type="button"
            onClick={() => updateState({ mcpServerState: 'running', mcpEndpointAssigned: true })}
          ><RefreshCw aria-hidden="true" />Change endpoint</button>
        ) : endpointAssigned ? (
          <IconButton
            icon={<Copy aria-hidden="true" />}
            label="Copy MCP endpoint"
            onClick={() => undefined}
          />
        ) : null}
      </div>

      {conflict ? (
        <div className={styles.mcpEndpointConflict} role="alert">
          <TriangleAlert aria-hidden="true" />
          The saved port is already in use. Choose a new endpoint before reconnecting clients.
        </div>
      ) : null}

      <div className={styles.mcpClientsHeader}>
        <div>
          <strong>Clients</strong>
          <span>Each client has an independent credential and execution mode.</span>
        </div>
        <button
          className={fixtureClassNames('btn sm')}
          disabled={!enabled || conflict}
          type="button"
          onClick={() => updateState({ mcpClientDialog: 'add' })}
        ><Plus aria-hidden="true" />Add client</button>
      </div>

      {hasClient ? (
        <div
          className={styles.mcpClientRow}
          data-config-copied={state.mcpConfigCopied ? 'true' : 'false'}
          data-credential-generation={state.mcpCredentialGeneration}
          data-parity="mcp-client-row"
        >
          <span className={styles.mcpClientIcon}><Code2 aria-hidden="true" /></span>
          <div className={styles.mcpClientCopy}>
            <strong>{state.mcpClientLabel}</strong>
            <span>{enabled && !conflict ? 'Ready to connect' : 'Server unavailable'} · Credential configured</span>
          </div>
          <SegmentedControl
            ariaLabel={`${state.mcpClientLabel} execution mode`}
            options={[
              { label: 'Ask', value: 'ask' },
              { label: 'Auto', value: 'auto' },
            ]}
            value={state.mcpClientExecutionMode}
            onChange={(mcpClientExecutionMode) => updateState({ mcpClientExecutionMode })}
          />
          <div className={styles.mcpClientActions}>
            <IconButton
              icon={<Copy aria-hidden="true" />}
              label="Copy MCP configuration"
              onClick={() => updateState({ mcpConfigCopied: true })}
            />
            <IconButton
              icon={<RefreshCw aria-hidden="true" />}
              label="Regenerate credential"
              onClick={() => updateState({ mcpClientDialog: 'regenerate' })}
            />
            <IconButton
              icon={<Trash2 aria-hidden="true" />}
              label="Revoke client"
              tone="danger"
              onClick={() => updateState({ mcpClientDialog: 'revoke' })}
            />
          </div>
        </div>
      ) : (
        <div className={styles.mcpClientsEmpty}>
          <span>No clients configured</span>
          <small>Enable the server, then add a trusted local AI host.</small>
        </div>
      )}
    </section>
  );
}