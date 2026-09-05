import { Copy, FolderOpen, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CertificateInfo,
  InterceptorDesktopApi,
} from '../../../../shared/desktop-api';
import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../shared/automation-ids';
import { Button, cx, IconButton, StatusBadge, Switch } from '../../../components';
import { formatDate } from '../utils';
import { useTlsCompatibilityStore } from '../data/tlsCompatibilityStore';

import styles from './CertificatesPanel.module.css';
import { SettingsGroup as Group } from './SettingsGroup';
import { SettingsRow as Row } from './SettingsRow';

type CertState = 'loading' | 'ready' | 'error';

/** The Certificates settings section, backed by the Main CA + trust-store services. */
export function CertificatesPanel(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [info, setInfo] = useState<CertificateInfo | null>(null);
  const [hosts, setHosts] = useState<string[]>([]);
  const [state, setState] = useState<CertState>('loading');
  const [busy, setBusy] = useState(false);
  const [draftHost, setDraftHost] = useState('');
  const loadGeneration = useRef(0);
  const settingsChangeSequence = useTlsCompatibilityStore((value) => value.settingsChangeSequence);

  const load = useCallback((): void => {
    const generation = ++loadGeneration.current;
    const api = window.interceptor;
    if (!api) {
      setState('error');
      return;
    }
    setState('loading');
    void Promise.all([api.getCertificateStatus(), api.getInsecureHosts()])
      .then(([nextInfo, nextHosts]) => {
        if (generation !== loadGeneration.current) return;
        setInfo(nextInfo);
        setHosts(nextHosts);
        setState('ready');
      })
      .catch(() => {
        if (generation === loadGeneration.current) setState('error');
      });
  }, []);

  useEffect(() => {
    load();
    return () => { loadGeneration.current += 1; };
  }, [load, settingsChangeSequence]);

  // CA 操作直接用返回的 CertificateInfo 更新，避免重新 load 造成 loading 闪烁。
  const applyInfo = useCallback(
    (action: (api: InterceptorDesktopApi) => Promise<CertificateInfo>): void => {
      const api = window.interceptor;
      if (!api || busy) {
        return;
      }
      setBusy(true);
      void Promise.resolve(action(api))
        .then((nextInfo) => setInfo(nextInfo))
        .catch(() => setState('error'))
        .finally(() => setBusy(false));
    },
    [busy],
  );

  // per-host 例外操作用返回的 hosts 更新，同样不触发整面板重载。
  const applyHosts = useCallback(
    (action: (api: InterceptorDesktopApi) => Promise<string[]>): void => {
      const api = window.interceptor;
      if (!api || busy) {
        return;
      }
      setBusy(true);
      void Promise.resolve(action(api))
        .then((nextHosts) => setHosts(nextHosts))
        .catch(() => setState('error'))
        .finally(() => setBusy(false));
    },
    [busy],
  );

  if (state === 'loading' || !info) {
    return (
      <>
        <h2 className={styles.title}>{t('settings.certificates')}</h2>
        <div className={styles.desc}>
          {state === 'error'
            ? t('settings.certificateUnavailable')
            : t('settings.loadingCertificate')}
        </div>
      </>
    );
  }

  const addHost = (): void => {
    const host = draftHost.trim();
    if (!host || hosts.includes(host)) {
      return;
    }
    setDraftHost('');
    applyHosts((api) => api.setInsecureHosts([...hosts, host]));
  };

  return (
    <>
      <h2 className={styles.title}>
        {t('settings.certificates')}
        {info.trusted && info.mitmEnabled ? (
          <StatusBadge className={styles.mitm}>{t('settings.mitmActive')}</StatusBadge>
        ) : null}
      </h2>
      <div className={styles.desc}>
        {t('settings.certificateDescription')}
      </div>

      <Group title={t('settings.rootCertificateAuthority')}>
        <Row
          label={t('settings.status')}
          hint={info.present ? info.subject ?? undefined : t('settings.noCaGenerated')}
        >
          <StatusBadge tone={info.present ? 'green' : 'yellow'}>
            {info.present ? t('settings.generated') : t('settings.notGenerated')}
          </StatusBadge>
        </Row>
        {info.present ? (
          <Row label={t('settings.sha256Fingerprint')}>
            <span className={styles.mono}>{info.fingerprint}</span>
            <IconButton
              icon={Copy}
              label={t('settings.copyFingerprint')}
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(info.fingerprint ?? '')
              }
            />
          </Row>
        ) : null}
        {info.present && info.expiresAt ? (
          <Row label={t('settings.validUntil')}>
            <span className={styles.mono}>{formatDate(info.expiresAt, i18n.language)}</span>
          </Row>
        ) : null}
        <Row
          label={t('settings.location')}
          hint={t('settings.certificatePathHint')}
        >
          {info.present && !info.trusted ? (
            <Button
              icon={Trash2}
              variant="danger"
              automationId={AUTOMATION_IDS.settings.certificates.delete}
              disabled={busy}
              onClick={() => applyInfo((api) => api.deleteCertificate())}
            >
              {t('settings.delete')}
            </Button>
          ) : null}
          {info.present ? (
            <Button
              icon={FolderOpen}
              disabled={busy}
              onClick={() => void window.interceptor?.revealCertificate()}
            >
              {t('settings.revealCertificate')}
            </Button>
          ) : null}
          <Button
            icon={RefreshCw}
            automationId={AUTOMATION_IDS.settings.certificates.generate}
            disabled={busy || info.trusted}
            onClick={() => applyInfo((api) => api.generateCertificate())}
          >
            {info.present ? t('settings.regenerate') : t('settings.generate')}
          </Button>
        </Row>
      </Group>

      <Group title={t('settings.trustStatus')}>
        <Row
          label={t('settings.localMachine')}
          hint={
            info.supported
              ? t('settings.allUsersAdmin')
              : t('settings.trustUnsupported')
          }
        >
          {info.trusted ? (
            <>
              <StatusBadge>{t('settings.trusted')}</StatusBadge>
              <Button
                icon={Trash2}
                variant="danger"
                automationId={AUTOMATION_IDS.settings.certificates.uninstall}
                disabled={busy}
                onClick={() => applyInfo((api) => api.uninstallCertificate())}
              >
                {t('settings.remove')}
              </Button>
            </>
          ) : (
            <>
              <span className={cx(styles.mono, styles.monoMuted)}>
                {info.present ? t('settings.notInstalled') : t('settings.generateCaFirst')}
              </span>
              <Button
                icon={Shield}
                variant="primary"
                automationId={AUTOMATION_IDS.settings.certificates.install}
                disabled={busy || !info.supported || !info.present}
                onClick={() => applyInfo((api) => api.installCertificate())}
              >
                {t('settings.install')}
              </Button>
            </>
          )}
        </Row>
      </Group>

      <Group title={t('settings.httpsInterception')}>
        <Row
          label={t('settings.decryptHttps')}
          hint={t('settings.decryptHttpsHint')}
        >
          <Switch
            checked={info.mitmEnabled && info.trusted}
            automationId={AUTOMATION_IDS.settings.certificates.mitmToggle}
            onChange={
              info.trusted && !busy
                ? (checked) => applyInfo((api) => api.setHttpsDecryption(checked))
                : undefined
            }
          />
        </Row>
        <Row
          label={t('settings.perHostOverrides')}
          hint={t('settings.perHostOverridesHint')}
        >
          <input
            className={styles.hostInput}
            value={draftHost}
            placeholder={t('settings.addHostPlaceholder')}
            data-automation-id={AUTOMATION_IDS.settings.certificates.insecureHostInput}
            onChange={(event) => setDraftHost(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                addHost();
              }
            }}
          />
          <Button
            icon={Plus}
            automationId={AUTOMATION_IDS.settings.certificates.insecureHostAdd}
            disabled={busy}
            onClick={addHost}
          >
            {t('settings.addHost')}
          </Button>
        </Row>
        {hosts.length > 0 ? (
          <Row
            label={t('settings.insecureTlsExceptions')}
            hint={t('settings.originNotVerified')}
          >
            <span className={styles.hostList}>
              {hosts.map((host) => (
                <span
                  key={host}
                  className={styles.hostChip}
                  data-automation-id={AutomationIdFactory.insecureHost(host)}
                >
                  {host}
                  <IconButton
                    icon={X}
                    label={t('settings.removeHost', { host })}
                    size="sm"
                    automationId={AutomationIdFactory.insecureHostRemove(host)}
                    onClick={() =>
                      applyHosts((api) =>
                        api.setInsecureHosts(hosts.filter((h) => h !== host)),
                      )
                    }
                  />
                </span>
              ))}
            </span>
          </Row>
        ) : null}
      </Group>
    </>
  );
}
