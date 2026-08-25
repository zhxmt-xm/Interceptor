import { Dropdown, type MenuProps } from 'antd';
import { Ellipsis, Play, ShieldX, SkipForward } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import styles from './BreakpointQueueMenu.module.css';

const label = (text: string, parity: string): React.JSX.Element => (
  <span className={styles.queueItemLabel} data-parity={parity}>{text}</span>
);

function queueItems(includeRule: boolean): MenuProps['items'] {
  return [
  {
    key: 'continue-queue',
    icon: <Play aria-hidden="true" size={15} />,
    label: label('Continue all', 'breakpoint-queue-continue'),
  },
  {
    key: 'drop-queue',
    danger: true,
    icon: <ShieldX aria-hidden="true" size={15} />,
    label: label('Drop all', 'breakpoint-queue-drop'),
  },
  ...(includeRule ? [
    { type: 'divider' as const },
    {
      key: 'continue-rule',
      icon: <SkipForward aria-hidden="true" size={15} />,
      label: label('Continue all from this rule', 'breakpoint-queue-continue-rule'),
    },
  ] : []),
  ];
}

export function BreakpointQueueMenu({ includeRule = true }: { readonly includeRule?: boolean }): React.JSX.Element {
  const { state, updateState } = useDesignState();
  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      open={state.breakpointQueueMenu === 'open'}
      placement="bottomRight"
      trigger={['click']}
      menu={{
        'aria-label': 'Queue actions',
        items: queueItems(includeRule),
        selectable: false,
        onClick: () => updateState({ breakpointQueueMenu: '' }),
      }}
      classNames={{ root: styles.queueMenu }}
      onOpenChange={(open) => updateState({ breakpointQueueMenu: open ? 'open' : '' })}
    >
      <span>
        <IconButton
          icon={<Ellipsis aria-hidden="true" />}
          label="Queue actions"
          onClick={() => updateState({ breakpointQueueMenu: 'open' })}
        />
      </span>
    </Dropdown>
  );
}
