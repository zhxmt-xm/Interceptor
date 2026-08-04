import type { ReactNode } from 'react';

import styles from './SettingsRow.module.css';

export interface SettingsRowProps {
  label: string;
  hint?: string;
  /** 让调用方给提示文字换一种色调，例如等宽或弱化。 */
  hintClassName?: string;
  children: ReactNode;
}

/** Label, hint and right-aligned controls for one settings row. */
export function SettingsRow({
  label,
  hint,
  hintClassName,
  children,
}: SettingsRowProps): React.JSX.Element {
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
