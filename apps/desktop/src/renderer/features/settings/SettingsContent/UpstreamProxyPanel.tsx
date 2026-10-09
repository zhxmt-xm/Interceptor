import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { UpstreamProxyEditor } from '../UpstreamProxyEditor/UpstreamProxyEditor';
import styles from './UpstreamProxyPanel.module.css';

export function UpstreamProxyPanel(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={styles.upstreamSettings} data-parity="upstream-settings">
      <header className={styles.upstreamSettingsHeading}>
        <h2>{t('upstream.title')}</h2>
        <p>{t('upstream.description')}</p>
      </header>
      <div className={styles.upstreamSettingsCard}><UpstreamProxyEditor /></div>
      <div className={styles.upstreamRecoveryNote}>
        <ShieldCheck size={16} aria-hidden="true" /><p>{t('upstream.recovery')}</p>
      </div>
    </section>
  );
}
