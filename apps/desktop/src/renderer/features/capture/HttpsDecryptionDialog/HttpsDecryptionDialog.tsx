import { Modal } from 'antd';
import { Check, LockKeyhole, Shield, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CertificateInfo } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, cx, IconButton, StatusBadge } from '../../../components';
import { describeError } from '../utils';

import styles from './HttpsDecryptionDialog.module.css';
import { SetupStep } from './SetupStep';

export interface HttpsDecryptionDialogProps {
  open: boolean;
  onClose: () => void;
  onCertificateChange?: (certificate: CertificateInfo) => void;
  /** Close when the pointer goes down on the backdrop. Default true. */
  dismissOnOutsideClick?: boolean;
}

/** User-initiated CA generation, trust installation and HTTPS MITM enablement. */
export function HttpsDecryptionDialog({
  open,
  onClose,
  onCertificateChange,
  dismissOnOutsideClick = true,
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
          onCertificateChange?.(next);
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
  }, [onCertificateChange, open]);

  const run = (operation: () => Promise<CertificateInfo>, close = false): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void operation()
      .then((next) => {
        setCertificate(next);
        onCertificateChange?.(next);
        if (close) {
          onClose();
        }
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  const generated = certificate?.present === true;
  const trusted = certificate?.trusted === true;
  const enabled = certificate?.mitmEnabled === true && trusted;

  return (
    <Modal
      open={open}
      centered
      width={560}
      closable={false}
      footer={null}
      title={null}
      mask={{ closable: dismissOnOutsideClick && !busy }}
      keyboard={!busy}
      destroyOnHidden
      onCancel={onClose}
      classNames={{ container: styles.panel, body: styles.panelBody }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
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
            automationId={AUTOMATION_IDS.capture.httpsSetup.close}
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
                  automationId={AUTOMATION_IDS.capture.httpsSetup.generate}
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
                  automationId={AUTOMATION_IDS.capture.httpsSetup.install}
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
          <Button
            disabled={busy}
            onClick={onClose}
            automationId={AUTOMATION_IDS.capture.httpsSetup.cancel}
          >
            {t('capture.cancel')}
          </Button>
          <Button
            icon={Shield}
            variant="primary"
            disabled={busy || !trusted || enabled}
            onClick={() => run(() => window.interceptor.setHttpsDecryption(true), true)}
            automationId={AUTOMATION_IDS.capture.httpsSetup.startDecrypting}
          >
            {busy ? t('firstRun.starting') : t('capture.startDecrypting')}
          </Button>
        </footer>
    </Modal>
  );
}
