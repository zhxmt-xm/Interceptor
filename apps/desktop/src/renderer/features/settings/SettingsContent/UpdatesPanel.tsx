import { Download, ExternalLink, RefreshCw } from 'lucide-react';

import { Button, cx, StatusBadge } from '../../../components';
import { UpdateFormat } from '../update-format';
import { UpdateActions, useUpdateStore } from '../updateStore';
import styles from './SettingsContent.module.css';
import { SettingsGroup as Group, SettingsRow as Row } from './SettingsPrimitives';

/** GitHub Release status, user-triggered installer download and changelog. */
export function UpdatesPanel(): React.JSX.Element {
  const status = useUpdateStore((state) => state.status);
  const busy = useUpdateStore((state) => state.busy);
  const error = useUpdateStore((state) => state.error);

  if (!status) {
    return (
      <>
        <h2 className={styles.title}>Updates</h2>
        <div className={styles.desc}>Loading update status…</div>
      </>
    );
  }

  const working = status.state === 'checking' || status.state === 'downloading';
  const hasRelease = status.latestVersion !== null &&
    status.latestVersion !== status.currentVersion;

  return (
    <>
      <h2 className={styles.title}>
        Updates
        <StatusBadge tone={UpdateFormat.stateTone(status)}>
          {UpdateFormat.stateLabel(status)}
        </StatusBadge>
      </h2>
      <div className={styles.desc}>
        Checks and downloads signed installers from public GitHub Releases. Downloads start only when you choose.
      </div>

      <Group title="Version">
        <Row label="Current application" hint="Installed whole-app version">
          <span className={styles.mono}>{status.currentVersion}</span>
          <StatusBadge>Stable</StatusBadge>
        </Row>
        <Row label="Latest GitHub release" hint="Newest public stable release">
          <span className={styles.mono}>{status.latestVersion ?? 'Unknown'}</span>
          {hasRelease ? <StatusBadge tone="info">Whole app</StatusBadge> : null}
          {status.state === 'up-to-date' ? <StatusBadge>Current</StatusBadge> : null}
        </Row>
      </Group>

      <Group title="Delivery">
        <Row label="Release source" hint="GitHub-hosted metadata and artifacts">
          <span className={styles.mono}>zhxmt-xm/Interceptor</span>
          <StatusBadge>Public</StatusBadge>
        </Row>
        <Row label="Check policy" hint="Checks on launch and every hour">
          <span className={styles.mono}>stable</span>
          <StatusBadge>Notify</StatusBadge>
        </Row>
        <Row label="Download policy" hint="Starts only when you click Download update">
          <StatusBadge>Manual</StatusBadge>
        </Row>
        {working ? (
          <Row
            label={status.state === 'checking' ? 'Check' : 'Download'}
            hint={status.state === 'checking'
              ? 'Reading the latest stable release metadata'
              : 'Signed installer from GitHub Releases'}
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
                : `${UpdateFormat.progress(status)} · ${UpdateFormat.bytes(status)}`}
            </span>
          </Row>
        ) : null}
        {status.state === 'failed' ? (
          <Row label="Last update action" hint={status.message ?? 'The installed app was not changed.'}>
            <StatusBadge tone="red">Retry available</StatusBadge>
          </Row>
        ) : null}
        {status.state === 'unsupported' ? (
          <Row
            label="Release checks unavailable"
            hint="Release checks run only in packaged Windows and macOS builds."
          >
            <StatusBadge tone="yellow">Development</StatusBadge>
          </Row>
        ) : null}
        {status.state !== 'checking' && status.state !== 'downloading' && status.supported ? (
          <Row
            label="Update action"
            hint="Public stable channel · no account or update server required"
          >
            {status.state !== 'available' && status.state !== 'downloaded' ? (
              <Button
                icon={RefreshCw}
                disabled={busy}
                onClick={() => void UpdateActions.check()}
              >
                Check now
              </Button>
            ) : null}
            {status.state === 'available' ? (
              <Button
                icon={Download}
                variant="primary"
                disabled={busy}
                onClick={() => void UpdateActions.download()}
              >
                Download update
              </Button>
            ) : null}
            {status.state === 'downloaded' ? (
              <Button
                icon={ExternalLink}
                variant="primary"
                disabled={busy}
                onClick={() => void UpdateActions.openDownloaded()}
              >
                Open installer
              </Button>
            ) : null}
          </Row>
        ) : null}
      </Group>

      {hasRelease ? (
        <Group title="Release notes">
          <Row
            label={`${status.latestVersion} changelog`}
            hint={status.releaseNotes ?? 'No changelog was provided for this release.'}
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
