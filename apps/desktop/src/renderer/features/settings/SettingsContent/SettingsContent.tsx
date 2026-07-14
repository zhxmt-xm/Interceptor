import { Copy, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type {
  CertificateInfo,
  InterceptorDesktopApi,
  StorageUsage,
} from '../../../../shared/desktop-api';
import { Button, cx, IconButton, StatusBadge, Switch } from '../../../components';
import { SECTIONS } from '../data';
import styles from './SettingsContent.module.css';

function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>{title}</div>
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.caption}>
        <b>{label}</b>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

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

  const run = useCallback(
    (action: (api: InterceptorDesktopApi) => Promise<unknown>): void => {
      const api = window.interceptor;
      if (!api || busy) {
        return;
      }
      setBusy(true);
      void Promise.resolve(action(api))
        .then(() => load())
        .catch(() => setState('error'))
        .finally(() => setBusy(false));
    },
    [busy, load],
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
    run((api) => api.setInsecureHosts([...hosts, host]));
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
          hint="Generating a fresh CA invalidates the current one"
        >
          <Button
            icon={RefreshCw}
            disabled={busy}
            onClick={() => run((api) => api.generateCertificate())}
          >
            {info.present ? 'Regenerate' : 'Generate'}
          </Button>
        </Row>
      </Group>

      <Group title="Trust status">
        <Row
          label="User store"
          hint={
            info.supported
              ? 'Current user only'
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
                onClick={() => run((api) => api.uninstallCertificate())}
              >
                Remove
              </Button>
            </>
          ) : (
            <>
              <span className={cx(styles.mono, styles.monoMuted)}>Not installed</span>
              <Button
                icon={Shield}
                variant="primary"
                disabled={busy || !info.supported}
                onClick={() => run((api) => api.installCertificate())}
              >
                Install…
              </Button>
            </>
          )}
        </Row>
      </Group>

      <Group title="HTTPS interception">
        <Row
          label="Decrypt HTTPS (MITM)"
          hint="Enabled once the CA is installed and trusted"
        >
          <Switch
            checked={info.trusted}
            onChange={
              info.supported && !busy
                ? (checked) =>
                    run((api) =>
                      checked
                        ? api.installCertificate()
                        : api.uninstallCertificate(),
                    )
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
                      run((api) =>
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
  if (active === 'certificates') {
    return <CertificatesPanel />;
  }
  if (active === 'storage') {
    return <StoragePanel />;
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
