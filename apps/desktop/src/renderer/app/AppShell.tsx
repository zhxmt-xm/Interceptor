import { Maximize2, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './AppShell.module.css';

interface AppShellProps {
  collapsed: boolean;
  sidebar: ReactNode;
  topbar: ReactNode;
  notification?: ReactNode;
  main: ReactNode;
  statusbar: ReactNode;
}

/**
 * The persistent window chrome: a CSS grid with side / top / main / status
 * areas. The sidebar is shared; each feature supplies its own topbar, main
 * pane and statusbar row, which drop into the matching grid areas.
 */
export function AppShell({
  collapsed,
  sidebar,
  topbar,
  notification,
  main,
  statusbar,
}: AppShellProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={styles.app} data-collapsed={collapsed}>
      {sidebar}
      <header className={styles.top}>
        {topbar}
        {notification}
        <div className={styles.windowControls}>
          <button
            type="button"
            className={styles.windowControl}
            aria-label={t('app.minimizeWindow')}
            title={t('app.minimizeWindow')}
            onClick={() => void window.interceptor.minimizeWindow()}
          >
            <Minus size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className={styles.windowControl}
            aria-label={t('app.toggleMaximizeWindow')}
            title={t('app.toggleMaximizeWindow')}
            onClick={() => void window.interceptor.toggleMaximizeWindow()}
          >
            <Maximize2 size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className={styles.close}
            aria-label={t('capture.close')}
            title={t('capture.close')}
            onClick={() => {
              void window.interceptor.closeApplication().catch(() => window.close());
            }}
          >
            <X size={15} strokeWidth={1.9} />
          </button>
        </div>
      </header>
      <main className={styles.main}>{main}</main>
      <footer className={styles.status}>{statusbar}</footer>
    </div>
  );
}
