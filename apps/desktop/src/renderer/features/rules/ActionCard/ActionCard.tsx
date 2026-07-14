import { type LucideIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx, IconButton, Switch } from '../../../components';
import styles from './ActionCard.module.css';

export interface ActionCardProps {
  icon: LucideIcon;
  tone: 'map' | 'rewrite';
  title: string;
  sub: string;
  children: ReactNode;
}

/** A single rule action: colored icon header + a body of option rows. */
export function ActionCard({
  icon: Icon,
  tone,
  title,
  sub,
  children,
}: ActionCardProps): React.JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={cx(styles.icon, styles[tone])}>
          <Icon size={15} strokeWidth={1.9} />
        </span>
        <b>{title}</b>
        <span className={styles.sub}>{sub}</span>
        <span className={styles.spacer} />
        <Switch checked />
        <IconButton icon={X} label="Remove" size="sm" strokeWidth={2.2} />
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
