import { Popover, type PopoverProps } from 'antd';
import { type ReactNode } from 'react';

import { cx } from '../share/cx';
import styles from './Flyout.module.css';

export interface FlyoutProps {
  /** Whether the flyout panel is open (controlled). */
  open: boolean;
  /** Called when Ant requests a state change: trigger click, outside press or Escape. */
  onOpenChange: (open: boolean) => void;
  /** The flyout panel content (menu items, etc.). */
  content: ReactNode;
  /** Panel position relative to the trigger. Default 'bottomRight'. */
  placement?: PopoverProps['placement'];
  /** Extra class merged onto the panel body slot 鈥?typically width / max-height. */
  className?: string;
  /** The trigger element the panel is anchored to. */
  children: ReactNode;
}

/**
 * Click-triggered popover menu built on Ant Design's Popover: Ant owns positioning,
 * outside-press / Escape dismissal, portal and open/close animation. The panel look
 * (panel background, 1px border, 12px radius, shadow, 7px padding) is carried by the
 * shared `body` semantic slot; callers pass `className` only to size the panel.
 */
export function Flyout({
  open,
  onOpenChange,
  content,
  placement = 'bottomRight',
  className,
  children,
}: FlyoutProps): React.JSX.Element {
  return (
    <Popover
      trigger="click"
      arrow={false}
      open={open}
      onOpenChange={onOpenChange}
      placement={placement}
      content={content}
      classNames={{ container: cx(styles.panel, className) }}
    >
      {children}
    </Popover>
  );
}

