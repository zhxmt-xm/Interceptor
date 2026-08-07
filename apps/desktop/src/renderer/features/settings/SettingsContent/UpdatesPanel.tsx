import { GithubOutlined } from '@ant-design/icons';
import { Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, cx, StatusBadge } from '../../../components';
import { GitHubAuthActions, useGitHubAuthStore } from '../data/githubAuthStore';
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
  const authStatus = useGitHubAuthStore((state) => state.status);
  const authBusy = useGitHubAuthStore((state) => state.busy);
  const authError = useGitHubAuthStore((state) => state.error);

  if (!status || !authStatus) {
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
      <h2 className={styles.title}>
        {t('settings.updates')}
        <StatusBadge tone={UpdateFormat.stateTone(status)}>
          {UpdateFormat.stateLabel(status, (key) => t(key))}
        </StatusBadge>
      </h2>
      <div className={styles.desc}>
        {t('settings.updateDescription')}
      </div>

      <Group title={t('settings.githubAccess')}>
        {authStatus.state === 'signed-out' ? (
          <Row label={t('settings.githubAccount')} hint={t('settings.githubSignInHint')}>
            <StatusBadge tone="yellow">{t('settings.signedOut')}</StatusBadge>
            <Button
              variant="primary"
              loading={authBusy}
              onClick={() => void GitHubAuthActions.signIn()}
              automationId={AUTOMATION_IDS.settings.updates.githubSignIn}
            >
              <GithubOutlined aria-hidden="true" />
              {t('settings.signInWithGitHub')}
            </Button>
          </Row>
        ) : null}
        {authStatus.state === 'authorizing' ? (
          <Row label={t('settings.authorizeDevice')} hint={t('settings.authorizeDeviceHint')}>
            <button
              type="button"
              className={styles.deviceCode}
              aria-label={t('settings.copyDeviceCode')}
              data-automation-id={AUTOMATION_IDS.settings.updates.deviceCode}
              onClick={() => void navigator.clipboard.writeText(authStatus.userCode ?? '')}
            >
              <Copy aria-hidden="true" />
              {authStatus.userCode}
            </button>
            <Button
              icon={ExternalLink}
              variant="primary"
              loading={authBusy}
              onClick={() => void GitHubAuthActions.openAuthorizationPage()}
              automationId={AUTOMATION_IDS.settings.updates.openGitHub}
            >
              {t('settings.openGitHub')}
            </Button>
          </Row>
        ) : null}
        {authStatus.state === 'signed-in' ? (
          <Row label={t('settings.githubAccount')} hint={t('settings.githubStoredHint')}>
            <span className={styles.githubLogin}>
              <GithubOutlined aria-hidden="true" />
              @{authStatus.login}
            </span>
            <StatusBadge>{t('settings.connected')}</StatusBadge>
            <Button
              loading={authBusy}
              onClick={() => void GitHubAuthActions.signOut()}
              automationId={AUTOMATION_IDS.settings.updates.githubSignOut}
            >
              {t('settings.signOut')}
            </Button>
          </Row>
        ) : null}
        {authStatus.state === 'failed' ? (
          <Row
            label={t('settings.githubAuthorizationFailed')}
            hint={authStatus.message ?? t('settings.githubAuthorizationFailedHint')}
          >
            <StatusBadge tone="red">{t('settings.notConnected')}</StatusBadge>
            <Button
              icon={RefreshCw}
              loading={authBusy}
              onClick={() => void GitHubAuthActions.signIn()}
              automationId={AUTOMATION_IDS.settings.updates.githubRetry}
            >
              {t('settings.tryAgain')}
            </Button>
          </Row>
        ) : null}
        <Row label={t('settings.repositoryAccess')} hint={t('settings.repositoryAccessHint')}>
          <span className={styles.mono}>zhxmt-xm/Interceptor</span>
          <StatusBadge tone="yellow">{t('settings.private')}</StatusBadge>
          <StatusBadge dot={false}>{t('settings.contentsReadOnly')}</StatusBadge>
        </Row>
      </Group>

      <Group title={t('settings.version')}>
        <Row label={t('settings.currentApplication')} hint={t('settings.installedVersionHint')}>
          <span className={styles.mono}>{status.currentVersion}</span>
          <StatusBadge>{t('settings.stable')}</StatusBadge>
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
          <StatusBadge tone="yellow">{t('settings.private')}</StatusBadge>
        </Row>
        <Row label={t('settings.checkPolicy')} hint={t('settings.checkPolicyHint')}>
          <span className={styles.mono}>stable</span>
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
            <div className={styles.updateProgress}>
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
        {authStatus.state === 'signed-in' &&
        status.state !== 'authentication-required' &&
        status.state !== 'checking' && status.state !== 'downloading' && status.supported ? (
          <Row
            label={t('settings.updateAction')}
            hint={t('settings.stableChannelHint')}
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

      {error || authError ? (
        <div className={cx(styles.operationResult, styles.operationError)} role="alert">
          {error ?? authError}
        </div>
      ) : null}
    </>
  );
}
