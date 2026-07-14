import type { ReactNode } from 'react';

import styles from './Title.module.css';

export interface TitleProps {
  children: ReactNode;
}

/** Screen / panel heading (topbar title style). */
export function Title({ children }: TitleProps): React.JSX.Element {
  return <span className={styles.title}>{children}</span>;
}
