import { Modal } from 'antd';
import { AlertTriangle, Shield, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import { retryCaptureProxyReadiness } from '../data/useCaptureData';
import styles from './ProxyReadinessDialog.module.css';

export interface ProxyReadinessDialogProps {
  onOpenSettings(): void;
  /** Close when the pointer goes down on the backdrop. Default true. */
  dismissOnOutsideClick?: boolean;
}

/** Global recovery dialog shown when Recording cannot receive system traffic. */
export function ProxyReadinessDialog({
  onOpenSettings,
  dismissOnOutsideClick = true,
}: ProxyReadinessDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const issue = useCaptureStore((state) => state.proxyReadinessIssue);
  const setIssue = useCaptureStore((state) => state.setProxyReadinessIssue);
  const [busy, setBusy] = useState(false);

  const open = issue !== null;
  const listenerUnavailable = issue?.kind === 'listener';
  const statusLabel = listenerUnavailable
    ? t('settings.listenerStopped')
    : issue?.ownershipLost
      ? t('settings.ownershipLost')
      : t('settings.systemProxyOff');

  const retry = (): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    void retryCaptureProxyReadiness().finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      centered
      width={500}
      zIndex={1200}
      closable={false}
      footer={null}
      title={null}
      mask={{ closable: dismissOnOutsideClick && !busy }}
      keyboard={!busy}
      destroyOnHidden
      onCancel={() => setIssue(null)}
      classNames={{ container: styles.panel, body: styles.panelBody }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      aria-labelledby="proxy-readiness-title"
    >
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <AlertTriangle size={16} strokeWidth={1.9} />
          </span>
          <h2 id="proxy-readiness-title">{t('capture.proxyNotReadyTitle')}</h2>
          <IconButton
            icon={X}
            label={t('capture.close')}
            size="sm"
            onClick={() => setIssue(null)}
          />
        </header>
        <div className={styles.body}>
          <p>
            {listenerUnavailable
              ? t('capture.proxyListenerNotReadyDescription')
              : t('capture.proxyNotReadyDescription')}
          </p>
          <div className={styles.status}>
            <span className={styles.statusDot} />
            <div>
              <strong>{statusLabel}</strong>
            </div>
          </div>
          <div className={styles.note}>
            <Shield size={15} strokeWidth={1.9} />
            <span>{t('capture.proxyOwnershipNote')}</span>
          </div>
          {issue?.message ? <div className={styles.error} role="alert">{issue?.message}</div> : null}
        </div>
        <footer className={styles.footer}>
          <Button onClick={() => setIssue(null)}>{t('settings.cancel')}</Button>
          <Button
            onClick={() => {
              setIssue(null);
              onOpenSettings();
            }}
          >
            {t('settings.nav.proxy')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={retry}>
            {t('settings.enable')}
          </Button>
        </footer>
    </Modal>
  );
}
