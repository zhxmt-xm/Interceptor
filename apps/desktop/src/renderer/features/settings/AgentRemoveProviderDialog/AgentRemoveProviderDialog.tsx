import { Modal } from 'antd';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button/Button';
import type { AgentModelSummary } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentModelsActions, useAgentModelsStore } from '../../agent/data/agentModelsStore';
import styles from './AgentRemoveProviderDialog.module.css';

interface AgentRemoveProviderDialogProps {
  readonly model: AgentModelSummary;
  readonly onClose: () => void;
}

/** Confirms and executes one explicit Provider removal. */
export function AgentRemoveProviderDialog({
  model,
  onClose,
}: AgentRemoveProviderDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const busy = useAgentModelsStore((state) => state.busy);
  const error = useAgentModelsStore((state) => state.error);

  const remove = async (): Promise<void> => {
    try {
      await AgentModelsActions.remove(model.providerId);
      onClose();
    } catch {
      return;
    }
  };

  return (
    <Modal
      aria-labelledby="agent-remove-provider-title"
      centered
      classNames={{ container: styles.modal, body: styles.modalBody, mask: styles.mask }}
      closable={false}
      destroyOnHidden
      footer={null}
      keyboard={!busy}
      mask={{ closable: !busy }}
      open
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      title={null}
      width={420}
      onCancel={onClose}
    >
      <section
        className={styles.dialog}
        data-automation-id={AUTOMATION_IDS.agent.removeProvider.dialog}
      >
        <span className={styles.icon}><AlertTriangle aria-hidden="true" /></span>
        <div className={styles.copy}>
          <h2 id="agent-remove-provider-title">
            {t('settings.agent.removeTitle', { name: model.profileName })}
          </h2>
          <p>{t('settings.agent.removeDescription')}</p>
          {error !== null ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>
        <footer>
          <Button
            automationId={AUTOMATION_IDS.agent.removeProvider.cancel}
            disabled={busy}
            onClick={onClose}
          >
            {t('settings.cancel')}
          </Button>
          <Button
            automationId={AUTOMATION_IDS.agent.removeProvider.confirm}
            loading={busy}
            onClick={() => void remove()}
            variant="danger"
          >
            {t('settings.agent.confirmRemove')}
          </Button>
        </footer>
      </section>
    </Modal>
  );
}
