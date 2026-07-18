import { Download, ExternalLink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '../../../components';
import { UpdateActions, useUpdateStore } from '../updateStore';
import styles from './UpdateNotification.module.css';

/** Non-overlapping topbar notification for available and downloaded installers. */
export function UpdateNotification(): React.JSX.Element | null {
  const { t } = useTranslation();
  const status = useUpdateStore((state) => state.status);
  const dismissed = useUpdateStore((state) => state.dismissed);
  const busy = useUpdateStore((state) => state.busy);
  const dismiss = useUpdateStore((state) => state.dismiss);

  if (
    !status ||
    (status.state !== 'available' && status.state !== 'downloaded') ||
    dismissed
  ) {
    return null;
  }
  const downloaded = status.state === 'downloaded';
  return (
    <div className={styles.notice} role="status">
      <span className={styles.icon}><Download aria-hidden="true" /></span>
      <span className={styles.caption}>
        <b>{downloaded ? t('settings.installerDownloaded') : t('settings.updateAvailable')}</b>
        <small>
          {status.latestVersion ?? t('settings.newVersion')} · {downloaded ? t('settings.readyToOpen') : t('settings.changelogReady')}
        </small>
      </span>
      <Button
        icon={downloaded ? ExternalLink : Download}
        variant="primary"
        disabled={busy}
        onClick={() => void (
          downloaded ? UpdateActions.openDownloaded() : UpdateActions.download()
        )}
      >
        {downloaded ? t('settings.open') : t('settings.download')}
      </Button>
      <IconButton icon={X} label={t('settings.dismissUpdate')} size="sm" onClick={dismiss} />
    </div>
  );
}