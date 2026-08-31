import { Input, Modal, type InputRef } from 'antd';
import { PlugZap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button } from '../../../components/Button/Button';
import { McpSettingsActions, useMcpSettingsStore } from '../data/mcpSettingsStore';
import styles from './McpClientDialog.module.css';

interface McpClientDialogProps {
  readonly onClose: () => void;
}

/** Creates one independently authenticated local MCP Host registration. */
export function McpClientDialog({ onClose }: McpClientDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [label, setLabel] = useState('VS Code');
  const inputRef = useRef<InputRef>(null);
  const busy = useMcpSettingsStore((state) => state.busy);
  const error = useMcpSettingsStore((state) => state.error);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createClient = async (): Promise<void> => {
    try {
      await McpSettingsActions.createClient(label);
      onClose();
    } catch {
      return;
    }
  };

  return (
    <Modal
      aria-labelledby="mcp-client-dialog-title"
      centered
      classNames={{ container: styles.mcpClientModal, body: styles.mcpClientModalBody, mask: styles.mcpClientMask }}
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
      width={440}
      onCancel={onClose}
    >
      <section
        className={styles.mcpClientDialog}
        data-automation-id={AUTOMATION_IDS.mcp.client.dialog}
      >
        <header className={styles.mcpClientDialogHeader}>
          <span><PlugZap aria-hidden="true" /></span>
          <div>
            <h2 id="mcp-client-dialog-title">{t('settings.mcp.addTitle')}</h2>
            <p>{t('settings.mcp.addDescription')}</p>
          </div>
        </header>
        <div className={styles.mcpClientDialogFields}>
          <label>
            <span>{t('settings.mcp.clientName')}</span>
            <Input
              aria-label={t('settings.mcp.clientName')}
              data-automation-id={AUTOMATION_IDS.mcp.client.label}
              disabled={busy}
              ref={inputRef}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
        </div>
        {error !== null ? <div className={styles.mcpClientError} role="alert">{error}</div> : null}
        <footer>
          <Button
            automationId={AUTOMATION_IDS.mcp.client.cancel}
            disabled={busy}
            onClick={onClose}
          >{t('settings.cancel')}</Button>
          <Button
            automationId={AUTOMATION_IDS.mcp.client.create}
            disabled={label.trim().length === 0}
            loading={busy}
            onClick={() => void createClient()}
            variant="primary"
          >{t('settings.mcp.createClient')}</Button>
        </footer>
      </section>
    </Modal>
  );
}
