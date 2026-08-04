import type { ReactNode } from 'react';

import { cx, SectionHeader } from '../../../components';

import styles from './Section.module.css';

export interface SectionProps {
  title: string;
  count?: ReactNode;
  /** 让区块吃掉剩余高度，正文区用。 */
  grow?: boolean;
  children?: ReactNode;
}


export function Section({
  title,
  count,
  grow = false,
  children,
}: SectionProps): React.JSX.Element {
  return (
    <div className={cx(grow && styles.sectionGrow)}>
      <SectionHeader count={count}>{title}</SectionHeader>
      {children}
    </div>
  );
}
