import type { ReactNode } from 'react';

import styles from './SettingsContent.module.css';

/** Bordered settings group with one token-backed heading row. */
export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>{title}</div>
      {children}
    </div>
  );
}

/** Label, hint and right-aligned controls for one settings row. */
export function SettingsRow({
  label,
  hint,
  children,
  hintClassName,
}: {
  label: string;
  hint?: string;
  hintClassName?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.caption}>
        <b>{label}</b>
        {hint ? <span className={hintClassName}>{hint}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}