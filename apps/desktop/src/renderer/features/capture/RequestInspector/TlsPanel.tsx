import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Button, SectionHeader } from '../../../components';
import type { ConnectionProbe } from '../../../shared/desktop-api';
import styles from './TlsPanel.module.css';

export interface TlsPanelProps {
  host: string;
  port: number;
  secure: boolean;
  scheme: string;
  protocol: string;
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
}: TlsPanelProps): React.JSX.Element {
  const [probe, setProbe] = useState<ConnectionProbe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runProbe = async (): Promise<void> => {
    const api = window.interceptor;
    if (!api?.probeConnection || !host) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.probeConnection(host, port);
      setProbe(result);
      if (!result.ok) {
        setError(result.error ?? 'The TLS probe failed.');
      }
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : String(probeError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div>
        <SectionHeader>Connection</SectionHeader>
        <div className={styles.rows}>
          <Row label="Scheme" value={scheme} mono />
          <Row label="Host" value={host || '—'} mono />
          <Row label="Port" value={String(port)} mono />
          <Row label="Protocol" value={protocol || '—'} mono />
          <Row label="Secure" value={secure ? 'TLS' : 'plaintext'} />
        </div>
      </div>

      <div>
        <SectionHeader>Live TLS probe</SectionHeader>
        {!secure ? (
          <div className={styles.empty}>This exchange was sent over plaintext HTTP.</div>
        ) : (
          <>
            <div className={styles.probeBar}>
              <Button size="sm" disabled={loading || !host} onClick={() => void runProbe()}>
                {loading ? 'Probing…' : 'Probe TLS'}
              </Button>
              <span className={styles.probeHint}>Connects to {host}:{port} now.</span>
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
            {probe && probe.ok ? (
              <div className={styles.rows}>
                <Row label="Version" value={probe.protocol || '—'} mono />
                <Row label="Cipher" value={probe.cipher || '—'} mono />
                <Row label="ALPN" value={probe.alpn || '—'} mono />
                <Row
                  label="Trust"
                  value={probe.authorized ? 'authorized' : probe.authorizationError ?? 'not authorized'}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {probe && probe.ok && probe.certificates.length > 0 ? (
        <div>
          <SectionHeader count={probe.certificates.length}>Certificate chain</SectionHeader>
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
                <Row label="Issuer" value={cert.issuer || '—'} mono />
                <Row label="Valid from" value={cert.validFrom || '—'} mono />
                <Row label="Valid to" value={cert.validTo || '—'} mono />
                <Row label="Serial" value={cert.serialNumber || '—'} mono />
                <Row label="SHA-256" value={cert.fingerprint256 || '—'} mono />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={mono ? styles.valueMono : styles.value}>{value}</span>
    </div>
  );
}
