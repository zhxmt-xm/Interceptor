import { ConfigProvider, Radio, theme as antTheme } from 'antd';
import { Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, InputBox, Select } from '../../../components';
import { UpstreamSettingsActions, useUpstreamSettingsStore } from '../data/upstreamSettingsStore';
import { CurrentUpstreamRoute } from './CurrentUpstreamRoute';
import styles from './UpstreamProxyEditor.module.css';
import { upstreamDraftValidation } from './utils';

interface UpstreamProxyEditorProps {
  readonly compact?: boolean;
}

export function UpstreamProxyEditor({ compact = false }: UpstreamProxyEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const { theme } = useContext(ConfigProvider.ConfigContext);
  const { token } = antTheme.useToken();
  const { snapshot, draft, dirty, loading, busy, error } = useUpstreamSettingsStore();
  const applying = busy || (snapshot !== null && snapshot.operation !== 'idle');
  const blocked = applying || !snapshot;
  const invalid = upstreamDraftValidation(draft);
  const discovering = snapshot?.operation === 'discovering' || (busy && draft.mode === 'wpad');

  return (
    <ConfigProvider theme={{
      inherit: false,
      algorithm: theme?.algorithm,
      token: {
        colorPrimary: token.colorPrimary, colorError: token.colorError, colorSuccess: token.colorSuccess,
        colorBgElevated: 'var(--panel)', colorText: 'var(--text)', colorTextSecondary: 'var(--text-2)',
        borderRadius: 9, controlHeight: 34, fontFamily: 'var(--font-ui)', fontSize: 13,
        motionDurationFast: '0.12s', motionDurationMid: '0.18s',
      },
    }}>
    <div className={styles.upstreamEditor} data-compact={compact} data-parity="upstream-editor"
      data-upstream-editor={compact ? 'quick' : 'settings'} aria-busy={applying}>
      <CurrentUpstreamRoute snapshot={snapshot} compact={compact} />
      <div className={styles.upstreamConfiguration}>
        <div className={styles.upstreamModeSection}>
          <div className={styles.upstreamSectionTitle}>
            <span>{t('upstream.connectionMode')}</span>
            {dirty ? <span className={styles.upstreamUnsaved} data-parity="upstream-not-applied">{t('upstream.notApplied')}</span> : null}
          </div>
          <Radio.Group value={draft.mode} name={`upstream-${compact ? 'quick' : 'settings'}-mode`} disabled={blocked}
            className={styles.upstreamModes} aria-label={t('upstream.connectionMode')} data-parity="upstream-modes">
            {(['system', 'direct', 'manual', 'pac', 'wpad'] as const).map(mode => (
              <Radio key={mode} value={mode} onChange={() => UpstreamSettingsActions.updateDraft({ mode })}
                className={[styles.upstreamModeOption, draft.mode === mode ? styles.upstreamModeSelected : ''].filter(Boolean).join(' ')}
                data-automation-id={AUTOMATION_IDS.upstream.mode[mode]}
                styles={{ root: { alignItems: 'center', marginInlineEnd: 0 }, label: { flex: 1, minWidth: 0 } }}>
                <span className={styles.upstreamOptionLabel}>
                  <span>{t(`upstream.${mode}`)}</span>
                  {mode === 'system' ? <small>{t('upstream.default')}</small> : null}
                </span>
                {!compact ? <span className={styles.upstreamOptionDescription}>{t(`upstream.${mode}Hint`)}</span> : null}
              </Radio>
            ))}
          </Radio.Group>
        </div>
        <div className={styles.upstreamModeDetails}>
          {!compact ? <div className={styles.upstreamSectionTitle}>{t('upstream.configuration')}</div> : null}
          {draft.mode === 'manual' ? <div className={styles.upstreamFields}>
            <label className={styles.upstreamField}>
              <span className={styles.upstreamFieldLabel}>{t('capture.protocol')}</span>
              <Select appearance="form" value={draft.protocol} disabled={blocked} ariaLabel={t('capture.protocol')}
                automationId={AUTOMATION_IDS.upstream.protocol}
                options={(['http', 'https', 'socks5'] as const).map(protocol => ({
                  value: protocol, label: protocol.toUpperCase(), automationId: AUTOMATION_IDS.upstream.protocolOption[protocol],
                }))}
                onValueChange={protocol => {
                  if (protocol !== 'http' && protocol !== 'https' && protocol !== 'socks5') throw new Error('Unexpected upstream protocol.');
                  UpstreamSettingsActions.updateDraft({ protocol });
                }} />
            </label>
            <div className={styles.upstreamAddressFields}>
              <label className={styles.upstreamField}>
                <span className={styles.upstreamFieldLabel}>{t('capture.host')}</span>
                <InputBox appearance="form" value={draft.host} disabled={blocked} ariaLabel={t('capture.host')}
                  placeholder="127.0.0.1" automationId={AUTOMATION_IDS.upstream.host}
                  className={styles.upstreamTechnicalInput} onValueChange={host => UpstreamSettingsActions.updateDraft({ host })} />
              </label>
              <label className={styles.upstreamField}>
                <span className={styles.upstreamFieldLabel}>{t('capture.port')}</span>
                <InputBox appearance="form" value={draft.port} disabled={blocked} ariaLabel={t('capture.port')}
                  inputMode="numeric" placeholder="7890" automationId={AUTOMATION_IDS.upstream.port}
                  className={styles.upstreamTechnicalInput} onValueChange={port => UpstreamSettingsActions.updateDraft({ port })} />
              </label>
            </div>
            <p className={styles.upstreamHint}>{t('upstream.manualDestinationHint')}</p>
          </div> : draft.mode === 'pac' ? <div className={styles.upstreamFields}>
            <label className={styles.upstreamField}>
              <span className={styles.upstreamFieldLabel}>{t('upstream.pac')}</span>
              <InputBox appearance="form" value={draft.url} disabled={blocked} ariaLabel={t('upstream.pac')}
                inputMode="url" placeholder="https://proxy.example.test/proxy.pac" automationId={AUTOMATION_IDS.upstream.pacUrl}
                className={styles.upstreamTechnicalInput} onValueChange={url => UpstreamSettingsActions.updateDraft({ url })} />
            </label>
            <p className={styles.upstreamHint}>{t('upstream.pacDestinationHint')}</p>
          </div> : <div className={styles.upstreamExplanation}>
            <b>{t(`upstream.${draft.mode}Title`)}</b>
            <p>{t(`upstream.${draft.mode}Body`)}</p>
            {draft.mode === 'wpad' ? <p className={styles.upstreamHint}>{t('upstream.wpadFailureHint')}</p> : null}
          </div>}
          {invalid ? <div role="alert" className={styles.upstreamError} data-parity="upstream-validation">
            <TriangleAlert size={15} aria-hidden="true" /><span>{t(invalid)}</span>
          </div> : null}
        </div>
      </div>
      {error ? <div role="alert" className={styles.upstreamError} data-automation-id={AUTOMATION_IDS.upstream.error}>
        <TriangleAlert size={16} aria-hidden="true" />
        <span><b>{t(error.kind === 'discovery' ? 'upstream.wpadNotFound' : 'upstream.applyFailed')}</b>{' '}
          {error.kind === 'discovery' ? t('upstream.wpadAdvice') : error.message}{' '}{t('upstream.routeUnchanged')}</span>
      </div> : applying || (loading && !snapshot) ? <div className={styles.upstreamProgress}
        role="status" data-automation-id={AUTOMATION_IDS.upstream.progress}>
        <LoaderCircle className={styles.upstreamSpinner} size={16} aria-hidden="true" />
        <span>{t(!snapshot ? 'upstream.loading' : discovering ? 'upstream.looking' : 'upstream.applyProgress')}</span>
      </div> : null}
      <div className={styles.upstreamFooter}>
        <p className={styles.upstreamFootnote}><Info size={14} aria-hidden="true" /><span>{t('upstream.newRequests')}</span></p>
        <div className={styles.upstreamActions}>
          <Button size="sm" className={styles.upstreamActionButton} disabled={applying || (!compact && !dirty && !error)}
            automationId={AUTOMATION_IDS.upstream.discard} onClick={() => UpstreamSettingsActions.cancelDraft()}>
            {t(compact ? 'capture.cancel' : 'upstream.discard')}
          </Button>
          <Button size="sm" className={styles.upstreamActionButton} variant="primary"
            disabled={blocked || Boolean(invalid) || (!dirty && !error && snapshot?.health !== 'unreachable')}
            automationId={AUTOMATION_IDS.upstream.apply}
            onClick={() => { void UpstreamSettingsActions.apply().catch(failure => console.error('[upstream] Apply failed.', failure)); }}>
            {t(applying ? discovering ? 'upstream.discovering' : 'upstream.applying' : error ? 'boot.retry' : 'upstream.apply')}
          </Button>
        </div>
      </div>
    </div>
    </ConfigProvider>
  );
}
