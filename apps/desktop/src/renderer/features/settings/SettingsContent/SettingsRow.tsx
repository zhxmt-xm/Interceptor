import type { ReactNode } from 'react';

import { cx } from '../../../components/share/cx';
import styles from './SettingsRow.module.css';

export interface SettingsRowProps {
  label: string;
  hint?: string;
  additionalHint?: string;
  className?: string;
  /** 让调用方给提示文字换一种色调，例如等宽或弱化。 */
  hintClassName?: string;
  children: ReactNode;
}

/** Label, hint and right-aligned controls for one settings row. */
export function SettingsRow({
  label,
  hint,
  additionalHint,
  className,
  hintClassName,
  children,
}: SettingsRowProps): React.JSX.Element {
  return (
    <div className={cx(styles.row, className)}>
      <div className={styles.caption}>
        <b>{label}</b>
        {hint ? <span className={hintClassName}>{hint}</span> : null}
        {additionalHint ? <span className={hintClassName}>{additionalHint}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}
