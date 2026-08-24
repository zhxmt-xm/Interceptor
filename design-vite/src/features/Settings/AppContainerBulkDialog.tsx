import { ShieldCheck, ShieldX, TriangleAlert, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './AppContainerBulkDialog.module.css';

export function AppContainerBulkDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const enabling = state.overlay === 'app-container-enable-all';
  const disabling = state.overlay === 'app-container-disable-all';
  if (!enabling && !disabling) {
    return null;
  }

  const close = (): void => updateState({ overlay: '' });
  const Icon = enabling ? ShieldCheck : ShieldX;
  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-labelledby="bulk-app-containers-title"
        className={styles.dialog}
        data-action={enabling ? 'enable' : 'disable'}
      >
        <header className={styles.header}>
          <span className={styles.icon}><Icon aria-hidden="true" /></span>
          <h2 id="bulk-app-containers-title">
            {enabling ? 'Enable all app containers?' : 'Disable all app containers?'}
          </h2>
          <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={close} />
        </header>
        <div className={styles.content}>
          <p>
            {enabling
              ? <>Enable loopback access for all <b>4 current app containers</b> in one Windows approval. Existing exemptions outside this list are preserved.</>
              : <>Remove loopback access from all <b>4 current app containers</b> in one Windows approval. Existing exemptions outside this list are preserved.</>}
          </p>
          <div className={styles.summary}>
            <span>{enabling ? 'Will enable' : 'Will disable'}</span>
            <strong>4 app containers</strong>
          </div>
          <div className={styles.warning}>
            <TriangleAlert aria-hidden="true" />
            <span>
              {enabling
                ? 'This grants access to every loopback port on this PC and persists after Interceptor exits.'
                : 'Apps that depend on local loopback access may stop working until they are enabled again.'}
            </span>
          </div>
        </div>
        <footer className={styles.footer}>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button
            className={fixtureClassNames(enabling ? 'btn pri' : 'btn danger')}
            type="button"
            onClick={close}
          >
            <Icon aria-hidden="true" />
            Continue to Windows approval
          </button>
        </footer>
      </section>
    </div>
  );
}