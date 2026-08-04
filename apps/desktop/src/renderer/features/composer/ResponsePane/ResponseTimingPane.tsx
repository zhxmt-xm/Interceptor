import { useTranslation } from 'react-i18next';

import type { ComposerResponse } from '../../../../shared/desktop-api';
import { timingPhases } from '../utils';

import { ResponseSection } from './ResponseSection';
import styles from './ResponseTimingPane.module.css';

export interface ResponseTimingPaneProps {
  response: ComposerResponse;
}

/** 分阶段耗时条与连接信息。 */
export function ResponseTimingPane({
  response,
}: ResponseTimingPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const phases = timingPhases(response.timing);
  const connection = [
    ...(response.remoteAddress
      ? [{ name: t('composer.remoteAddress'), value: response.remoteAddress }]
      : []),
    ...(response.tls
      ? [
          { name: 'TLS', value: response.tls.protocol },
          { name: 'Cipher', value: response.tls.cipher },
          { name: 'ALPN', value: response.tls.alpn },
          { name: 'Subject', value: response.tls.subject },
          { name: 'Issuer', value: response.tls.issuer },
        ]
      : []),
  ];

  return (
    <div className={styles.scroll}>
      <ResponseSection
        title={t('composer.timing')}
        count={t('composer.durationMs', { value: response.timing.totalMs })}
      >
        <div className={styles.timeline}>
          {phases.map((phase) => (
            <div key={phase.id} className={styles.row}>
              <span className={styles.phase}>{t(`composer.timing${phase.id}`)}</span>
              <span className={styles.duration}>
                {t('composer.durationMs', { value: phase.durationMs })}
              </span>
              <span className={styles.track}>
                <i
                  style={{
                    left: `${phase.offsetPercent}%`,
                    width: `${phase.widthPercent}%`,
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      </ResponseSection>

      {connection.length > 0 ? (
        <ResponseSection title={t('composer.connection')} rows={connection} />
      ) : null}
    </div>
  );
}
