import { Copy, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type {
  CaptureStatus,
  SystemProxyRestoreResult,
  SystemProxyStatus,
} from '../../../../shared/desktop-api';
import { Button, cx, StatusBadge } from '../../../components';
import { useCaptureStore } from '../../capture/captureStore';
import styles from './SettingsContent.module.css';
import { SettingsGroup as Group, SettingsRow as Row } from './SettingsPrimitives';

type ProxyPanelState = 'loading' | 'ready' | 'error';

/** Real listener, system-routing ownership and crash-recovery settings. */
export function ProxyPanel(): React.JSX.Element {
  const [status, setStatus] = useState<SystemProxyStatus | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [state, setState] = useState<ProxyPanelState>('loading');
  const [busy, setBusy] = useState(false);
  const [confirmingRepair, setConfirmingRepair] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  /** Refresh both Main-owned system settings and Core-owned listener state. */
  const load = useCallback((): void => {
    setState('loading');
    void Promise.all([
      window.interceptor.getSystemProxyStatus(),
      window.interceptor.getCaptureStatus(),
    ])
      .then(([nextStatus, nextCapture]) => {
        setStatus(nextStatus);
        setCapture(nextCapture);
        setState('ready');
      })
      .catch((error: unknown) => {
        setResult({ tone: 'error', message: describeError(error) });
        setState('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Run one system-proxy action and retain its explicit authorization/result message. */
  const runAction = useCallback((operation: () => Promise<SystemProxyStatus>): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setResult(null);
    void operation()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setResult({ tone: 'success', message: 'System proxy settings updated.' });
      })
      .catch((error: unknown) => {
        setResult({ tone: 'error', message: describeError(error) });
      })
      .finally(() => setBusy(false));
  }, [busy]);

  /** Apply one guarded restore and describe ownership conflicts without hiding them. */
  const applyRestoreResult = useCallback((restore: SystemProxyRestoreResult): void => {
    setStatus(restore.status);
    if (restore.reason === 'externally-modified') {
      setResult({
        tone: 'error',
        message: 'Settings changed outside Interceptor. No system values were overwritten.',
      });
    } else if (restore.restored) {
      setResult({ tone: 'success', message: 'Original system proxy settings restored.' });
    } else {
      setResult({ tone: 'success', message: 'No Interceptor-owned proxy settings remain.' });
    }
  }, []);

  /** Restore normal ownership without stopping the listener. */
  const restore = useCallback((): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setResult(null);
    void window.interceptor.restoreSystemProxy()
      .then(applyRestoreResult)
      .catch((error: unknown) => {
        setResult({ tone: 'error', message: describeError(error) });
      })
      .finally(() => setBusy(false));
  }, [applyRestoreResult, busy]);

  /** Execute confirmed emergency repair and synchronize the stopped capture state. */
  const repair = useCallback((): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setConfirmingRepair(false);
    setResult(null);
    void window.interceptor.repairSystemProxy()
      .then(async (restore) => {
        applyRestoreResult(restore);
        const nextCapture = await window.interceptor.getCaptureStatus();
        setCapture(nextCapture);
        useCaptureStore.getState().setCapturing(nextCapture.listening);
      })
      .catch((error: unknown) => {
        setResult({ tone: 'error', message: describeError(error) });
      })
      .finally(() => setBusy(false));
  }, [applyRestoreResult, busy]);

  if (state === 'loading' || !status || !capture) {
    return (
      <>
        <h2 className={styles.title}>Proxy &amp; Listener</h2>
        <div className={styles.desc}>
          {state === 'error' ? 'System proxy status unavailable.' : 'Loading system proxy status…'}
        </div>
      </>
    );
  }

  const endpoint = capture.host && capture.port
    ? `${capture.host}:${capture.port}`
    : null;
  const titleStatus = proxyTitleStatus(status);

  return (
    <>
      <h2 className={styles.title}>
        Proxy &amp; Listener
        <StatusBadge tone={titleStatus.tone}>{titleStatus.label}</StatusBadge>
      </h2>
      <div className={styles.desc}>
        Local listener, operating-system routing, ownership and guarded recovery.
      </div>

      <Group title="Listener">
        <Row
          label="Status"
          hint="Capture accepts local HTTP and HTTPS proxy traffic"
        >
          <StatusBadge tone={capture.listening ? 'green' : 'yellow'}>
            {capture.listening ? 'Listening' : 'Stopped'}
          </StatusBadge>
        </Row>
        <Row label="Address" hint="Loopback only">
          <span className={styles.mono}>{endpoint ?? 'Not listening'}</span>
          <Button
            icon={Copy}
            disabled={!endpoint}
            onClick={() => void navigator.clipboard?.writeText(endpoint ?? '')}
          >
            Copy
          </Button>
        </Row>
      </Group>

      <Group title="System proxy">
        <Row
          label="Automatic routing"
          hint={status.supported
            ? 'Restored when capture stops or Interceptor exits'
            : 'Native system proxy integration is unavailable on this platform'}
        >
          <ProxyOwnershipBadge status={status} />
          {status.owned ? (
            <Button disabled={busy} onClick={restore}>Restore</Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy || !status.supported || !capture.listening}
              onClick={() => runAction(() => window.interceptor.enableSystemProxy())}
            >
              Enable
            </Button>
          )}
        </Row>
        <Row label="Current configuration" hint="HTTP and HTTPS">
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.owned && endpoint ? endpoint : status.proxyServer ?? 'Direct'}
          </span>
        </Row>
        <Row label="Bypass" hint="Hosts that connect directly">
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.bypassList ?? 'None'}
          </span>
        </Row>
        <Row
          label="PAC / Auto detect"
          hint={status.owned
            ? 'Temporarily disabled while Interceptor owns routing'
            : 'Current operating-system automatic proxy configuration'}
        >
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.pacUrl ?? (status.autoDetect ? 'Auto detect' : 'Off')}
          </span>
        </Row>
      </Group>

      <Group title="Recovery">
        <Row
          label="Ownership journal"
          hint="Original values are stored before any system change"
        >
          <StatusBadge tone={status.supported ? 'green' : 'yellow'}>
            {status.supported ? 'Protected' : 'Unavailable'}
          </StatusBadge>
        </Row>
        <Row
          label="Emergency repair"
          hint="Stops capture and restores only settings still owned by Interceptor"
        >
          {confirmingRepair ? (
            <>
              <span className={styles.confirmText}>Restore owned settings?</span>
              <Button disabled={busy} onClick={() => setConfirmingRepair(false)}>
                Cancel
              </Button>
              <Button icon={RefreshCw} variant="danger" disabled={busy} onClick={repair}>
                Confirm repair
              </Button>
            </>
          ) : (
            <Button
              icon={RefreshCw}
              variant="danger"
              disabled={busy || !status.supported}
              onClick={() => setConfirmingRepair(true)}
            >
              Emergency repair…
            </Button>
          )}
        </Row>
      </Group>

      {result ? (
        <div
          className={cx(styles.operationResult, result.tone === 'error' && styles.operationError)}
          role={result.tone === 'error' ? 'alert' : 'status'}
        >
          {result.message}
        </div>
      ) : null}
    </>
  );
}

/** Ownership-specific status badge for normal, conflict and unsupported states. */
function ProxyOwnershipBadge({ status }: { status: SystemProxyStatus }): React.JSX.Element {
  const value = proxyTitleStatus(status);
  return <StatusBadge tone={value.tone}>{
    status.owned ? 'Owned by Interceptor' : value.label
  }</StatusBadge>;
}

/** Map public ownership facts to one stable semantic label and color. */
function proxyTitleStatus(status: SystemProxyStatus): {
  label: string;
  tone: 'green' | 'yellow' | 'red' | 'info';
} {
  if (!status.supported) {
    return { label: 'Unavailable', tone: 'yellow' };
  }
  if (status.ownershipLost) {
    return { label: 'Ownership lost', tone: 'red' };
  }
  if (status.owned) {
    return { label: 'Owned', tone: 'green' };
  }
  if (status.enabled) {
    return { label: 'External', tone: 'yellow' };
  }
  return { label: 'Direct', tone: 'info' };
}

/** Convert unknown IPC failures to bounded operation feedback. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 512);
}