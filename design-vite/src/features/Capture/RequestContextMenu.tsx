import { Dropdown, type MenuProps } from 'antd';
import {
  Ban,
  Clock,
  Code,
  Crosshair,
  FileText,
  GitBranch,
  Globe,
  MapPin,
  Pause,
  Reply,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { type ReactElement } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './RequestContextMenu.module.css';

interface RequestContextMenuProps {
  readonly children: ReactElement;
}

interface DesignMenuItem {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  readonly icon: LucideIcon;
}

const GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly items: readonly DesignMenuItem[];
}> = [
  {
    label: 'Rewrite',
    items: [
      { key: 'header', name: 'Rewrite header', hint: 'name / value', icon: Code },
      { key: 'query', name: 'Rewrite query', hint: 'name / value', icon: Code },
      { key: 'body', name: 'Rewrite body', hint: 'text / json', icon: FileText },
      { key: 'status', name: 'Set status', hint: 'override', icon: Code },
    ],
  },
  {
    label: 'Serve & reroute',
    items: [
      { key: 'map-local', name: 'Map Local', hint: 'serve file', icon: MapPin },
      { key: 'map-remote', name: 'Map Remote', hint: 'reroute', icon: Globe },
      { key: 'synthetic', name: 'Synthetic', hint: 'return response', icon: Reply },
    ],
  },
  {
    label: 'Traffic',
    items: [
      { key: 'delay', name: 'Delay', hint: 'latency', icon: Clock },
    ],
  },
];

const BREAKPOINT_SCOPES: readonly DesignMenuItem[] = [
  { key: 'breakpoint:endpoint', name: 'This endpoint', hint: '/common/oauth2/v2.0/token', icon: Crosshair },
  { key: 'breakpoint:path-prefix', name: 'This path prefix', hint: '/common/oauth2/v2.0/token/*', icon: GitBranch },
  { key: 'breakpoint:host', name: 'This host', hint: 'login.microsoftonline.com/*', icon: Globe },
  { key: 'breakpoint:custom', name: 'Custom breakpoint…', hint: 'method, timeout, phases', icon: Settings2 },
];

export function RequestContextMenu({ children }: RequestContextMenuProps): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const label = (name: string, hint: string, parity?: string): React.JSX.Element => (
    <span className={styles.itemLabel} data-parity={parity}>
      <span className={styles.itemName}>{name}</span>
      <span className={styles.itemHint}>{hint}</span>
    </span>
  );
  const item = ({ key, name, hint, icon: Icon }: DesignMenuItem): NonNullable<MenuProps['items']>[number] => ({
    key,
    icon: <Icon size={16} strokeWidth={1.9} />,
    label: label(name, hint, key === 'header' ? 'request-rule-header' : undefined),
  });
  const items: MenuProps['items'] = [
    {
      key: 'title',
      disabled: true,
      label: <span className={styles.title}>Create rule for this request</span>,
    },
    ...GROUPS.map((group) => ({
      key: `group-${group.label}`,
      type: 'group' as const,
      label: <span className={styles.groupLabel}>{group.label}</span>,
      children: group.items.map(item),
    })),
    {
      key: 'group-control',
      type: 'group',
      label: <span className={styles.groupLabel}>Control</span>,
      children: [
        item({ key: 'block', name: 'Block', hint: 'reset / close', icon: Ban }),
      ],
    },
    {
      key: 'breakpoint',
      icon: <Pause size={16} strokeWidth={1.9} />,
      label: label('Breakpoint', 'pause next match', 'request-rule-breakpoint'),
      popupClassName: styles.breakpointPopup,
      children: [
        {
          key: 'breakpoint-title',
          disabled: true,
          label: <span className={styles.title}>Create breakpoint from request</span>,
        },
        ...BREAKPOINT_SCOPES.map(item),
      ],
    },
  ];

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      placement="right"
      trigger={['contextMenu']}
      onOpenChange={(open) => {
        updateState({ requestMenu: open ? 'open' : '' });
      }}
      menu={{
        items,
        selectable: false,
        subMenuCloseDelay: 0.1,
        subMenuOpenDelay: 0,
        triggerSubMenuAction: 'hover',
        onClick: ({ key }) => {
          if (key === 'breakpoint:custom') {
            updateState({ view: 'rules', requestMenu: '' });
          } else if (key.startsWith('breakpoint:')) {
            updateState({ requestMenu: '', breakpointMessage: 'created' });
          } else {
            updateState({ view: 'rules', requestMenu: '' });
          }
        },
      }}
    >
      <div className={styles.trigger}>{children}</div>
    </Dropdown>
  );
}
