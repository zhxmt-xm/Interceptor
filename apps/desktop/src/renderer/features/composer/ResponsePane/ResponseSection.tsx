import { Fragment, type ReactNode, useId, useState } from 'react';

import type { AutomationId } from '../../../../shared/automation-ids';
import { cx, SectionHeader } from '../../../components';

import styles from './ResponseSection.module.css';

export interface ResponseSectionProps {
  title: string;
  automationId?: AutomationId;
  /** 标题右侧的计数或已格式化的摘要文本。 */
  count?: number | string;
  /** 无内容时展示的说明。 */
  emptyText?: string;
  /** 名值对；为空数组且给了 emptyText 时改显示说明。 */
  rows?: ReadonlyArray<{ name: string; value: string }>;
  children?: ReactNode;
}

/** 响应区滚动页里的一个区块：标题 + 名值对或自定义内容。 */
export function ResponseSection({
  title,
  automationId,
  count,
  emptyText,
  rows,
  children,
}: ResponseSectionProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  return (
    <section className={styles.section}>
      <SectionHeader
        automationId={automationId}
        count={count}
        collapsed={collapsed}
        className={cx(styles.head, collapsed && styles.collapsedHead)}
        controlsId={contentId}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>{title}</span>
      </SectionHeader>
      <div id={contentId} className={styles.body} hidden={collapsed}>
        {rows && rows.length === 0 && emptyText ? (
          <span className={styles.empty}>{emptyText}</span>
        ) : null}
        {rows && rows.length > 0 ? (
          <div className={styles.kv}>
            {rows.map((row, index) => (
              <Fragment key={`${row.name}-${index}`}>
                <span className={styles.key}>{row.name}</span>
                <span className={styles.value}>{row.value}</span>
              </Fragment>
            ))}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
