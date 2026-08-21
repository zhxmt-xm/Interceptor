import { Check, ListFilter, LockKeyhole, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, SectionHeader, StatusBadge } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import { TlsTunnelDetailRow as Row } from './TlsTunnelDetailRow';
import styles from './TlsTunnelPanel.module.css';

export interface TlsTunnelPanelProps {
  host: string;
  port: number;
  open: boolean;
  onViewTlsPassthroughPattern(host: string): void;
}

/** Limited connection metadata for HTTPS that is forwarded without MITM decryption. */
export function TlsTunnelPanel({
  host,
  port,
  open,
  onViewTlsPassthroughPattern,
}: TlsTunnelPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const mitmActive = useCaptureStore((state) => state.linkStatus.decrypting);
  const setHttpsSetupOpen = useCaptureStore((state) => state.setHttpsSetupOpen);
  return (
    <div className={styles.panel}>
      <div className={styles.callout}>
        <span className={styles.icon}><LockKeyhole aria-hidden="true" /></span>
        <span className={styles.copy}>
          <b>{t('capture.httpsEncrypted')}</b>
          <span>{t('capture.httpsPassthroughDescription')}</span>
          {mitmActive ? (
            <button
              className={styles.viewPassthrough}
              data-automation-id={AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern}
              data-parity="tls-tunnel-view-passthrough"
              type="button"
              onClick={() => onViewTlsPassthroughPattern(host)}
            >
              <ListFilter aria-hidden="true" />
              {t('capture.viewTlsPassthroughPattern')}
            </button>
          ) : null}
        </span>
        {mitmActive ? (
          <StatusBadge>{t('settings.mitmActive')}</StatusBadge>
        ) : (
          <Button
            icon={Shield}
            variant="primary"
            onClick={() => setHttpsSetupOpen(true)}
            automationId={AUTOMATION_IDS.capture.inspector.setupHttps}
          >
            {t('settings.decryptHttps')}
          </Button>
        )}
      </div>

      <div>
        <SectionHeader>{t('capture.tlsTunnel')}</SectionHeader>
        <div className={styles.rows}>
          <Row label={t('capture.host')} value={host || '—'} />
          <Row label={t('capture.port')} value={String(port)} />
          <Row label={t('capture.protocol')} value="TLS passthrough" accent />
          <Row label={t('settings.status')} value={open ? t('capture.open') : t('capture.closed')} />
          <Row label={t('capture.body')} value={t('capture.noBody')} />
        </div>
      </div>

      <div className={styles.privacy}>
        <Check aria-hidden="true" />
        <span>
          {t(
            mitmActive
              ? 'capture.mitmActiveForNewConnections'
              : 'capture.connectionMetadataOnly',
          )}
        </span>
      </div>
    </div>
  );
}

/** One technical key/value row in the encrypted tunnel summary. */
