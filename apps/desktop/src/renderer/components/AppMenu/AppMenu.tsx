import { Dropdown, type MenuProps } from 'antd';
import { BookOpen, MoreVertical, RefreshCw, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import { IconButton } from '../IconButton/IconButton';
import classes from './AppMenu.module.css';

interface AppMenuProps {
  readonly version: string | null;
  readonly onOpenGuidebook: () => void;
  readonly onCheckForUpdates: () => void;
  readonly onOpenSettings: () => void;
}

/** Header app menu: shell destinations plus the running App version. */
export function AppMenu({
  version,
  onOpenGuidebook,
  onCheckForUpdates,
  onOpenSettings,
}: AppMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const items: MenuProps['items'] = [
    {
      key: 'guidebook',
      icon: <BookOpen size={14} strokeWidth={1.9} aria-hidden />,
      label: (
        <span data-automation-id={AUTOMATION_IDS.shell.menu.guidebook}>
          {t('guidebook.title')}
        </span>
      ),
    },
    {
      key: 'updates',
      icon: <RefreshCw size={14} strokeWidth={1.9} aria-hidden />,
      label: (
        <span data-automation-id={AUTOMATION_IDS.shell.menu.updates}>
          {t('app.checkForUpdates')}
        </span>
      ),
    },
    {
      key: 'settings',
      icon: <Settings size={14} strokeWidth={1.9} aria-hidden />,
      label: (
        <span data-automation-id={AUTOMATION_IDS.shell.menu.settings}>
          {t('sidebar.settings')}
        </span>
      ),
    },
  ];

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      placement="bottomRight"
      trigger={['click']}
      menu={{
        'aria-label': t('app.menu'),
        items,
        selectable: false,
        onClick: ({ key }) => {
          if (key === 'guidebook') onOpenGuidebook();
          else if (key === 'updates') onCheckForUpdates();
          else onOpenSettings();
        },
      }}
      popupRender={(menu) => (
        <div className={classes.panel}>
          {menu}
          <div
            className={classes.version}
            data-automation-id={AUTOMATION_IDS.shell.menu.version}
          >
            <span className={classes.versionName}>Interceptor</span>
            <span className={classes.versionNumber}>{version ? `v${version}` : '—'}</span>
          </div>
        </div>
      )}
      styles={{
        item: {
          minHeight: 32,
          marginBlock: 0,
          marginInline: 0,
          padding: '0 8px',
          borderRadius: 6,
          fontSize: 12,
        },
        itemContent: { fontSize: 12, fontWeight: 500, lineHeight: '18px' },
      }}
    >
      {/* Dropdown 需要一个真实 DOM 子节点来绑定点击与定位。 */}
      <span className={classes.trigger}>
        <IconButton
          automationId={AUTOMATION_IDS.shell.menu.trigger}
          icon={MoreVertical}
          label={t('app.menu')}
          size="sm"
          tooltip={null}
        />
      </span>
    </Dropdown>
  );
}
