import { type ReactNode, useId, useState } from 'react';

import type { AutomationId } from '../../../../shared/automation-ids';
import { cx, SectionHeader } from '../../../components';

import styles from './Section.module.css';

export interface SectionProps {
  title: string;
  automationId?: AutomationId;
  count?: ReactNode;
  labelExtra?: ReactNode;
  /** 让区块吃掉剩余高度，正文区用。 */
  grow?: boolean;
  children?: ReactNode;
}

/** Inspector 的一个分组：整条标题行都是折叠命中区，chevron 只是提示。 */
export function Section({
  title,
  automationId,
  count,
  labelExtra,
  grow = false,
  children,
}: SectionProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  return (
    <div className={cx(grow && !collapsed && styles.sectionGrow)}>
      <SectionHeader
        automationId={automationId}
        count={count}
        extra={labelExtra}
        collapsed={collapsed}
        className={cx(styles.head, collapsed && styles.collapsedHead)}
        controlsId={contentId}
        toggleLabel={title}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>{title}</span>
      </SectionHeader>
      <div id={contentId} className={styles.body} hidden={collapsed}>{children}</div>
    </div>
  );
}
