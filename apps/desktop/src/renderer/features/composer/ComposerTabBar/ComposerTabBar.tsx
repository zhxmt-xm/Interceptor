import type { ReactNode } from 'react';

import type { AutomationId } from '../../../../shared/automation-ids';
import { cx } from '../../../components/share/cx';

import styles from './ComposerTabBar.module.css';

export interface ComposerTab {
  id: string;
  label: string;
  /** 计数徽标；0 或缺省时不渲染。 */
  count?: number;
  /** 用小圆点代替计数，表示「有内容」。 */
  dot?: boolean;
  automationId?: AutomationId;
}

export interface ComposerTabBarProps {
  tabs: readonly ComposerTab[];
  active: string;
  onSelect: (id: string) => void;
  /** 右侧附加内容：请求区放协议选择，响应区放状态与指标。 */
  trailing?: ReactNode;
}

/** 请求区与响应区共用的页签条：活动下划线 + 可选计数徽标。 */
export function ComposerTabBar({
  tabs,
  active,
  onSelect,
  trailing,
}: ComposerTabBarProps): React.JSX.Element {
  return (
    <div className={styles.tabbar}>
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={cx(styles.tab, active === tab.id && styles.active)}
            onClick={() => onSelect(tab.id)}
            data-automation-id={tab.automationId}
          >
            <i className={styles.label}>
              {tab.label}
              {tab.dot ? <b className={styles.dot} /> : null}
              {!tab.dot && tab.count ? (
                <b className={styles.count}>{tab.count}</b>
              ) : null}
            </i>
          </button>
        ))}
      </div>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  );
}
