import { RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { CaptureUsage } from '../../../../shared/desktop-api';
import { Button, IconButton } from '../../../components';
import { formatBytes } from '../utils';

import styles from './StoragePanel.module.css';
import { SettingsGroup as Group } from './SettingsGroup';
import { SettingsRow as Row } from './SettingsRow';

type StorageState = 'loading' | 'ready' | 'error';

/** The Storage settings section, backed by the Core capture.status command. */
export function StoragePanel(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [usage, setUsage] = useState<CaptureUsage | null>(null);
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
      .getCaptureUsage()
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
    if (!api || busy || state === 'loading') {
      return;
    }
    setBusy(true);
    void api
      .clearCapture()
      .then((next) => {
        setUsage(next);
        setState('ready');
      })
      .catch(() => setState('error'))
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  }, [busy, state]);

  const value = (bytes: number | undefined): string =>
    state === 'ready' && bytes !== undefined ? formatBytes(bytes, i18n.language) : '—';
  const count = (n: number | undefined): string =>
    state === 'ready' && n !== undefined ? new Intl.NumberFormat(i18n.language).format(n) : '—';

  return (
    <>
      <header className={styles.heading}>
        <h2 className={styles.title}>{t('settings.storage')}</h2>
        <IconButton
          icon={RefreshCw}
          label={t('settings.refresh')}
          size="sm"
          disabled={busy || state === 'loading'}
          className={`${styles.refresh} ${state === 'loading' ? styles.refreshing : ''}`}
          onClick={load}
          automationId={AUTOMATION_IDS.settings.storage.refresh}
        />
      </header>
      <div className={styles.desc}>
        {t('settings.storageDescription')}
      </div>

      <Group title={t('settings.usage')}>
        <Row
          label={t(state === 'error' ? 'settings.storageStatus' : 'settings.capturedBodyData')}
          hint={t(state === 'error' ? 'settings.storageUnavailableHint' : 'settings.capturedBodyDataHint')}
        >
          <span
            className={state === 'error' ? styles.warning : styles.mono}
            data-automation-id={AUTOMATION_IDS.settings.storage.blobBytes}
            data-bytes={state === 'ready' ? usage?.blobBytes : undefined}
          >{state === 'error' ? t('settings.unavailable') : value(usage?.blobBytes)}</span>
        </Row>
      </Group>

      {state !== 'error' ? (
          <Group title={t('settings.contents')}>
            <Row label={t('settings.sessions')}>
              <span
                className={styles.mono}
                data-automation-id={AUTOMATION_IDS.settings.storage.sessionCount}
                data-count={state === 'ready' ? usage?.sessionCount : undefined}
              >{count(usage?.sessionCount)}</span>
            </Row>
            <Row label={t('settings.exchanges')}>
              <span
                className={styles.mono}
                data-automation-id={AUTOMATION_IDS.settings.storage.exchangeCount}
                data-count={state === 'ready' ? usage?.exchangeCount : undefined}
              >{count(usage?.exchangeCount)}</span>
            </Row>
            <Row label={t('settings.storedBodies')}>
              <span
                className={styles.mono}
                data-automation-id={AUTOMATION_IDS.settings.storage.bodyCount}
                data-count={state === 'ready' ? usage?.bodyCount : undefined}
              >{count(usage?.bodyCount)}</span>
            </Row>
          </Group>
      ) : null}

      <Group title={t('settings.maintenance')}>
        <Row
          label={t('settings.clearCapturedData')}
          hint={t('settings.clearCapturedDataHint')}
          additionalHint={t('settings.clearCaptureEffectsHint')}
          className={styles.clearRow}
        >
          {confirming ? (
            <>
              <Button disabled={busy} onClick={() => setConfirming(false)} automationId={AUTOMATION_IDS.settings.storage.clearCancel}>{t('settings.cancel')}</Button>
              <Button icon={Trash2} variant="danger" disabled={busy || state === 'loading'} onClick={clearAll} automationId={AUTOMATION_IDS.settings.storage.clearConfirm}>
                {busy ? t('settings.clearing') : t('settings.confirmClear')}
              </Button>
            </>
          ) : (
            <Button icon={Trash2} variant="danger" disabled={busy || state === 'loading'} onClick={() => setConfirming(true)} automationId={AUTOMATION_IDS.settings.storage.clear}>
              {t('settings.clearCapture')}
            </Button>
          )}
        </Row>
      </Group>
    </>
  );
}

