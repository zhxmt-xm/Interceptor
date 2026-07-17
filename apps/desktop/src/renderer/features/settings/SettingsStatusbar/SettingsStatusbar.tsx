import { useEffect, useState } from 'react';

import type { CaptureStatus, CertificateInfo, SystemProxyStatus } from '../../../../shared/desktop-api';
import { StatItem } from '../../../components';

/** Settings status bar: core state, proxy binding and trust summary. */
export function SettingsStatusbar(): React.JSX.Element {
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [proxy, setProxy] = useState<SystemProxyStatus | null>(null);
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.interceptor.getCaptureStatus(),
      window.interceptor.getSystemProxyStatus(),
      window.interceptor.getCertificateStatus(),
    ]).then(([nextCapture, nextProxy, nextCertificate]) => {
      if (active) {
        setCapture(nextCapture);
        setProxy(nextProxy);
        setCertificate(nextCertificate);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const endpoint = capture?.host && capture.port
    ? `${capture.host}:${capture.port}`
    : 'Listener stopped';
  return (
    <>
      <StatItem dot={capture?.listening ? 'green' : 'yellow'}>
        {capture?.listening ? 'Listener running' : 'Listener stopped'}
      </StatItem>
      <StatItem mono>{endpoint}</StatItem>
      <StatItem dot={proxy?.owned ? 'green' : proxy?.ownershipLost ? 'red' : 'yellow'}>
        {proxy?.owned ? 'System Proxy' : proxy?.ownershipLost ? 'Ownership lost' : 'System Proxy off'}
      </StatItem>
      <StatItem mono push>
        {certificate?.trusted
          ? `CA trusted · MITM ${certificate.mitmEnabled ? 'on' : 'off'}`
          : 'CA not trusted'}
      </StatItem>
    </>
  );
}
