import { Copy, FolderOpen, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CertificateInfo,
  InterceptorDesktopApi,
  StorageUsage,
} from '../../../../shared/desktop-api';
import { Button, cx, IconButton, StatusBadge, Switch } from '../../../components';
import { SECTIONS } from '../data';
import { usePrivacyStore } from '../privacyStore';
import { ProxyPanel } from './ProxyPanel';
import { UpdatesPanel } from './UpdatesPanel';
import { SettingsGroup as Group, SettingsRow as Row } from './SettingsPrimitives';
import styles from './SettingsContent.module.css';

type CertState = 'loading' | 'ready' | 'error';

/** The Certificates settings section, backed by the Main CA + trust-store services. */
function CertificatesPanel(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [info, setInfo] = useState<CertificateInfo | null>(null);
  const [hosts, setHosts] = useState<string[]>([]);
  const [state, setState] = useState<CertState>('loading');
  const [busy, setBusy] = useState(false);
  const [draftHost, setDraftHost] = useState('');

  const load = useCallback((): void => {
    const api = window.interceptor;
    if (!api) {
      setState('error');
      return;
    }
    setState('loading');
    void Promise.all([api.getCertificateStatus(), api.getInsecureHosts()])
      .then(([nextInfo, nextHosts]) => {
        setInfo(nextInfo);
        setHosts(nextHosts);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        {info.trusted ? (
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
            onChange={(event) => setDraftHost(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                addHost();
              }
            }}
          />
          <Button icon={Plus} disabled={busy} onClick={addHost}>
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
                <span key={host} className={styles.hostChip}>
                  {host}
                  <IconButton
                    icon={X}
                    label={t('settings.removeHost', { host })}
                    size="sm"
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

type StorageState = 'loading' | 'ready' | 'error';

/** The Storage settings section, backed by the Core storage.status command. */
function StoragePanel(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [state, setState] = useState<StorageState>('loading');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((): void => {
    const api = window.interceptor;
    if (!api) {
      setState('error');
      return;
    }
    setState('loading');
    void api
      .getStorageStatus()
      .then((next) => {
        setUsage(next);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clearAll = useCallback((): void => {
    const api = window.interceptor;
    if (!api) {
      return;
    }
    setBusy(true);
    void api
      .clearStorage()
      .then((next) => {
        setUsage(next);
        setState('ready');
      })
      .catch(() => setState('error'))
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  }, []);

  const value = (bytes: number | undefined): string =>
    state === 'ready' && bytes !== undefined ? formatBytes(bytes, i18n.language) : '—';
  const count = (n: number | undefined): string =>
    state === 'ready' && n !== undefined ? new Intl.NumberFormat(i18n.language).format(n) : '—';

  return (
    <>
      <h2 className={styles.title}>
        {t('settings.storage')}
        {state === 'ready' && usage ? (
          <StatusBadge className={styles.mitm}>{formatBytes(usage.totalBytes, i18n.language)}</StatusBadge>
        ) : null}
      </h2>
      <div className={styles.desc}>
        {t('settings.storageDescription')}
      </div>

      {state === 'error' ? (
        <Group title={t('settings.usage')}>
          <Row label={t('settings.storageStatus')} hint={t('settings.storageUnavailableHint')}>
            <StatusBadge tone="yellow">{t('settings.unavailable')}</StatusBadge>
          </Row>
        </Group>
      ) : (
        <>
          <Group title={t('settings.usage')}>
            <Row label={t('settings.totalOnDisk')} hint={t('settings.totalOnDiskHint')}>
              <span className={styles.mono}>{value(usage?.totalBytes)}</span>
            </Row>
            <Row label={t('settings.quota')} hint={t('settings.quotaHint')}>
              <span className={cx(styles.mono, styles.monoMuted)}>
                {value(usage?.quotaBytes)}
              </span>
            </Row>
            <Row label={t('settings.captureDatabase')}>
              <span className={styles.mono}>{value(usage?.databaseBytes)}</span>
            </Row>
            <Row label={t('settings.responseBodies')}>
              <span className={styles.mono}>{value(usage?.blobBytes)}</span>
            </Row>
          </Group>

          <Group title={t('settings.contents')}>
            <Row label={t('settings.sessions')}>
              <span className={styles.mono}>{count(usage?.sessionCount)}</span>
            </Row>
            <Row label={t('settings.exchanges')}>
              <span className={styles.mono}>{count(usage?.exchangeCount)}</span>
            </Row>
            <Row label={t('settings.storedBodies')}>
              <span className={styles.mono}>{count(usage?.bodyCount)}</span>
            </Row>
          </Group>
        </>
      )}

      <Group title={t('settings.maintenance')}>
        <Row label={t('settings.refreshUsage')} hint={t('settings.refreshUsageHint')}>
          <Button icon={RefreshCw} onClick={load}>
            {t('settings.refresh')}
          </Button>
        </Row>
        <Row
          label={t('settings.clearCapturedData')}
          hint={t('settings.clearCapturedDataHint')}
        >
          {confirming ? (
            <>
              <Button onClick={() => setConfirming(false)}>{t('settings.cancel')}</Button>
              <Button icon={Trash2} variant="danger" onClick={clearAll}>
                {busy ? t('settings.clearing') : t('settings.confirmClear')}
              </Button>
            </>
          ) : (
            <Button icon={Trash2} variant="danger" onClick={() => setConfirming(true)}>
              {t('settings.clear')}
            </Button>
          )}
        </Row>
      </Group>
    </>
  );
}

/** The Privacy settings section: recording-safety facts and export redaction defaults. */
function PrivacyPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const maskAuthorization = usePrivacyStore((state) => state.maskAuthorization);
  const maskCookies = usePrivacyStore((state) => state.maskCookies);
  const warnBeforeUnmasked = usePrivacyStore((state) => state.warnBeforeUnmasked);
  const setPreference = usePrivacyStore((state) => state.setPreference);
  return (
    <>
      <h2 className={styles.title}>{t('settings.privacy')}</h2>
      <div className={styles.desc}>
        {t('settings.privacyDescription')}
      </div>
      <Group title={t('settings.recordingSafety')}>
        <Row
          label={t('settings.captureOnLaunch')}
          hint={t('settings.captureOnLaunchHint')}
        >
          <StatusBadge tone="green">{t('settings.offByDefault')}</StatusBadge>
        </Row>
        <Row
          label={t('settings.listenerBinding')}
          hint={t('settings.listenerBindingHint')}
        >
          <StatusBadge tone="green">{t('settings.loopbackOnly')}</StatusBadge>
        </Row>
        <Row
          label={t('settings.telemetry')}
          hint={t('settings.telemetryHint')}
        >
          <StatusBadge tone="green">{t('settings.disabled')}</StatusBadge>
        </Row>
      </Group>
      <Group title={t('settings.exportDefaults')}>
        <Row
          label={t('settings.maskAuthorization')}
          hint={t('settings.maskAuthorizationHint')}
        >
          <Switch
            checked={maskAuthorization}
            onChange={(value) => setPreference('maskAuthorization', value)}
          />
        </Row>
        <Row
          label={t('settings.maskCookies')}
          hint={t('settings.maskCookiesHint')}
        >
          <Switch
            checked={maskCookies}
            onChange={(value) => setPreference('maskCookies', value)}
          />
        </Row>
        <Row
          label={t('settings.warnUnmasked')}
          hint={t('settings.warnUnmaskedHint')}
        >
          <Switch
            checked={warnBeforeUnmasked}
            onChange={(value) => setPreference('warnBeforeUnmasked', value)}
          />
        </Row>
      </Group>
    </>
  );
}

/** Placeholder for settings sections without a designed panel yet. */
function PlaceholderPanel({ label }: { label: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <h2 className={styles.title}>{label}</h2>
      <div className={styles.desc}>{t('settings.sectionUnavailable')}</div>
    </>
  );
}

/** Right settings pane: renders the panel for the active section. */
export function SettingsContent({ active }: { active: string }): React.JSX.Element {
  const { t } = useTranslation();
  return <div className={styles.content}>{renderPanel(active, (key) => t(key))}</div>;
}

function renderPanel(active: string, translate: (key: string) => string): React.JSX.Element {
  if (active === 'proxy') {
    return <ProxyPanel />;
  }
  if (active === 'certificates') {
    return <CertificatesPanel />;
  }
  if (active === 'storage') {
    return <StoragePanel />;
  }
  if (active === 'privacy') {
    return <PrivacyPanel />;
  }
  if (active === 'updates') {
    return <UpdatesPanel />;
  }
  const labelKey = SECTIONS.find((section) => section.id === active)?.labelKey;
  const label = labelKey ? translate(labelKey) : translate('settings.title');
  return <PlaceholderPanel label={label} />;
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) {
    return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unitIndex]}`;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
