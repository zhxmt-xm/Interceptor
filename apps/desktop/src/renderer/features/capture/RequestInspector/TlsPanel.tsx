import { Check, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, SectionHeader } from '../../../components';
import type { TlsProbe } from '../../../../shared/desktop-api';
import { formatCertificateDate, isOriginCertificateError } from '../utils';

import { TlsDetailRow as Row } from './TlsDetailRow';
import styles from './TlsPanel.module.css';

export interface TlsPanelProps {
  host: string;
  port: number;
  secure: boolean;
  scheme: string;
  protocol: string;
  errorCode: string | undefined;
}

/**
 * Connection / TLS 详情：展示捕获到的连接事实（scheme/host/port/protocol），并支持
 * 对源站发起一次实时 TLS 探测，读取真实协议版本/加密套件/ALPN 与完整证书链。
 */
export function TlsPanel({
  host,
  port,
  secure,
  scheme,
  protocol,
  errorCode,
}: TlsPanelProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [probe, setProbe] = useState<TlsProbe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trusting, setTrusting] = useState(false);
  const [trusted, setTrusted] = useState(false);

  const trustOrigin = async (): Promise<void> => {
    setTrusting(true);
    setError(null);
    try {
      const current = await window.interceptor.getInsecureHosts();
      await window.interceptor.setInsecureHosts([...current, host]);
      setTrusted(true);
    } catch (trustError) {
      setError(trustError instanceof Error ? trustError.message : String(trustError));
    } finally {
      setTrusting(false);
    }
  };

  const runProbe = async (): Promise<void> => {
    const api = window.interceptor;
    if (!api?.probeTls || !host) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.probeTls(host, port);
      setProbe(result);
      if (!result.ok) {
        setError(result.error ?? t('capture.tlsProbeFailed'));
      }
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : String(probeError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      {isOriginCertificateError(errorCode) ? (
        <div className={styles.certificateCallout}>
          <span className={styles.calloutIcon}><ShieldOff aria-hidden="true" /></span>
          <span className={styles.calloutCopy}>
            <b>{t('capture.originCertificateRejected')}</b>
            <span>
              {trusted
                ? t('capture.originCertificateTrusted')
                : t('capture.originCertificateRejectedDescription', {
                    host,
                    code: errorCode,
                  })}
            </span>
          </span>
          {trusted ? (
            <Check className={styles.calloutDone} aria-hidden="true" />
          ) : (
            <Button
              variant="primary"
              loading={trusting}
              disabled={!host}
              onClick={() => void trustOrigin()}
            >
              {t('capture.trustOriginCertificate')}
            </Button>
          )}
        </div>
      ) : null}

      <div>
        <SectionHeader>{t('capture.connection')}</SectionHeader>
        <div className={styles.rows}>
          <Row label={t('capture.scheme')} value={scheme} mono />
          <Row label={t('capture.host')} value={host || '—'} mono />
          <Row label={t('capture.port')} value={String(port)} mono />
          <Row label={t('capture.protocol')} value={protocol || '—'} mono />
          <Row label={t('capture.secure')} value={secure ? 'TLS' : t('capture.plaintext')} />
        </div>
      </div>

      <div>
        <SectionHeader>{t('capture.liveTlsProbe')}</SectionHeader>
        {!secure ? (
          <div className={styles.empty}>{t('capture.plaintextExchange')}</div>
        ) : (
          <>
            <div className={styles.probeBar}>
              <Button size="sm" disabled={loading || !host} onClick={() => void runProbe()}>
                {loading ? t('capture.probing') : t('capture.probeTls')}
              </Button>
              <span className={styles.probeHint}>{t('capture.connectsNow', { host, port })}</span>
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
            {probe && probe.ok ? (
              <div className={styles.rows}>
                <Row label={t('capture.version')} value={probe.protocol || '—'} mono />
                <Row label={t('capture.cipher')} value={probe.cipher || '—'} mono />
                <Row label="ALPN" value={probe.alpn || '—'} mono />
                <Row
                  label={t('capture.trust')}
                  value={probe.authorized ? t('capture.authorized') : probe.authorizationError ?? t('capture.notAuthorized')}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {probe && probe.ok && probe.certificates.length > 0 ? (
        <div>
          <SectionHeader count={probe.certificates.length}>{t('capture.certificateChain')}</SectionHeader>
          <div className={styles.certs}>
            {probe.certificates.map((cert, index) => (
              <div key={index} className={styles.cert}>
                <div className={styles.certHead}>
                  {index === 0 ? (
                    <ShieldCheck size={14} strokeWidth={1.9} />
                  ) : (
                    <ShieldAlert size={14} strokeWidth={1.9} />
                  )}
                  <span className={styles.certSubject}>{cert.subject || '—'}</span>
                </div>
                <Row label={t('capture.issuer')} value={cert.issuer || '—'} mono />
                <Row label={t('capture.validFrom')} value={formatCertificateDate(cert.validFrom, i18n.language)} mono />
                <Row label={t('capture.validTo')} value={formatCertificateDate(cert.validTo, i18n.language)} mono />
                <Row label={t('capture.serial')} value={cert.serialNumber || '—'} mono />
                <Row label="SHA-256" value={cert.fingerprint256 || '—'} mono />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

