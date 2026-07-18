import { Copy, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
        setResult({ tone: 'success', message: t('settings.proxyUpdated') });
      })
      .catch((error: unknown) => {
        setResult({ tone: 'error', message: describeError(error) });
      })
      .finally(() => setBusy(false));
  }, [busy, t]);

  /** Apply one guarded restore and describe ownership conflicts without hiding them. */
  const applyRestoreResult = useCallback((restore: SystemProxyRestoreResult): void => {
    setStatus(restore.status);
    if (restore.reason === 'externally-modified') {
      setResult({
        tone: 'error',
        message: t('settings.externalChange'),
      });
    } else if (restore.restored) {
      setResult({ tone: 'success', message: t('settings.originalRestored') });
    } else {
      setResult({ tone: 'success', message: t('settings.noOwnedSettings') });
    }
  }, [t]);

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
        <h2 className={styles.title}>{t('settings.proxyTitle')}</h2>
        <div className={styles.desc}>
          {state === 'error' ? t('settings.systemProxyUnavailable') : t('settings.loadingSystemProxy')}
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
        {t('settings.proxyTitle')}
        <StatusBadge tone={titleStatus.tone}>{t(titleStatus.labelKey)}</StatusBadge>
      </h2>
      <div className={styles.desc}>
        {t('settings.proxyDescription')}
      </div>

      <Group title={t('settings.listener')}>
        <Row
          label={t('settings.status')}
          hint={t('settings.listenerStatusHint')}
        >
          <StatusBadge tone={capture.listening ? 'green' : 'yellow'}>
            {capture.listening ? t('settings.listening') : t('settings.stopped')}
          </StatusBadge>
        </Row>
        <Row label={t('settings.address')} hint={t('settings.loopbackOnly')}>
          <span className={styles.mono}>{endpoint ?? t('settings.notListening')}</span>
          <Button
            icon={Copy}
            disabled={!endpoint}
            onClick={() => void navigator.clipboard?.writeText(endpoint ?? '')}
          >
            {t('settings.copy')}
          </Button>
        </Row>
      </Group>

      <Group title={t('settings.systemProxy')}>
        <Row
          label={t('settings.automaticRouting')}
          hint={status.supported
            ? t('settings.restoredOnExit')
            : t('settings.nativeProxyUnavailable')}
        >
          <ProxyOwnershipBadge status={status} />
          {status.owned ? (
            <Button disabled={busy} onClick={restore}>{t('settings.restore')}</Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy || !status.supported || !capture.listening}
              onClick={() => runAction(() => window.interceptor.enableSystemProxy())}
            >
              {t('settings.enable')}
            </Button>
          )}
        </Row>
        <Row label={t('settings.currentConfiguration')} hint="HTTP and HTTPS">
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.owned && endpoint ? endpoint : status.proxyServer ?? t('settings.direct')}
          </span>
        </Row>
        <Row label={t('settings.bypass')} hint={t('settings.bypassHint')}>
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.bypassList ?? t('settings.none')}
          </span>
        </Row>
        <Row
          label={t('settings.pacAutoDetect')}
          hint={status.owned
            ? t('settings.pacOwnedHint')
            : t('settings.pacCurrentHint')}
        >
          <span className={cx(styles.mono, styles.proxyValue)}>
            {status.pacUrl ?? (status.autoDetect ? t('settings.autoDetect') : t('settings.off'))}
          </span>
        </Row>
      </Group>

      <Group title={t('settings.recovery')}>
        <Row
          label={t('settings.ownershipJournal')}
          hint={t('settings.ownershipJournalHint')}
        >
          <StatusBadge tone={status.supported ? 'green' : 'yellow'}>
            {status.supported ? t('settings.protected') : t('settings.unavailable')}
          </StatusBadge>
        </Row>
        <Row
          label={t('settings.emergencyRepair')}
          hint={t('settings.emergencyRepairHint')}
        >
          {confirmingRepair ? (
            <>
              <span className={styles.confirmText}>{t('settings.restoreOwned')}</span>
              <Button disabled={busy} onClick={() => setConfirmingRepair(false)}>
                {t('settings.cancel')}
              </Button>
              <Button icon={RefreshCw} variant="danger" disabled={busy} onClick={repair}>
                {t('settings.confirmRepair')}
              </Button>
            </>
          ) : (
            <Button
              icon={RefreshCw}
              variant="danger"
              disabled={busy || !status.supported}
              onClick={() => setConfirmingRepair(true)}
            >
              {t('settings.emergencyRepairAction')}
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
  const { t } = useTranslation();
  const value = proxyTitleStatus(status);
  return <StatusBadge tone={value.tone}>{
    status.owned ? t('settings.ownedByInterceptor') : t(value.labelKey)
  }</StatusBadge>;
}

/** Map public ownership facts to one stable semantic label and color. */
function proxyTitleStatus(status: SystemProxyStatus): {
  labelKey: string;
  tone: 'green' | 'yellow' | 'red' | 'info';
} {
  if (!status.supported) {
    return { labelKey: 'settings.unavailable', tone: 'yellow' };
  }
  if (status.ownershipLost) {
    return { labelKey: 'settings.ownershipLost', tone: 'red' };
  }
  if (status.owned) {
    return { labelKey: 'settings.owned', tone: 'green' };
  }
  if (status.enabled) {
    return { labelKey: 'settings.external', tone: 'yellow' };
  }
  return { labelKey: 'settings.direct', tone: 'info' };
}

/** Convert unknown IPC failures to bounded operation feedback. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 512);
}