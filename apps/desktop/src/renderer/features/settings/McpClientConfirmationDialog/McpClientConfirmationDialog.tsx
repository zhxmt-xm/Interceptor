import { Modal } from 'antd';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { McpDesktopClientSummary } from '../../../../shared/desktop-api';
import { Button } from '../../../components/Button/Button';
import { McpSettingsActions, useMcpSettingsStore } from '../data/mcpSettingsStore';
import styles from './McpClientConfirmationDialog.module.css';

interface McpClientConfirmationDialogProps {
  readonly action: 'regenerate' | 'revoke';
  readonly client: McpDesktopClientSummary;
  readonly onClose: () => void;
}

/** Confirms one credential rotation or Client revocation. */
export function McpClientConfirmationDialog({
  action,
  client,
  onClose,
}: McpClientConfirmationDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const busy = useMcpSettingsStore((state) => state.busy);
  const error = useMcpSettingsStore((state) => state.error);
  const regenerate = action === 'regenerate';

  const confirm = async (): Promise<void> => {
    try {
      if (regenerate) await McpSettingsActions.regenerateClientCredential(client.clientId);
      else await McpSettingsActions.revokeClient(client.clientId);
      onClose();
    } catch {
      return;
    }
  };

  return (
    <Modal
      aria-labelledby="mcp-client-confirmation-title"
      centered
      classNames={{ container: styles.mcpConfirmationModal, body: styles.mcpConfirmationModalBody, mask: styles.mcpConfirmationMask }}
      closable={false}
      destroyOnHidden
      footer={null}
      keyboard={!busy}
      mask={{ closable: !busy }}
      open
      styles={{
        container: { padding: 0, background: 'transparent', boxShadow: 'none' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      title={null}
      width={430}
      onCancel={onClose}
    >
      <section
        className={styles.mcpConfirmationDialog}
        data-automation-id={regenerate
          ? AUTOMATION_IDS.mcp.client.regenerateDialog
          : AUTOMATION_IDS.mcp.client.revokeDialog}
      >
        <span className={styles.mcpConfirmationIcon}><AlertTriangle aria-hidden="true" /></span>
        <div className={styles.mcpConfirmationCopy}>
          <h2 id="mcp-client-confirmation-title">
            {regenerate ? t('settings.mcp.regenerateTitle') : t('settings.mcp.revokeTitle')}
          </h2>
          <p>{regenerate
            ? t('settings.mcp.regenerateDescription')
            : t('settings.mcp.revokeDescription', { label: client.label })}</p>
          {error !== null ? <div className={styles.mcpConfirmationError} role="alert">{error}</div> : null}
        </div>
        <footer>
          <Button
            automationId={regenerate
              ? AUTOMATION_IDS.mcp.client.regenerateCancel
              : AUTOMATION_IDS.mcp.client.revokeCancel}
            disabled={busy}
            onClick={onClose}
          >{t('settings.cancel')}</Button>
          <Button
            automationId={regenerate
              ? AUTOMATION_IDS.mcp.client.regenerateConfirm
              : AUTOMATION_IDS.mcp.client.revokeConfirm}
            loading={busy}
            onClick={() => void confirm()}
            variant={regenerate ? 'primary' : 'danger'}
          >{regenerate ? t('settings.mcp.regenerateCredential') : t('settings.mcp.revokeClient')}</Button>
        </footer>
      </section>
    </Modal>
  );
}
