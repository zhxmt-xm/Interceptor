import { Modal } from 'antd';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button } from '../../../components/Button/Button';
import {
  McpSettingsActions,
  useMcpSettingsStore,
} from '../data/mcpSettingsStore';
import styles from './McpToolApprovalDialog.module.css';

/** Presents the oldest pending external change Tool call at App scope. */
export function McpToolApprovalDialog(): React.JSX.Element | null {
  const { t } = useTranslation();
  const approval = useMcpSettingsStore((state) => state.approvals[0] ?? null);
  const error = useMcpSettingsStore((state) => state.error);
  const [busy, setBusy] = useState(false);
  if (approval === null) return null;

  const settle = async (verdict: 'allow' | 'deny'): Promise<void> => {
    setBusy(true);
    try {
      if (verdict === 'allow') await McpSettingsActions.allowToolCall(approval.approvalId);
      else await McpSettingsActions.denyToolCall(approval.approvalId);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      aria-labelledby="mcp-tool-approval-title"
      centered
      classNames={{ container: styles.mcpApprovalModal, body: styles.mcpApprovalModalBody, mask: styles.mcpApprovalMask }}
      closable={false}
      footer={null}
      keyboard={false}
      mask={{ closable: false }}
      open
      styles={{
        container: { padding: 0, background: 'transparent', boxShadow: 'none' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      title={null}
      width={470}
    >
      <section
        className={styles.mcpApprovalDialog}
        data-approval-id={approval.approvalId}
        data-automation-id={AUTOMATION_IDS.mcp.approval.root}
        data-client-id={approval.identity.clientId}
        data-tool-name={approval.toolName}
      >
        <header className={styles.mcpApprovalHeader}>
          <span><ShieldAlert aria-hidden="true" /></span>
          <div>
            <h2 id="mcp-tool-approval-title">{t('mcp.approval.title')}</h2>
            <p>{t('mcp.approval.description', { label: approval.identity.label })}</p>
          </div>
        </header>
        <dl className={styles.mcpApprovalDetails}>
          <div><dt>{t('mcp.approval.tool')}</dt><dd><code>{approval.toolName}</code></dd></div>
          <div><dt>{t('mcp.approval.arguments')}</dt><dd><code>{JSON.stringify(approval.arguments)}</code></dd></div>
          {approval.effectDescription === undefined ? null : (
            <div><dt>{t('mcp.approval.effect')}</dt><dd>{approval.effectDescription}</dd></div>
          )}
          {approval.diff?.map((entry) => (
            <div key={entry}><dt>{t('mcp.approval.change')}</dt><dd>{entry}</dd></div>
          ))}
        </dl>
        {error !== null ? <div className={styles.mcpApprovalError} role="alert">{error}</div> : null}
        <footer>
          <Button
            automationId={AUTOMATION_IDS.mcp.approval.deny}
            disabled={busy}
            onClick={() => void settle('deny')}
          >{t('mcp.approval.deny')}</Button>
          <Button
            automationId={AUTOMATION_IDS.mcp.approval.allow}
            loading={busy}
            onClick={() => void settle('allow')}
            variant="primary"
          >{t('mcp.approval.allow')}</Button>
        </footer>
      </section>
    </Modal>
  );
}
