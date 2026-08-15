import { Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureStatus,
  SystemProxyRestoreResult,
  SystemProxyStatus,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, cx, StatusBadge } from '../../../components';
import { useCaptureStore } from '../../capture/data/captureStore';
import { describeError, proxyTitleStatus } from '../utils';

import { ProxyOwnershipBadge } from './ProxyOwnershipBadge';
import styles from './ProxyPanel.module.css';
import { SettingsGroup as Group } from './SettingsGroup';
import { SettingsRow as Row } from './SettingsRow';

type ProxyPanelState = 'loading' | 'ready' | 'error';

/** Real listener, system-routing ownership and crash-recovery settings. */
export function ProxyPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SystemProxyStatus | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [state, setState] = useState<ProxyPanelState>('loading');
  const [busy, setBusy] = useState(false);
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
            <Button
              disabled={busy}
              onClick={restore}
              automationId={AUTOMATION_IDS.settings.proxy.restore}
            >
              {t('settings.restore')}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy || !status.supported || !capture.listening}
              onClick={() => runAction(() => window.interceptor.enableSystemProxy())}
              automationId={AUTOMATION_IDS.settings.proxy.enable}
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
