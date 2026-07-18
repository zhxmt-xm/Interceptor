import {
  Activity,
  GitBranch,
  Globe,
  type LucideIcon,
  Pause,
  Send,
  Settings,
  Terminal,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { CoreProcessStatus } from '../../shared/desktop-api';
import { cx, LanguageSwitcher, NavItem, ThemeSwitcher, type LangId } from '../components';
import type { ThemeMode } from '../theme/theme';
import styles from './Sidebar.module.css';

export type ViewId =
  | 'capture'
  | 'rules'
  | 'composer'
  | 'breakpoints'
  | 'diagnostics'
  | 'settings';

const NAV = [
  { id: 'capture', labelKey: 'sidebar.capture', Icon: Activity },
  { id: 'rules', labelKey: 'sidebar.rulesMap', Icon: GitBranch },
  { id: 'composer', labelKey: 'sidebar.composer', Icon: Send },
  { id: 'breakpoints', labelKey: 'sidebar.breakpoints', Icon: Pause },
  { id: 'diagnostics', labelKey: 'sidebar.diagnostics', Icon: Terminal },
] satisfies Array<{ id: ViewId; labelKey: string; Icon: LucideIcon }>;

const CORE_STATE_KEYS: Record<CoreProcessStatus['state'], string> = {
  starting: 'coreState.starting',
  running: 'coreState.running',
  unresponsive: 'coreState.unresponsive',
  restarting: 'coreState.restarting',
  stopping: 'coreState.stopping',
  stopped: 'coreState.stopped',
};

interface SidebarProps {
  activeView: ViewId;
  collapsed: boolean;
  onSelect: (view: ViewId) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  lang: LangId;
  onLangChange: (lang: LangId) => void;
  coreStatus: CoreProcessStatus;
  sessionEndpoint?: string;
}

export function Sidebar({
  activeView,
  collapsed,
  onSelect,
  theme,
  onThemeChange,
  lang,
  onLangChange,
  coreStatus,
  sessionEndpoint = '127.0.0.1:8888',
}: SidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const coreOnline = coreStatus.state === 'running';
  const coreTitle = t('sidebar.coreTitle', {
    state: t(CORE_STATE_KEYS[coreStatus.state]),
    pid: coreStatus.pid != null ? ` · PID ${coreStatus.pid}` : '',
  });

  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.collapsed)}
      role="navigation"
      aria-label={t('sidebar.navigation')}
    >
      <div className={styles.brand}>
        <span className={styles.logo}>
          <Zap size={17} strokeWidth={2} />
        </span>
        <b className={styles.brandName}>Interceptor</b>
      </div>

      <div className={styles.label}>{t('sidebar.workspace')}</div>
      {NAV.map(({ id, labelKey, Icon }) => (
        <NavItem
          key={id}
          icon={Icon}
          label={t(labelKey)}
          active={activeView === id}
          collapsed={collapsed}
          onClick={() => onSelect(id)}
        />
      ))}

      <div className={styles.label}>{t('sidebar.session')}</div>
      <NavItem
        icon={Globe}
        label={t('sidebar.localTraffic')}
        sub={sessionEndpoint}
        live={coreOnline}
        title={coreTitle}
        collapsed={collapsed}
      />

      <div className={styles.spring} />

      <NavItem
        icon={Settings}
        label={t('sidebar.settings')}
        active={activeView === 'settings'}
        collapsed={collapsed}
        onClick={() => onSelect('settings')}
      />
      <LanguageSwitcher lang={lang} collapsed={collapsed} onChange={onLangChange} />
      <ThemeSwitcher theme={theme} collapsed={collapsed} onChange={onThemeChange} />
    </aside>
  );
}
