import type { LucideIcon } from 'lucide-react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './NavItem.module.css';

export interface NavItemProps {
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
  /** Secondary stacked sub-label (e.g. the session endpoint). */
  sub?: string;
  /** Show the trailing live dot. */
  live?: boolean;
  /** Render an avatar circle instead of an icon. */
  avatar?: boolean;
  /** Native tooltip / accessible title (e.g. live Proxy Core status). */
  title?: string;
  automationId?: AutomationId;
}

/**
 * A sidebar row. Renders as a button when `onClick` is given, otherwise a
 * static div (session / account). Owns its own collapsed-rail styling.
 */
export function NavItem({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
  sub,
  live,
  avatar,
  title,
  automationId,
}: NavItemProps): React.JSX.Element {
  const className = cx(styles.navItem, active && styles.active, collapsed && styles.collapsed);
  const inner = (
    <>
      {avatar ? (
        <span className={styles.avatar} />
      ) : Icon ? (
        <Icon size={18} strokeWidth={1.9} />
      ) : null}
      {sub ? (
        <span className={cx(styles.text, styles.stacked)}>
          <span>{label}</span>
          <small>{sub}</small>
        </span>
      ) : (
        <span className={styles.text}>{label}</span>
      )}
      {live ? <span className={styles.live} /> : null}
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      title={title ?? (collapsed ? label : undefined)}
      data-automation-id={automationId}
    >
      {inner}
    </button>
  ) : (
    <div className={className} title={title}>
      {inner}
    </div>
  );
}

