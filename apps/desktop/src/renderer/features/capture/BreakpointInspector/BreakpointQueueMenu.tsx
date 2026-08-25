import { Dropdown, type MenuProps } from 'antd';
import { Ellipsis, Play, ShieldX, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { BreakpointQueueKey } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import {
  continueQueue,
  continueRule,
  dropQueue,
} from '../../breakpoints/data/useBreakpoints';
import styles from './BreakpointQueueMenu.module.css';

export interface BreakpointQueueMenuProps {
  readonly queueKey: BreakpointQueueKey;
  readonly ruleId?: string;
}

/** Batch actions for the current logical breakpoint queue or Rule. */
export function BreakpointQueueMenu({
  queueKey,
  ruleId,
}: BreakpointQueueMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const resolving = useBreakpointsStore((state) => state.resolving);
  const label = (text: string, automationId: string, parity: string): React.JSX.Element => (
    <span
      className={styles.itemLabel}
      data-automation-id={automationId}
      data-parity={parity}
    >
      {text}
    </span>
  );
  const items: MenuProps['items'] = [
    {
      key: 'continue-queue',
      icon: <Play size={15} strokeWidth={1.9} />,
      label: label(
        t('breakpoints.continueQueue'),
        AUTOMATION_IDS.breakpoints.continueQueue,
        'breakpoint-queue-continue',
      ),
    },
    {
      key: 'drop-queue',
      danger: true,
      icon: <ShieldX size={15} strokeWidth={1.9} />,
      label: label(
        t('breakpoints.dropQueue'),
        AUTOMATION_IDS.breakpoints.dropQueue,
        'breakpoint-queue-drop',
      ),
    },
    ...(ruleId ? [
      { type: 'divider' as const },
      {
        key: 'continue-rule',
        icon: <SkipForward size={15} strokeWidth={1.9} />,
        label: label(
          t('breakpoints.continueRule'),
          AUTOMATION_IDS.breakpoints.continueRule,
          'breakpoint-queue-continue-rule',
        ),
      },
    ] : []),
  ];

  const runCommand = (key: string): void => {
    if (key === 'continue-queue') {
      void continueQueue(queueKey);
    } else if (key === 'drop-queue') {
      void dropQueue(queueKey);
    } else if (key === 'continue-rule' && ruleId) {
      void continueRule(ruleId);
    }
  };

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      disabled={resolving}
      classNames={{ root: styles.queueMenu }}
      placement="bottomRight"
      trigger={['click']}
      menu={{ items, selectable: false, onClick: ({ key }) => runCommand(key) }}
    >
      <span className={styles.trigger}>
        <IconButton
          automationId={AUTOMATION_IDS.breakpoints.queueMenu}
          disabled={resolving}
          className={styles.triggerButton}
          icon={Ellipsis}
          label={t('breakpoints.queueActions')}
          size="sm"
        />
      </span>
    </Dropdown>
  );
}
