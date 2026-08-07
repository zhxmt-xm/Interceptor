import { Modal } from 'antd';
import { LockOpen, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '../../../components';
import {
  TlsCompatibilityActions,
  useTlsCompatibilityStore,
} from '../data/tlsCompatibilityStore';
import { describeError } from '../utils';

import styles from './TlsCompatibilityDialog.module.css';

export interface TlsCompatibilityDialogProps {
  onOpenSettings(): void;
}

/** App-scope prompt listing every pending TLS interception compatibility host. */
export function TlsCompatibilityDialog({
  onOpenSettings,
}: TlsCompatibilityDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const compatibilityEvents = useTlsCompatibilityStore((state) => state.events);
  const dismissCompatibility = useTlsCompatibilityStore((state) => state.dismiss);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [compatibilityEvents]);

  const dismiss = (): void => {
    if (!busy && compatibilityEvents.length > 0) {
      dismissCompatibility(compatibilityEvents);
    }
  };

  const addHost = (): void => {
    if (compatibilityEvents.length === 0 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const events = [...compatibilityEvents];
    void TlsCompatibilityActions.addHosts(events)
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onOpenSettings();
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={compatibilityEvents.length > 0}
      centered
      width={512}
      closable={false}
      footer={null}
      title={null}
      mask={{ closable: !busy }}
      keyboard={!busy}
      destroyOnHidden
      onCancel={dismiss}
      classNames={{ container: styles.dialog, body: styles.dialogBody }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      aria-labelledby="tls-compatibility-title"
    >
      <header className={styles.header}>
        <span className={styles.icon}><LockOpen aria-hidden="true" /></span>
        <h2 id="tls-compatibility-title">
          {t('settings.tlsPassthrough.compatibilityTitle')}
        </h2>
        <IconButton
          icon={X}
          label={t('settings.cancel')}
          size="sm"
          disabled={busy}
          onClick={dismiss}
        />
      </header>
      <div className={styles.content}>
        <p>{t('settings.tlsPassthrough.compatibilitySummary')}</p>
        <div className={styles.hostList}>
          {compatibilityEvents.map((event) => (
            <div
              className={styles.hostRow}
              key={`${event.generation}:${event.host}`}
              data-parity={`tls-compatibility-host-${event.host}`}
            >
              <span className={styles.hostIcon}><LockOpen aria-hidden="true" /></span>
              <div>
                <code>{event.host}</code>
                <span>{t(
                  event.reason === 'cert-rejected'
                    ? 'settings.tlsPassthrough.compatibilityCertRejectedReason'
                    : 'settings.tlsPassthrough.compatibilityClosedReason',
                )}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.note}>
          <RefreshCw aria-hidden="true" />
          <span>{t('settings.tlsPassthrough.compatibilityApplyHint')}</span>
        </div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </div>
      <footer className={styles.footer}>
        <Button disabled={busy} onClick={dismiss}>
          {t('settings.tlsPassthrough.compatibilityDismiss')}
        </Button>
        <Button
          icon={LockOpen}
          variant="primary"
          loading={busy}
          onClick={addHost}
        >
          {t('settings.tlsPassthrough.addSuggestedHosts')}
        </Button>
      </footer>
    </Modal>
  );
}