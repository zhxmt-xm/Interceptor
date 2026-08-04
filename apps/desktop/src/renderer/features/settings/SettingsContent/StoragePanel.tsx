import { RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureUsage } from '../../../../shared/desktop-api';
import { Button, StatusBadge } from '../../../components';
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
    if (!api) {
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

