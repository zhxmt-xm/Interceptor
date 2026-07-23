import { Check, LockKeyhole, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, SectionHeader, StatusBadge } from '../../../components';
import styles from './TlsTunnelPanel.module.css';

export interface TlsTunnelPanelProps {
  host: string;
  mitmActive: boolean;
  port: number;
  open: boolean;
  onSetupHttps: () => void;
}

/** Limited connection metadata for HTTPS that is forwarded without MITM decryption. */
export function TlsTunnelPanel({
  host,
  mitmActive,
  port,
  open,
  onSetupHttps,
}: TlsTunnelPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.panel}>
      <div className={styles.callout}>
        <span className={styles.icon}><LockKeyhole aria-hidden="true" /></span>
        <span className={styles.copy}>
          <b>{t('capture.httpsEncrypted')}</b>
          <span>{t('capture.httpsPassthroughDescription')}</span>
        </span>
        {mitmActive ? (
          <StatusBadge>{t('settings.mitmActive')}</StatusBadge>
        ) : (
          <Button
            icon={Shield}
            variant="primary"
            onClick={onSetupHttps}
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
function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <code className={accent ? styles.accent : undefined}>{value}</code>
    </div>
  );
}