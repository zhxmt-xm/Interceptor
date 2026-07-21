import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureStatus, CertificateInfo, SystemProxyStatus } from '../../../../shared/desktop-api';
import { StatItem } from '../../../components';
import { UpdateFormat } from '../utils';
import { useUpdateStore } from '../data/updateStore';

/** Settings status bar: core state, proxy binding and trust summary. */
export function SettingsStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [proxy, setProxy] = useState<SystemProxyStatus | null>(null);
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const update = useUpdateStore((state) => state.status);

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
    : t('settings.listenerStopped');
  return (
    <>
      <StatItem dot={capture?.listening ? 'green' : 'yellow'}>
        {capture?.listening ? t('settings.listenerRunning') : t('settings.listenerStopped')}
      </StatItem>
      <StatItem mono>{endpoint}</StatItem>
      <StatItem dot={proxy?.owned ? 'green' : proxy?.ownershipLost ? 'red' : 'yellow'}>
        {proxy?.owned ? t('settings.systemProxy') : proxy?.ownershipLost ? t('settings.ownershipLost') : t('settings.systemProxyOff')}
      </StatItem>
      {update && update.state !== 'unsupported' ? (
        <StatItem dot={update.state === 'failed' ? 'red' : 'green'}>
          {t('settings.updateState', { state: UpdateFormat.stateLabel(update, (key) => t(key)) })}
        </StatItem>
      ) : null}
      <StatItem mono push>
        {certificate?.trusted
          ? t('settings.caTrustedMitm', {
              state: certificate.mitmEnabled ? t('settings.on') : t('settings.off'),
            })
          : t('settings.caNotTrusted')}
      </StatItem>
    </>
  );
}
