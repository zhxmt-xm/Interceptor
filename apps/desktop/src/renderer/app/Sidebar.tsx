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

const NAV: Array<{ id: ViewId; label: string; Icon: LucideIcon }> = [
  { id: 'capture', label: 'Capture', Icon: Activity },
  { id: 'rules', label: 'Rules & Map', Icon: GitBranch },
  { id: 'composer', label: 'Composer', Icon: Send },
  { id: 'breakpoints', label: 'Breakpoints', Icon: Pause },
  { id: 'diagnostics', label: 'Diagnostics', Icon: Terminal },
];

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
  const coreOnline = coreStatus.state === 'running';
  const coreTitle = `Proxy Core ${coreStatus.state}${
    coreStatus.pid != null ? `, PID ${coreStatus.pid}` : ''
  }`;

  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.collapsed)}
      role="navigation"
      aria-label="Workspaces"
    >
      <div className={styles.brand}>
        <span className={styles.logo}>
          <Zap size={17} strokeWidth={2} />
        </span>
        <b className={styles.brandName}>Interceptor</b>
      </div>

      <div className={styles.label}>Workspace</div>
      {NAV.map(({ id, label, Icon }) => (
        <NavItem
          key={id}
          icon={Icon}
          label={label}
          active={activeView === id}
          collapsed={collapsed}
          onClick={() => onSelect(id)}
        />
      ))}

      <div className={styles.label}>Session</div>
      <NavItem
        icon={Globe}
        label="Local traffic"
        sub={sessionEndpoint}
        live={coreOnline}
        title={coreTitle}
        collapsed={collapsed}
      />

      <div className={styles.spring} />

      <NavItem
        icon={Settings}
        label="Settings"
        active={activeView === 'settings'}
        collapsed={collapsed}
        onClick={() => onSelect('settings')}
      />
      <LanguageSwitcher lang={lang} collapsed={collapsed} onChange={onLangChange} />
      <ThemeSwitcher theme={theme} collapsed={collapsed} onChange={onThemeChange} />
    </aside>
  );
}
