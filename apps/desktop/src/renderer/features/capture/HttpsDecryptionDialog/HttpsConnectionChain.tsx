import { AppWindow, ArrowRight, Globe, Lock, LockOpen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { cx } from '../../../components/share/cx';

import styles from './HttpsConnectionChain.module.css';

export interface HttpsConnectionChainProps {
  decrypting: boolean;
}

export function HttpsConnectionChain({ decrypting }: HttpsConnectionChainProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className={styles.chain}
      data-automation-id={AUTOMATION_IDS.capture.httpsSetup.connectionChain}
      data-decrypting={decrypting}
    >
      <span className={cx(styles.icon, styles.client)}><AppWindow aria-hidden="true" /></span>
      <div className={cx(styles.wire, styles.inbound)} aria-hidden="true">
        <span className={styles.segment}><span className={styles.flow} /></span>
        <span className={cx(styles.badge, styles.route)}><ArrowRight /></span>
        <span className={styles.segment} />
      </div>
      <span className={cx(styles.icon, styles.interceptor)}><Zap aria-hidden="true" /></span>
      <div className={cx(styles.wire, styles.outbound)} aria-hidden="true">
        <span className={styles.segment}><span className={styles.flow} /></span>
        <span className={cx(styles.badge, styles.lock, decrypting && styles.decrypting)}>
          {decrypting ? <Lock /> : <LockOpen />}
        </span>
        <span className={styles.segment} />
      </div>
      <span className={cx(styles.icon, styles.internet)}><Globe aria-hidden="true" /></span>
      <span className={cx(styles.name, styles.clientName)}>{t('capture.httpsClientApps')}</span>
      <span className={cx(styles.name, styles.interceptorName)}>Interceptor</span>
      <span className={cx(styles.name, styles.internetName)}>{t('capture.httpsInternet')}</span>
    </div>
  );
}