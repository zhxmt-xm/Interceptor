import { ShieldCheck, TriangleAlert, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './AppContainerEnableAllDialog.module.css';

export function AppContainerEnableAllDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.overlay !== 'app-container-enable-all') {
    return null;
  }

  const close = (): void => updateState({ overlay: '' });
  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section aria-labelledby="enable-all-app-containers-title" className={styles.dialog}>
        <header className={styles.header}>
          <span className={styles.icon}><ShieldCheck aria-hidden="true" /></span>
          <h2 id="enable-all-app-containers-title">Enable all app containers?</h2>
          <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={close} />
        </header>
        <div className={styles.content}>
          <p>
            Enable loopback access for all <b>4 current app containers</b> in one Windows approval.
            Existing exemptions are preserved.
          </p>
          <div className={styles.summary}>
            <span>Will enable</span>
            <strong>4 app containers</strong>
          </div>
          <div className={styles.warning}>
            <TriangleAlert aria-hidden="true" />
            <span>This grants access to every loopback port on this PC and persists after Interceptor exits.</span>
          </div>
        </div>
        <footer className={styles.footer}>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn pri')} type="button" onClick={close}>
            <ShieldCheck aria-hidden="true" />
            Continue to Windows approval
          </button>
        </footer>
      </section>
    </div>
  );
}