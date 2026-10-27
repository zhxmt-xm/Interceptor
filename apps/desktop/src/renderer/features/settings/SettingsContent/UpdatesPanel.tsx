import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, cx, StatusBadge } from '../../../components';
import { UpdateActions, useUpdateStore } from '../data/updateStore';
import { UpdateFormat } from '../utils';

import { SettingsGroup as Group } from './SettingsGroup';
import { SettingsRow as Row } from './SettingsRow';
import styles from './UpdatesPanel.module.css';

/** GitHub Release status, user-triggered installer download and changelog. */
export function UpdatesPanel(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const status = useUpdateStore((state) => state.status);
  const busy = useUpdateStore((state) => state.busy);
  const error = useUpdateStore((state) => state.error);

  if (!status) {
    return (
      <>
        <h2 className={styles.title}>{t('settings.updates')}</h2>
        <div className={styles.desc}>{t('settings.loadingUpdates')}</div>
      </>
    );
  }

  const working = status.state === 'checking' || status.state === 'downloading';
  const hasRelease = status.latestVersion !== null &&
    status.latestVersion !== status.currentVersion;

  return (
    <>
      <h2
        className={styles.title}
        data-automation-id={AUTOMATION_IDS.settings.updates.status}
        data-state={status.state}
        data-supported={status.supported}
        data-last-checked-at={status.lastCheckedAt ?? undefined}
        data-current-version={status.currentVersion}
        data-latest-version={status.latestVersion ?? undefined}
      >
        {t('settings.updates')}
        <StatusBadge tone={UpdateFormat.stateTone(status)}>
          {UpdateFormat.stateLabel(status, (key) => t(key))}
        </StatusBadge>
      </h2>
      <div className={styles.desc}>
        {t('settings.updateDescription')}
      </div>

      <Group title={t('settings.version')}>
        <Row label={t('settings.currentApplication')} hint={t('settings.installedVersionHint')}>
          <span className={styles.mono}>{status.currentVersion}</span>
          <StatusBadge>{t('settings.installed')}</StatusBadge>
        </Row>
        <Row label={t('settings.latestGithubRelease')} hint={t('settings.latestReleaseHint')}>
          <span className={styles.mono}>{status.latestVersion ?? t('settings.unknown')}</span>
          {hasRelease ? <StatusBadge tone="info">{t('settings.wholeApp')}</StatusBadge> : null}
          {status.state === 'up-to-date' ? <StatusBadge>{t('settings.current')}</StatusBadge> : null}
        </Row>
      </Group>

      <Group title={t('settings.delivery')}>
        <Row label={t('settings.releaseSource')} hint={t('settings.releaseSourceHint')}>
          <span className={styles.mono}>zhxmt-xm/Interceptor</span>
        </Row>
        <Row label={t('settings.checkPolicy')} hint={t('settings.checkPolicyHint')}>
          <span className={styles.mono}>{t('settings.publishedVersions')}</span>
          <StatusBadge>{t('settings.notify')}</StatusBadge>
        </Row>
        <Row label={t('settings.downloadPolicy')} hint={t('settings.downloadPolicyHint')}>
          <StatusBadge>{t('settings.manual')}</StatusBadge>
        </Row>
        {working ? (
          <Row
            label={status.state === 'checking' ? t('settings.check') : t('settings.download')}
            hint={status.state === 'checking'
              ? t('settings.readingMetadata')
              : t('settings.signedInstaller')}
          >
            <div
              className={styles.updateProgress}
              data-automation-id={AUTOMATION_IDS.settings.updates.progress}
              data-state={status.state}
              data-progress={status.progress ?? undefined}
              data-downloaded-bytes={status.downloadedBytes ?? undefined}
              data-total-bytes={status.totalBytes ?? undefined}
            >
              <span
                className={styles.updateProgressValue}
                style={{ width: `${Math.max(4, (status.progress ?? 0.15) * 100)}%` }}
              />
            </div>
            <span className={styles.mono}>
              {status.state === 'checking'
                ? 'GitHub'
                : `${UpdateFormat.progress(status, i18n.language, t('settings.update.waiting'))} · ${UpdateFormat.bytes(status, i18n.language, t('settings.update.sizeUnavailable'))}`}
            </span>
          </Row>
        ) : null}
        {status.state === 'failed' ? (
          <Row label={t('settings.lastUpdateAction')} hint={status.message ?? t('settings.appNotChanged')}>
            <StatusBadge tone="red">{t('settings.retryAvailable')}</StatusBadge>
          </Row>
        ) : null}
        {status.state === 'unsupported' ? (
          <Row
            label={t('settings.releaseChecksUnavailable')}
            hint={t('settings.releaseChecksPackagedOnly')}
          >
            <StatusBadge tone="yellow">{t('settings.development')}</StatusBadge>
          </Row>
        ) : null}
        {!working && status.supported ? (
          <Row
            label={t('settings.updateAction')}
            hint={t('settings.publishedReleaseHint')}
          >
            {status.state !== 'available' && status.state !== 'downloaded' ? (
              <Button
                icon={RefreshCw}
                disabled={busy}
                onClick={() => void UpdateActions.check()}
                automationId={AUTOMATION_IDS.settings.updates.check}
              >
                {t('settings.checkNow')}
              </Button>
            ) : null}
            {status.state === 'available' ? (
              <Button
                icon={Download}
                variant="primary"
                disabled={busy}
                onClick={() => void UpdateActions.download()}
                automationId={AUTOMATION_IDS.settings.updates.download}
              >
                {t('settings.downloadUpdate')}
              </Button>
            ) : null}
            {status.state === 'downloaded' ? (
              <Button
                icon={ExternalLink}
                variant="primary"
                disabled={busy}
                onClick={() => void UpdateActions.openDownloaded()}
                automationId={AUTOMATION_IDS.settings.updates.openInstaller}
              >
                {t('settings.openInstaller')}
              </Button>
            ) : null}
          </Row>
        ) : null}
      </Group>

      {hasRelease ? (
        <Group title={t('settings.releaseNotes')}>
          <Row
            label={t('settings.changelog', { version: status.latestVersion })}
            hint={status.releaseNotes ?? t('settings.noChangelog')}
            hintClassName={styles.releaseNotes}
          >
            <span className={styles.mono}>GitHub</span>
          </Row>
        </Group>
      ) : null}

      {error ? (
        <div className={cx(styles.operationResult, styles.operationError)} role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
