import type { ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  /** Optional dimmed count after the label. */
  count?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onSelect?: (id: string) => void;
  automationIds?: Partial<Record<string, AutomationId>>;
}

/** Underline tab strip. */
export function Tabs({ items, active, onSelect, automationIds }: TabsProps): React.JSX.Element {
  return (
    <div className={styles.tabs}>
      {items.map((item) => (
        <span
          key={item.id}
          className={cx(styles.tab, item.id === active && styles.active)}
          onClick={onSelect ? () => onSelect(item.id) : undefined}
          data-automation-id={automationIds?.[item.id]}
        >
          {item.label}
          {item.count !== undefined ? (
            <>
              {' '}
              <span className={styles.count}>{item.count}</span>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}

