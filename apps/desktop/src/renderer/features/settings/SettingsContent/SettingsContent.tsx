import { Copy, Eye, FolderOpen, Library, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type {
  CertificateInfo,
  InterceptorDesktopApi,
  StorageUsage,
} from '../../../../shared/desktop-api';
import { Button, cx, IconButton, StatusBadge, Switch } from '../../../components';
import { SECTIONS } from '../data';
import { usePrivacyStore } from '../privacyStore';
import { ProxyPanel } from './ProxyPanel';
import { SettingsGroup as Group, SettingsRow as Row } from './SettingsPrimitives';
import styles from './SettingsContent.module.css';

type CertState = 'loading' | 'ready' | 'error';

/** The Certificates settings section, backed by the Main CA + trust-store services. */
function CertificatesPanel(): React.JSX.Element {
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
        <h2 className={styles.title}>Certificates</h2>
        <div className={styles.desc}>
          {state === 'error'
            ? 'Certificate status unavailable.'
            : 'Loading certificate status…'}
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
        Certificates
        {info.trusted ? (
          <StatusBadge className={styles.mitm}>MITM active</StatusBadge>
        ) : null}
      </h2>
      <div className={styles.desc}>
        Root CA used to decrypt HTTPS. Trust is only ever installed with your explicit consent.
      </div>

      <Group title="Root Certificate Authority">
        <Row
          label="Status"
          hint={info.present ? info.subject ?? undefined : 'No CA generated yet'}
        >
          <StatusBadge tone={info.present ? 'green' : 'yellow'}>
            {info.present ? 'Generated' : 'Not generated'}
          </StatusBadge>
        </Row>
        {info.present ? (
          <Row label="SHA-256 fingerprint">
            <span className={styles.mono}>{info.fingerprint}</span>
            <IconButton
              icon={Copy}
              label="Copy fingerprint"
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(info.fingerprint ?? '')
              }
            />
          </Row>
        ) : null}
        {info.present && info.expiresAt ? (
          <Row label="Valid until">
            <span className={styles.mono}>{info.expiresAt.slice(0, 10)}</span>
          </Row>
        ) : null}
        <Row
          label="Certificate authority"
          hint={
            info.trusted
              ? '需先在下方移除信任（Remove）才能重新生成或删除'
              : 'Generating a fresh CA invalidates the current one'
          }
        >
          {info.present && !info.trusted ? (
            <Button
              icon={Trash2}
              variant="danger"
              disabled={busy}
              onClick={() => applyInfo((api) => api.deleteCertificate())}
            >
              Delete
            </Button>
          ) : null}
          <Button
            icon={RefreshCw}
            disabled={busy || info.trusted}
            onClick={() => applyInfo((api) => api.generateCertificate())}
          >
            {info.present ? 'Regenerate' : 'Generate'}
          </Button>
        </Row>
      </Group>

      <Group title="Trust status">
        <Row
          label="Local machine"
          hint={
            info.supported
              ? '本机全部用户 · 安装/移除需管理员提权'
              : 'Trust store not supported on this platform'
          }
        >
          {info.trusted ? (
            <>
              <StatusBadge>Trusted</StatusBadge>
              <Button
                icon={Trash2}
                variant="danger"
                disabled={busy}
                onClick={() => applyInfo((api) => api.uninstallCertificate())}
              >
                Remove
              </Button>
            </>
          ) : (
            <>
              <span className={cx(styles.mono, styles.monoMuted)}>
                {info.present ? 'Not installed' : '需先生成 CA'}
              </span>
              <Button
                icon={Shield}
                variant="primary"
                disabled={busy || !info.supported || !info.present}
                onClick={() => applyInfo((api) => api.installCertificate())}
              >
                Install…
              </Button>
            </>
          )}
        </Row>
        {info.present && info.path ? (
          <Row label="Location" hint="Root CA 证书 PEM 文件在磁盘上的位置">
            <span className={styles.mono}>{info.path}</span>
            <IconButton
              icon={Eye}
              label="查看证书详情"
              size="sm"
              onClick={() => void window.interceptor?.viewCertificate()}
            />
            <IconButton
              icon={Library}
              label="打开证书管理器"
              size="sm"
              onClick={() => void window.interceptor?.openCertificateManager()}
            />
            <IconButton
              icon={FolderOpen}
              label="在文件管理器中打开"
              size="sm"
              onClick={() => void window.interceptor?.revealCertificate()}
            />
          </Row>
        ) : null}
      </Group>

      <Group title="HTTPS interception">
        <Row
          label="Decrypt HTTPS (MITM)"
          hint="需先安装并信任 CA；开启后代理才对 HTTPS 做解密"
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
          label="Per-host overrides"
          hint="Origins whose certificate errors are ignored"
        >
          <input
            className={styles.hostInput}
            value={draftHost}
            placeholder="add host…"
            onChange={(event) => setDraftHost(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                addHost();
              }
            }}
          />
          <Button icon={Plus} disabled={busy} onClick={addHost}>
            Add host
          </Button>
        </Row>
        {hosts.length > 0 ? (
          <Row
            label="Insecure TLS exceptions"
            hint="Origin certificate is not verified"
          >
            <span className={styles.hostList}>
              {hosts.map((host) => (
                <span key={host} className={styles.hostChip}>
                  {host}
                  <IconButton
                    icon={X}
                    label={`Remove ${host}`}
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
    state === 'ready' && bytes !== undefined ? formatBytes(bytes) : '—';
  const count = (n: number | undefined): string =>
    state === 'ready' && n !== undefined ? String(n) : '—';

  return (
    <>
      <h2 className={styles.title}>
        Storage
        {state === 'ready' && usage ? (
          <StatusBadge className={styles.mitm}>{formatBytes(usage.totalBytes)}</StatusBadge>
        ) : null}
      </h2>
      <div className={styles.desc}>
        Captured sessions and response bodies are stored locally on this device. Nothing is
        uploaded.
      </div>

      {state === 'error' ? (
        <Group title="Usage">
          <Row label="Storage status" hint="The Proxy Core storage is not available yet">
            <StatusBadge tone="yellow">Unavailable</StatusBadge>
          </Row>
        </Group>
      ) : (
        <>
          <Group title="Usage">
            <Row label="Total on disk" hint="Capture database and response bodies">
              <span className={styles.mono}>{value(usage?.totalBytes)}</span>
            </Row>
            <Row label="Quota" hint="Maximum local storage before new bodies are omitted">
              <span className={cx(styles.mono, styles.monoMuted)}>
                {value(usage?.quotaBytes)}
              </span>
            </Row>
            <Row label="Capture database">
              <span className={styles.mono}>{value(usage?.databaseBytes)}</span>
            </Row>
            <Row label="Response bodies">
              <span className={styles.mono}>{value(usage?.blobBytes)}</span>
            </Row>
          </Group>

          <Group title="Contents">
            <Row label="Sessions">
              <span className={styles.mono}>{count(usage?.sessionCount)}</span>
            </Row>
            <Row label="Exchanges">
              <span className={styles.mono}>{count(usage?.exchangeCount)}</span>
            </Row>
            <Row label="Stored bodies">
              <span className={styles.mono}>{count(usage?.bodyCount)}</span>
            </Row>
          </Group>
        </>
      )}

      <Group title="Maintenance">
        <Row label="Refresh usage" hint="Re-read current storage usage from the Proxy Core">
          <Button icon={RefreshCw} onClick={load}>
            Refresh
          </Button>
        </Row>
        <Row
          label="Clear all captured data"
          hint="Removes every session, exchange and stored body. This cannot be undone."
        >
          {confirming ? (
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button icon={Trash2} variant="danger" onClick={clearAll}>
                {busy ? 'Clearing…' : 'Confirm clear'}
              </Button>
            </>
          ) : (
            <Button icon={Trash2} variant="danger" onClick={() => setConfirming(true)}>
              Clear…
            </Button>
          )}
        </Row>
      </Group>
    </>
  );
}

/** The Privacy settings section: recording-safety facts and export redaction defaults. */
function PrivacyPanel(): React.JSX.Element {
  const maskAuthorization = usePrivacyStore((state) => state.maskAuthorization);
  const maskCookies = usePrivacyStore((state) => state.maskCookies);
  const warnBeforeUnmasked = usePrivacyStore((state) => state.warnBeforeUnmasked);
  const setPreference = usePrivacyStore((state) => state.setPreference);
  return (
    <>
      <h2 className={styles.title}>Privacy</h2>
      <div className={styles.desc}>
        Interceptor never records until you start capture, binds only to
        loopback, and sends no telemetry.
      </div>
      <Group title="Recording safety">
        <Row
          label="Capture on launch"
          hint="Interceptor stays idle until you press Record"
        >
          <StatusBadge tone="green">Off by default</StatusBadge>
        </Row>
        <Row
          label="Listener binding"
          hint="The proxy only accepts connections from this machine"
        >
          <StatusBadge tone="green">Loopback only</StatusBadge>
        </Row>
        <Row
          label="Telemetry"
          hint="No URLs, headers, bodies, or certificates leave your machine"
        >
          <StatusBadge tone="green">Disabled</StatusBadge>
        </Row>
      </Group>
      <Group title="Export defaults">
        <Row
          label="Mask authorization & URL tokens"
          hint="Redact Authorization headers and token query parameters on export"
        >
          <Switch
            checked={maskAuthorization}
            onChange={(value) => setPreference('maskAuthorization', value)}
          />
        </Row>
        <Row
          label="Mask cookies"
          hint="Redact Cookie and Set-Cookie headers on export"
        >
          <Switch
            checked={maskCookies}
            onChange={(value) => setPreference('maskCookies', value)}
          />
        </Row>
        <Row
          label="Warn before unmasked export"
          hint="Show a warning before exporting data that is not redacted"
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
  return (
    <>
      <h2 className={styles.title}>{label}</h2>
      <div className={styles.desc}>This section is not available yet.</div>
    </>
  );
}

/** Right settings pane: renders the panel for the active section. */
export function SettingsContent({ active }: { active: string }): React.JSX.Element {
  return <div className={styles.content}>{renderPanel(active)}</div>;
}

function renderPanel(active: string): React.JSX.Element {
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
  const label = SECTIONS.find((section) => section.id === active)?.label ?? 'Settings';
  return <PlaceholderPanel label={label} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
