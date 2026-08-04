import type { TabItem } from './Tabs';
import styles from './TabLabel.module.css';

export interface TabLabelProps {
  item: TabItem;
}

/** Tab 文本与可选计数；可见 tab、溢出菜单项与测量层共用同一份排版。 */
export function TabLabel({ item }: TabLabelProps): React.JSX.Element {
  return (
    <>
      {item.label}
      {item.count !== undefined ? (
        <>
          {' '}
          <span className={styles.count}>{item.count}</span>
        </>
      ) : null}
    </>
  );
}
