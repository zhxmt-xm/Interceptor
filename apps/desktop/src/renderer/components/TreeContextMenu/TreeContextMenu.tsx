import { Dropdown } from 'antd';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';

import { cx } from '../share/cx';

import styles from './TreeContextMenu.module.css';

export interface TreeMenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  /** 删除类操作用红色，并与上一组之间画分隔线。 */
  danger?: boolean;
  disabled?: boolean;
  automationId?: string;
  onSelect: () => void;
}

export interface TreeContextMenuProps {
  items: readonly TreeMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactElement;
}

/**
 * 目录树的右键菜单。挂在 body 上（Ant Design Dropdown），因此不会被侧栏的
 * overflow 裁掉；受控 open 让行尾的 more 按钮与右键共用同一个弹层。
 */
export function TreeContextMenu({
  items,
  open,
  onOpenChange,
  children,
}: TreeContextMenuProps): React.JSX.Element {
  return (
    <Dropdown
      trigger={['contextMenu']}
      open={open}
      onOpenChange={onOpenChange}
      destroyOnHidden
      popupRender={() => (
        <div className={styles.menu}>
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.danger && index > 0 ? <div className={styles.separator} /> : null}
              <button
                type="button"
                disabled={item.disabled}
                className={cx(styles.item, item.danger && styles.danger)}
                data-automation-id={item.automationId}
                onClick={() => {
                  onOpenChange(false);
                  item.onSelect();
                }}
              >
                <item.icon strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            </Fragment>
          ))}
        </div>
      )}
      menu={{ items: [] }}
    >
      {children}
    </Dropdown>
  );
}
