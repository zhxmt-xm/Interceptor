import { App, Switch } from 'antd';
import { Code2, Copy, Plus, RefreshCw, Server, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import type { McpDesktopClientSummary } from '../../../../shared/desktop-api';
import { Button } from '../../../components/Button/Button';
import { IconButton } from '../../../components/IconButton/IconButton';
import { Segmented } from '../../../components/Segmented/Segmented';
import {
  McpSettingsActions,
  useMcpSettingsStore,
} from '../data/mcpSettingsStore';
import { McpClientDialog } from '../McpClientDialog/McpClientDialog';
import { McpClientConfirmationDialog } from '../McpClientConfirmationDialog/McpClientConfirmationDialog';
import styles from './McpServerSettings.module.css';

type ConfirmationAction = 'regenerate' | 'revoke';

/** Renders the loopback MCP endpoint and credential-free Client controls. */
export function McpServerSettings(): React.JSX.Element {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const status = useMcpSettingsStore((state) => state.status);
  const loading = useMcpSettingsStore((state) => state.loading);
  const busy = useMcpSettingsStore((state) => state.busy);
  const error = useMcpSettingsStore((state) => state.error);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: ConfirmationAction;
    client: McpDesktopClientSummary;
  } | null>(null);
  const state = status?.state ?? 'disabled';
  const enabled = state !== 'disabled';
  const conflict = state === 'endpoint-conflict';
  const endpoint = status?.endpoint ?? null;
  const clients = status?.clients ?? [];

  useEffect(() => {
    void McpSettingsActions.load().catch(() => undefined);
  }, []);

  const setEnabled = (nextEnabled: boolean): void => {
    const operation = nextEnabled
      ? McpSettingsActions.enableServer()
      : McpSettingsActions.disableServer();
    void operation.catch(() => undefined);
  };

  const copyEndpoint = (): void => {
    if (endpoint === null) return;
    void navigator.clipboard.writeText(endpoint).then(() => {
      void message.success({ content: t('settings.mcp.endpointCopied'), duration: 2 });
    });
  };

  const copyConfiguration = (client: McpDesktopClientSummary): void => {
    void McpSettingsActions.copyClientConfiguration(client.clientId)
      .then(() => message.success({
        content: t('settings.mcp.configurationCopied'),
        duration: 2,
      }))
      .catch(() => undefined);
  };

  return (
    <>
      <section
        aria-busy={loading || busy}
        className={styles.mcpServerSettings}
        data-automation-id={AUTOMATION_IDS.mcp.server.root}
        data-client-count={clients.length}
        data-parity="mcp-server-settings"
        data-server-state={state}
      >
        <header className={styles.mcpServerHeader}>
          <span className={styles.mcpServerIcon}><Server aria-hidden="true" /></span>
          <div className={styles.mcpServerHeading}>
            <strong>{t('settings.mcp.title')}</strong>
            <span>{t('settings.mcp.description')}</span>
          </div>
          <span className={styles.mcpServerStatus} data-state={state}>
            <i aria-hidden="true" />
            {conflict
              ? t('settings.mcp.statusConflict')
              : enabled ? t('settings.mcp.statusRunning') : t('settings.mcp.statusOff')}
          </span>
          <Switch
            aria-label={t('settings.mcp.title')}
            checked={enabled}
            data-automation-id={AUTOMATION_IDS.mcp.server.enable}
            disabled={loading || busy}
            size="small"
            onChange={setEnabled}
          />
        </header>

        <p
          className={styles.mcpProtocolSupport}
          data-automation-id={AUTOMATION_IDS.mcp.server.protocolSupport}
          data-parity="mcp-protocol-support"
        >
          {t('settings.mcp.protocolSupport')}
        </p>

        <div className={styles.mcpEndpointRow}>
          <div
            className={styles.mcpEndpointCopy}
            data-automation-id={AUTOMATION_IDS.mcp.server.endpoint}
            data-endpoint={endpoint ?? ''}
          >
            <span>{t('settings.mcp.endpoint')}</span>
            {endpoint === null ? <strong>{t('settings.mcp.noListener')}</strong> : <code>{endpoint}</code>}
          </div>
          {conflict ? (
            <Button
              automationId={AUTOMATION_IDS.mcp.server.changeEndpoint}
              disabled={busy}
              icon={RefreshCw}
              onClick={() => void McpSettingsActions.changeEndpoint().catch(() => undefined)}
              size="sm"
            >{t('settings.mcp.changeEndpoint')}</Button>
          ) : endpoint === null ? null : (
            <IconButton
              icon={Copy}
              label={t('settings.mcp.copyEndpoint')}
              onClick={copyEndpoint}
              size="sm"
            />
          )}
        </div>

        {conflict ? (
          <div className={styles.mcpEndpointConflict} role="alert">
            <TriangleAlert aria-hidden="true" />
            {status?.detail ?? 'The saved port is already in use.'}
          </div>
        ) : null}

        <div className={styles.mcpClientsHeader}>
          <div>
            <strong>{t('settings.mcp.clients')}</strong>
            <span>{t('settings.mcp.clientsDescription')}</span>
          </div>
          <Button
            automationId={AUTOMATION_IDS.mcp.client.add}
            disabled={!enabled || conflict || busy}
            icon={Plus}
            onClick={() => setAddClientOpen(true)}
            size="sm"
          >{t('settings.mcp.addClient')}</Button>
        </div>

        {clients.length > 0 ? clients.map((client) => (
          <div
            className={styles.mcpClientRow}
            data-automation-id={AutomationIdFactory.mcpClientRow(client.clientId)}
            data-client-id={client.clientId}
            data-execution-mode={client.executionMode}
            key={client.clientId}
          >
            <span className={styles.mcpClientIcon}><Code2 aria-hidden="true" /></span>
            <div className={styles.mcpClientCopy}>
              <strong>{client.label}</strong>
              <span>{enabled && !conflict ? t('settings.mcp.ready') : t('settings.mcp.unavailable')} · {t('settings.mcp.credentialConfigured')}</span>
            </div>
            <Segmented
              ariaLabel={t('settings.mcp.executionMode', { label: client.label })}
              automationIds={{
                ask: AutomationIdFactory.mcpClientAsk(client.clientId),
                auto: AutomationIdFactory.mcpClientAuto(client.clientId),
              }}
              options={[
                { label: t('agent.executionAsk'), value: 'ask', disabled: busy },
                { label: t('agent.executionAuto'), value: 'auto', disabled: busy },
              ]}
              value={client.executionMode}
              onChange={(mode) => {
                const operation = mode === 'ask'
                  ? McpSettingsActions.requireClientApproval(client.clientId)
                  : McpSettingsActions.automaticallyExecuteClientTools(client.clientId);
                void operation.catch(() => undefined);
              }}
            />
            <div className={styles.mcpClientActions}>
              <IconButton
                automationId={AutomationIdFactory.mcpClientCopyConfiguration(client.clientId)}
                disabled={busy}
                icon={Copy}
                label={t('settings.mcp.copyConfiguration')}
                onClick={() => copyConfiguration(client)}
                size="sm"
              />
              <IconButton
                automationId={AutomationIdFactory.mcpClientRegenerate(client.clientId)}
                disabled={busy}
                icon={RefreshCw}
                label={t('settings.mcp.regenerateCredential')}
                onClick={() => setConfirmation({ action: 'regenerate', client })}
                size="sm"
              />
              <IconButton
                automationId={AutomationIdFactory.mcpClientRevoke(client.clientId)}
                className={styles.mcpDangerAction}
                disabled={busy}
                icon={Trash2}
                label={t('settings.mcp.revokeClient')}
                onClick={() => setConfirmation({ action: 'revoke', client })}
                size="sm"
              />
            </div>
          </div>
        )) : (
          <div className={styles.mcpClientsEmpty}>
            <span>{t('settings.mcp.noClients')}</span>
            <small>{t('settings.mcp.noClientsDescription')}</small>
          </div>
        )}
        {error !== null ? <div className={styles.mcpServerError} role="alert">{error}</div> : null}
      </section>

      {addClientOpen ? <McpClientDialog onClose={() => setAddClientOpen(false)} /> : null}
      {confirmation !== null ? (
        <McpClientConfirmationDialog
          action={confirmation.action}
          client={confirmation.client}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
    </>
  );
}
