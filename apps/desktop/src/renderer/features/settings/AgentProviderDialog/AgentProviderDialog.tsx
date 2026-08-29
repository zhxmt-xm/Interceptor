import { Modal } from 'antd';
import { Check, EyeOff, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button/Button';
import { IconButton } from '../../../components/IconButton/IconButton';
import { InputBox } from '../../../components/InputBox/InputBox';
import type {
  AgentModelSummary,
  AgentProviderDraft,
  AgentProviderVerification,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { AgentModelsActions, useAgentModelsStore } from '../../agent/data/agentModelsStore';
import { ProviderLogo } from '../../agent/ProviderLogo/ProviderLogo';
import styles from './AgentProviderDialog.module.css';

interface AgentProviderDialogProps {
  readonly kind: AgentProviderDraft['kind'];
  readonly model: AgentModelSummary | null;
  readonly onClose: () => void;
}

interface ProviderForm {
  readonly profileName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
  readonly contextWindowTokens: string;
  readonly maximumOutputTokens: string;
}

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function initialForm(
  kind: AgentProviderDraft['kind'],
  model: AgentModelSummary | null,
): ProviderForm {
  if (model !== null) {
    return {
      profileName: model.profileName,
      baseUrl: model.baseUrl,
      apiKey: '',
      modelId: model.modelId,
      contextWindowTokens: String(model.contextWindowTokens),
      maximumOutputTokens: String(model.maximumOutputTokens),
    };
  }
  return {
    profileName: kind === 'deepseek' ? 'DeepSeek' : '',
    baseUrl: kind === 'deepseek' ? DEEPSEEK_BASE_URL : '',
    apiKey: '',
    modelId: kind === 'deepseek' ? 'deepseek-chat' : '',
    contextWindowTokens: '',
    maximumOutputTokens: '',
  };
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Edits one Provider draft and saves only Runtime's exact one-time verification. */
export function AgentProviderDialog({
  kind,
  model,
  onClose,
}: AgentProviderDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const busy = useAgentModelsStore((state) => state.busy);
  const error = useAgentModelsStore((state) => state.error);
  const [form, setForm] = useState<ProviderForm>(() => initialForm(kind, model));
  const [verification, setVerification] = useState<AgentProviderVerification | null>(null);
  const [removeApiKey, setRemoveApiKey] = useState(false);
  const custom = kind === 'openai-compatible';
  const editing = model !== null;
  const contextWindowTokens = positiveInteger(form.contextWindowTokens);
  const maximumOutputTokens = positiveInteger(form.maximumOutputTokens);
  const credentialComplete = editing && model.credentialConfigured
    ? true
    : custom || form.apiKey.length > 0;
  const complete = form.profileName.trim().length > 0
    && form.modelId.trim().length > 0
    && credentialComplete
    && (!custom || (
      form.baseUrl.trim().length > 0
      && contextWindowTokens !== null
      && maximumOutputTokens !== null
    ));

  const setField = (field: keyof ProviderForm, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setVerification(null);
  };

  const credentialChange = (): AgentProviderDraft['credential'] => {
    if (removeApiKey) {
      return { action: 'remove' };
    }
    if (form.apiKey.length > 0) {
      return { action: 'replace', apiKey: form.apiKey };
    }
    if (editing && model.credentialConfigured) {
      return { action: 'keep' };
    }
    return { action: 'remove' };
  };

  const providerDraft = (): AgentProviderDraft => {
    const credential = credentialChange();
    if (kind === 'deepseek') {
      return {
        providerId: model?.providerId ?? null,
        kind,
        profileName: form.profileName.trim(),
        modelId: form.modelId.trim(),
        credential,
      };
    }
    return {
      providerId: model?.providerId ?? null,
      kind,
      profileName: form.profileName.trim(),
      baseUrl: form.baseUrl.trim(),
      modelId: form.modelId.trim(),
      contextWindowTokens: contextWindowTokens!,
      maximumOutputTokens: maximumOutputTokens!,
      credential,
    };
  };

  const testConnection = async (): Promise<void> => {
    if (!complete) return;
    setVerification(null);
    try {
      setVerification(await AgentModelsActions.testConnection(providerDraft()));
    } catch {
      return;
    }
  };

  const save = async (): Promise<void> => {
    if (verification === null) return;
    try {
      await AgentModelsActions.saveVerified(verification.verificationId);
      onClose();
    } catch {
      setVerification(null);
    }
  };

  return (
    <Modal
      aria-labelledby="agent-provider-dialog-title"
      centered
      classNames={{ container: styles.dialog, body: styles.modalBody, mask: styles.mask }}
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
      width={560}
      onCancel={onClose}
    >
      <section
        data-automation-id={AUTOMATION_IDS.agent.provider.dialog}
        data-parity="model-provider-dialog"
      >
        <header className={styles.header}>
          <span className={styles.dialogIcon}>
            <ProviderLogo active={!custom} brand={custom ? 'unknown' : 'deepseek'} />
          </span>
          <div>
            <h2 id="agent-provider-dialog-title">
              {custom ? t('settings.agent.customProviderTitle') : 'DeepSeek'}
            </h2>
            <span>{t(custom
              ? 'settings.agent.customProviderDescription'
              : 'settings.agent.deepSeekDescription')}</span>
          </div>
          <IconButton
            disabled={busy}
            icon={X}
            label={t('settings.cancel')}
            onClick={onClose}
            size="sm"
          />
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>{t('settings.agent.profileName')}</span>
            <InputBox
              ariaLabel={t('settings.agent.profileName')}
              automationId={AUTOMATION_IDS.agent.provider.profileName}
              className={styles.control}
              disabled={busy}
              onValueChange={(value) => setField('profileName', value)}
              parity="model-provider-field-control"
              placeholder={custom ? t('settings.agent.profileNamePlaceholder') : undefined}
              value={form.profileName}
            />
          </label>
          {custom ? (
            <label className={styles.field}>
              <span>{t('settings.agent.baseUrl')}</span>
              <InputBox
                ariaLabel={t('settings.agent.baseUrl')}
                automationId={AUTOMATION_IDS.agent.provider.baseUrl}
                className={styles.control}
                disabled={busy}
                onValueChange={(value) => setField('baseUrl', value)}
                parity="model-provider-field-control"
                placeholder="http://127.0.0.1:11434/v1"
                value={form.baseUrl}
              />
              <small>{t('settings.agent.baseUrlHint')}</small>
            </label>
          ) : (
            <label className={styles.field}>
              <span>{t('settings.agent.endpoint')}</span>
              <InputBox
                ariaLabel={t('settings.agent.endpoint')}
                automationId={AUTOMATION_IDS.agent.provider.baseUrl}
                className={styles.control}
                disabled
                onValueChange={() => undefined}
                parity="model-provider-field-control"
                value={form.baseUrl}
              />
            </label>
          )}
          <label className={styles.field}>
            <span>
              {t('settings.agent.apiKey')}
              {custom ? <em>{t('settings.agent.apiKeyOptional')}</em> : null}
            </span>
            <InputBox
              ariaLabel={t('settings.agent.apiKey')}
              automationId={AUTOMATION_IDS.agent.provider.apiKey}
              className={styles.control}
              disabled={busy || removeApiKey}
              inputDataAttributes={{
                'data-credential-configured': model?.credentialConfigured ? 'true' : 'false',
                'data-credential-last-four': model?.credentialLastFour ?? '',
              }}
              onValueChange={(value) => setField('apiKey', value)}
              parity="model-provider-field-control"
              placeholder={editing && model.credentialConfigured
                ? t('settings.agent.keepApiKey', { lastFour: model.credentialLastFour })
                : custom
                  ? t('settings.agent.noApiKey')
                  : undefined}
              type="password"
              value={form.apiKey}
            >
              <EyeOff aria-hidden="true" />
            </InputBox>
          </label>
          {custom && editing && model.credentialConfigured ? (
            <label className={styles.credentialChoice}>
              <input
                checked={removeApiKey}
                data-automation-id={AUTOMATION_IDS.agent.provider.removeApiKey}
                disabled={busy}
                onChange={(event) => {
                  setRemoveApiKey(event.currentTarget.checked);
                  setVerification(null);
                }}
                type="checkbox"
              />
              <span>{t('settings.agent.removeApiKey')}</span>
            </label>
          ) : null}
          <label className={styles.field}>
            <span>{t('settings.agent.modelId')}</span>
            <InputBox
              ariaLabel={t('settings.agent.modelId')}
              automationId={AUTOMATION_IDS.agent.provider.modelId}
              className={styles.control}
              disabled={busy}
              onValueChange={(value) => setField('modelId', value)}
              parity="model-provider-field-control"
              placeholder={custom ? 'model-id' : undefined}
              value={form.modelId}
            />
          </label>
          {custom ? (
            <div className={styles.capabilities}>
              <label className={styles.field}>
                <span>{t('settings.agent.contextWindow')}</span>
                <InputBox
                  ariaLabel={t('settings.agent.contextWindow')}
                  automationId={AUTOMATION_IDS.agent.provider.contextWindow}
                  className={styles.control}
                  disabled={busy}
                  onValueChange={(value) => setField('contextWindowTokens', value)}
                  parity="model-provider-field-control"
                  placeholder="131072"
                  trailing={<code>{t('settings.agent.tokens')}</code>}
                  type="number"
                  value={form.contextWindowTokens}
                />
              </label>
              <label className={styles.field}>
                <span>{t('settings.agent.maximumOutput')}</span>
                <InputBox
                  ariaLabel={t('settings.agent.maximumOutput')}
                  automationId={AUTOMATION_IDS.agent.provider.maximumOutput}
                  className={styles.control}
                  disabled={busy}
                  onValueChange={(value) => setField('maximumOutputTokens', value)}
                  parity="model-provider-field-control"
                  placeholder="8192"
                  trailing={<code>{t('settings.agent.tokens')}</code>}
                  type="number"
                  value={form.maximumOutputTokens}
                />
              </label>
            </div>
          ) : null}
          {verification !== null ? (
            <div
              className={styles.connectionResult}
              data-automation-id={AUTOMATION_IDS.agent.provider.connectionStatus}
              data-status="verified"
              role="status"
            >
              <Check aria-hidden="true" />
              <span>{t('settings.agent.connectionVerified')}</span>
              <code>{verification.model.modelId} · {verification.model.contextWindowTokens} {t('settings.agent.context')}</code>
            </div>
          ) : null}
          {error !== null ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>

        <footer className={styles.footer}>
          <Button
            automationId={AUTOMATION_IDS.agent.provider.testConnection}
            disabled={!complete}
            loading={busy && verification === null}
            onClick={() => void testConnection()}
          >
            {t('settings.agent.testConnection')}
          </Button>
          <span />
          <Button
            automationId={AUTOMATION_IDS.agent.provider.cancel}
            disabled={busy}
            onClick={onClose}
          >
            {t('settings.cancel')}
          </Button>
          <Button
            automationId={AUTOMATION_IDS.agent.provider.save}
            disabled={verification === null}
            loading={busy && verification !== null}
            onClick={() => void save()}
            variant="primary"
          >
            {t(editing ? 'settings.agent.saveChanges' : 'settings.agent.saveProvider')}
          </Button>
        </footer>
      </section>
    </Modal>
  );
}
