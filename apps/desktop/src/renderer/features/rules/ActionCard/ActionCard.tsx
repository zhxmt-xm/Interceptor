import { type LucideIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { AutomationId } from '../../../../shared/automation-ids';
import { cx, IconButton } from '../../../components';
import styles from './ActionCard.module.css';

export type ActionTone = 'map' | 'remote' | 'rewrite' | 'block' | 'flow' | 'brk';

export interface ActionCardProps {
  icon: LucideIcon;
  tone: ActionTone;
  title: string;
  sub: string;
  removeAutomationId?: AutomationId;
  onRemove: () => void;
  children: ReactNode;
}

/** A single rule action: colored icon header + a body of option rows. */
export function ActionCard({
  icon: Icon,
  tone,
  title,
  sub,
  removeAutomationId,
  onRemove,
  children,
}: ActionCardProps): React.JSX.Element {
  const { t } = useTranslation();
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
          label={t('rules.removeAction')}
          size="sm"
          strokeWidth={2.2}
          automationId={removeAutomationId}
          onClick={onRemove}
        />
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
