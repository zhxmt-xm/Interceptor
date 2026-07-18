import { Check, LockKeyhole, Shield, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CertificateInfo } from '../../../../shared/desktop-api';
import { Button, cx, IconButton, StatusBadge } from '../../../components';
import styles from './HttpsDecryptionDialog.module.css';

export interface HttpsDecryptionDialogProps {
  open: boolean;
  onClose: () => void;
}

/** User-initiated CA generation, trust installation and HTTPS MITM enablement. */
export function HttpsDecryptionDialog({
  open,
  onClose,
}: HttpsDecryptionDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setError(null);
    void window.interceptor.getCertificateStatus()
      .then((next) => {
        if (active) {
          setCertificate(next);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(describeError(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose, open]);

  const run = (operation: () => Promise<CertificateInfo>, close = false): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void operation()
      .then((next) => {
        setCertificate(next);
        if (close) {
          onClose();
        }
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  if (!open) {
    return null;
  }

  const generated = certificate?.present === true;
  const trusted = certificate?.trusted === true;
  const enabled = certificate?.mitmEnabled === true && trusted;

  return (
    <div className={styles.overlay} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="https-decryption-title"
      >
        <header className={styles.header}>
          <span className={styles.headerIcon}><Shield aria-hidden="true" /></span>
          <h2 id="https-decryption-title">{t('settings.decryptHttps')}</h2>
          <IconButton
            icon={X}
            label={t('capture.close')}
            size="sm"
            disabled={busy}
            onClick={onClose}
          />
        </header>

        <div className={styles.body}>
          <p>{t('capture.httpsSetupDescription')}</p>
          <div className={styles.steps}>
            <SetupStep
              number={1}
              done={generated}
              title={t('settings.rootCertificateAuthority')}
              description={generated ? certificate?.subject ?? t('settings.generated') : t('settings.noCaGenerated')}
            >
              {generated ? (
                <StatusBadge>{t('settings.generated')}</StatusBadge>
              ) : (
                <Button
                  variant="primary"
                  disabled={busy || certificate === null}
                  onClick={() => run(() => window.interceptor.generateCertificate())}
                >
                  {t('settings.generate')}
                </Button>
              )}
            </SetupStep>

            <SetupStep
              number={2}
              done={trusted}
              pending={!generated}
              title={t('firstRun.installTrustStore')}
              description={t('firstRun.explicitAuthorization')}
            >
              {trusted ? (
                <StatusBadge>{t('settings.trusted')}</StatusBadge>
              ) : (
                <Button
                  icon={LockKeyhole}
                  disabled={busy || !generated || certificate?.supported !== true}
                  onClick={() => run(() => window.interceptor.installCertificate())}
                >
                  {t('settings.install')}
                </Button>
              )}
            </SetupStep>

            <SetupStep
              number={3}
              done={enabled}
              pending={!trusted}
              title={t('settings.decryptHttps')}
              description={t('capture.proxyRestartsSameAddress')}
            >
              <StatusBadge tone={enabled ? 'green' : 'yellow'}>
                {enabled
                  ? t('settings.on')
                  : trusted
                    ? t('firstRun.ready')
                    : t('firstRun.waitingForTrust')}
              </StatusBadge>
            </SetupStep>
          </div>

          <div className={styles.privacy}>
            <LockKeyhole aria-hidden="true" />
            <span>{t('capture.httpsRemainsEncrypted')}</span>
          </div>
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>

        <footer className={styles.footer}>
          <Button disabled={busy} onClick={onClose}>{t('capture.cancel')}</Button>
          <Button
            icon={Shield}
            variant="primary"
            disabled={busy || !trusted || enabled}
            onClick={() => run(() => window.interceptor.setHttpsDecryption(true), true)}
          >
            {busy ? t('firstRun.starting') : t('capture.startDecrypting')}
          </Button>
        </footer>
      </section>
    </div>
  );
}

interface SetupStepProps {
  number: number;
  done: boolean;
  pending?: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}

/** One stateful row in the HTTPS setup checklist. */
function SetupStep({
  number,
  done,
  pending = false,
  title,
  description,
  children,
}: SetupStepProps): React.JSX.Element {
  return (
    <div className={cx(styles.step, pending && styles.pending)}>
      <span className={cx(styles.number, done && styles.done)}>
        {done ? <Check aria-hidden="true" /> : number}
      </span>
      <span className={styles.copy}>
        <b>{title}</b>
        <span>{description}</span>
      </span>
      {children}
    </div>
  );
}

/** Convert unknown IPC failures into bounded dialog text. */
function describeError(reason: unknown): string {
  return (reason instanceof Error ? reason.message : String(reason)).slice(0, 512);
}