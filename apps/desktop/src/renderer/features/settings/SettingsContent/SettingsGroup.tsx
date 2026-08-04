import type { ReactNode } from 'react';

import styles from './SettingsGroup.module.css';

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

/** Bordered settings group with one token-backed heading row. */
export function SettingsGroup({
  title,
  children,
}: SettingsGroupProps): React.JSX.Element {
  return (
    <div className={styles.group}>
      <div className={styles.head}>{title}</div>
      {children}
    </div>
  );
}
