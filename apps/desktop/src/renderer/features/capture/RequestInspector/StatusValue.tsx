import type { ReactNode } from 'react';

import { cx } from '../../../components';
import type { StatusKind } from '../interfaces';

import styles from './StatusValue.module.css';

export interface StatusValueProps {
  kind: StatusKind;
  children: ReactNode;
}

/** Status value styled like the request list: a colored dot plus the original status text. */
export function StatusValue({ kind, children }: StatusValueProps): React.JSX.Element {
  return (
    <span className={cx(styles.statusValue, styles[kind])}>
      <span className={styles.statusDot} />
      {children}
    </span>
  );
}
