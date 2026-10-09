import { ShieldCheck } from 'lucide-react';

import { UpstreamProxyEditor } from './UpstreamProxyEditor';
import styles from './UpstreamProxySettings.module.css';

export function UpstreamProxySettings(): React.JSX.Element {
  return (
    <section className={styles.upstreamSettings} data-design-upstream-settings="" data-parity="upstream-settings">
      <header className={styles.upstreamSettingsHeading}>
        <h2>Upstream proxy</h2>
        <p>Choose how Interceptor connects to destinations after capturing traffic.</p>
      </header>
      <div className={styles.upstreamSettingsCard}><UpstreamProxyEditor /></div>
      <div className={styles.upstreamRecoveryNote}>
        <ShieldCheck size={16} aria-hidden="true" />
        <p>Separate from system proxy routing. Your original macOS proxy settings are restored when Interceptor exits.</p>
      </div>
    </section>
  );
}
