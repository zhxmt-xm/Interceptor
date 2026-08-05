import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { cx, SectionHeader } from '../../../components';

import styles from './Section.module.css';

export interface SectionProps {
  title: string;
  count?: ReactNode;
  /** 让区块吃掉剩余高度，正文区用。 */
  grow?: boolean;
  children?: ReactNode;
}

/** Inspector 的一个分组：整条标题行都是折叠命中区，chevron 只是提示。 */
export function Section({
  title,
  count,
  grow = false,
  children,
}: SectionProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={cx(grow && !collapsed && styles.sectionGrow)}>
      <SectionHeader
        count={count}
        className={cx(styles.head, collapsed && styles.collapsedHead)}
        onClick={() => setCollapsed(!collapsed)}
      >
        {title}
        <ChevronDown
          className={cx(styles.chevron, collapsed && styles.collapsedChevron)}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </SectionHeader>
      {collapsed ? null : children}
    </div>
  );
}
