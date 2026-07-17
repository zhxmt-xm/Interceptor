import type { ReactNode } from 'react';

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
  return (
    <div className={styles.app} data-collapsed={collapsed}>
      {sidebar}
      <header className={styles.top}>
        {topbar}
        {notification ? <div className={styles.notification}>{notification}</div> : null}
      </header>
      <main className={styles.main}>{main}</main>
      <footer className={styles.status}>{statusbar}</footer>
    </div>
  );
}
