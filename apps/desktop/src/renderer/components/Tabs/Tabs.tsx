import { MoreHorizontal } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { Flyout } from '../Flyout/Flyout';
import { cx } from '../share/cx';
import { TabLabel } from './TabLabel';
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

/** 溢出按钮自身占位；测量可见 tab 数量时要先扣掉它。 */
const OVERFLOW_TRIGGER_WIDTH = 32;
/** 与 .tabs 的 gap 保持一致。 */
const TAB_GAP = 2;

/**
 * 下划线 tab 条。容器放不下时把尾部 tab 收进 `…` 菜单，而不是裁切或换行：
 * 换行会让面板头高度浮动，横向滚动则看不出还有多少 tab。
 */
export function Tabs({ items, active, onSelect, automationIds }: TabsProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }
    const compute = (): void => {
      const widths = [...measure.children].map((child) => (child as HTMLElement).offsetWidth);
      const style = window.getComputedStyle(container);
      const available = container.clientWidth
        - Number.parseFloat(style.paddingLeft)
        - Number.parseFloat(style.paddingRight);
      let used = 0;
      let count = 0;
      for (const width of widths) {
        const next = used + width + (count > 0 ? TAB_GAP : 0);
        if (next > available) {
          break;
        }
        used = next;
        count += 1;
      }
      // 有 tab 被收起时，可见区还要让出 `…` 按钮的位置。
      if (count < widths.length) {
        while (count > 1 && used + TAB_GAP + OVERFLOW_TRIGGER_WIDTH > available) {
          count -= 1;
          used -= (widths[count] ?? 0) + TAB_GAP;
        }
      }
      setVisibleCount(Math.max(1, count));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items]);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);
  const activeIsHidden = overflow.some((item) => item.id === active);

  return (
    <div className={styles.tabs} ref={containerRef}>
      <div className={styles.measure} aria-hidden ref={measureRef}>
        {items.map((item) => (
          <span key={item.id} className={styles.tab}>
            <TabLabel item={item} />
          </span>
        ))}
      </div>

      {visible.map((item) => (
        <span
          key={item.id}
          className={cx(styles.tab, item.id === active && styles.active)}
          onClick={onSelect ? () => onSelect(item.id) : undefined}
          data-automation-id={automationIds?.[item.id]}
        >
          <TabLabel item={item} />
        </span>
      ))}

      {overflow.length > 0 ? (
        <Flyout
          open={menuOpen}
          onOpenChange={setMenuOpen}
          placement="bottomRight"
          className={styles.overflowMenu}
          content={
            <>
              {overflow.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={cx(styles.overflowItem, item.id === active && styles.overflowActive)}
                  onClick={() => {
                    setMenuOpen(false);
                    onSelect?.(item.id);
                  }}
                  data-automation-id={automationIds?.[item.id]}
                >
                  <TabLabel item={item} />
                </button>
              ))}
            </>
          }
        >
          <button
            type="button"
            className={cx(styles.overflowTrigger, activeIsHidden && styles.active)}
            aria-label={`${overflow.length} more`}
            title={overflow.map((item) => item.label).join(' · ')}
          >
            <MoreHorizontal size={15} strokeWidth={1.9} />
          </button>
        </Flyout>
      ) : null}
    </div>
  );
}
