import { type LucideIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx, IconButton } from '../../../components';
import styles from './ActionCard.module.css';

export type ActionTone = 'map' | 'remote' | 'rewrite' | 'block' | 'throttle' | 'brk';

export interface ActionCardProps {
  icon: LucideIcon;
  tone: ActionTone;
  title: string;
  sub: string;
  onRemove: () => void;
  children: ReactNode;
}

/** A single rule action: colored icon header + a body of option rows. */
export function ActionCard({
  icon: Icon,
  tone,
  title,
  sub,
  onRemove,
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
        <IconButton
          icon={X}
          label="Remove action"
          size="sm"
          strokeWidth={2.2}
          onClick={onRemove}
        />
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
