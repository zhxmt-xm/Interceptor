import styles from './App.module.css';

import {
  CaretRightOutlined,
  CodeOutlined,
  DeleteOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  MoonOutlined,
  PauseOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  ConfigProvider,
  Input,
  Space,
  Typography,
} from 'antd';
import { startTransition, useEffect, useState } from 'react';

import appIconUrl from '../../../assets/interceptor-icon.png';
import type { CoreStatus } from '../../shared/desktop-api';
import {
  ToolIconButton,
  ToolSegmentedControl,
} from '../components/tool-controls';
import { TrafficWorkspace } from '../features/traffic/TrafficWorkspace';
import { createAppTheme, type ThemeMode } from '../theme/theme';

type Workspace = 'capture' | 'rules' | 'composer';

const initialCoreStatus: CoreStatus = {
  state: 'starting',
  pid: null,
  restartCount: 0,
  startedAt: null,
  lastHeartbeatAt: null,
  updatedAt: new Date(0).toISOString(),
  detail: 'Connecting to Proxy Core',
};

const workspaces: Array<{
  id: Workspace;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'capture', label: 'Traffic', icon: <GlobalOutlined /> },
  { id: 'rules', label: 'Rules', icon: <CodeOutlined /> },
  { id: 'composer', label: 'Composer', icon: <SendOutlined /> },
];

export function App(): React.JSX.Element {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const [workspace, setWorkspace] = useState<Workspace>('capture');
  const [coreStatus, setCoreStatus] = useState(initialCoreStatus);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem('interceptor.theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    let active = true;

    void window.interceptor
      .getCoreStatus()
      .then((status) => {
        if (active) {
          setCoreStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setCoreStatus((current) => ({
            ...current,
            state: 'unhealthy',
            detail: 'Proxy Core status unavailable',
            updatedAt: new Date().toISOString(),
          }));
        }
      });

    const unsubscribe = window.interceptor.onCoreStatusChange(setCoreStatus);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <ConfigProvider componentSize="small" theme={createAppTheme(themeMode)}>
      <AntApp className={styles.provider}>
        <div className={styles.shell}>
          <header className={styles.topbar} aria-label="Application toolbar">
            <div className={styles.brand} aria-label="Interceptor">
              <img className={styles.brandMark} src={appIconUrl} alt="" />
              <Typography.Text className={styles.brandName}>
                Interceptor
              </Typography.Text>
            </div>

            <div className={styles.captureControls} aria-label="Capture controls">
              <ToolIconButton
                label="Start capture"
                icon={<CaretRightOutlined />}
                disabled
              />
              <ToolIconButton
                label="Pause capture"
                icon={<PauseOutlined />}
                disabled
              />
              <ToolIconButton
                label="Clear sessions"
                icon={<DeleteOutlined />}
                disabled
              />
            </div>

            <div className={styles.trafficFilterTools} aria-label="Traffic filtering">
              <Input
                className={styles.globalFilter}
                disabled
                prefix={<SearchOutlined />}
                placeholder="Find host or URL"
                aria-label="Search captured traffic"
              />
              <ToolIconButton
                label="Traffic filters"
                icon={<FilterOutlined />}
                disabled
              />
            </div>

            <Space size={8} className={styles.topbarActions}>
              <ToolSegmentedControl<ThemeMode>
                label="Color theme"
                value={themeMode}
                onChange={(value) => {
                  startTransition(() => setThemeMode(value));
                }}
                options={[
                  {
                    value: 'light',
                    label: 'Light theme',
                    icon: <SunOutlined />,
                  },
                  {
                    value: 'dark',
                    label: 'Dark theme',
                    icon: <MoonOutlined />,
                  },
                ]}
              />
              <ToolIconButton
                label="Settings"
                icon={<SettingOutlined />}
                disabled
              />
            </Space>
          </header>

          <div className={styles.workspaceFrame}>
            <aside className={styles.sidebar}>
              <div>
                <div className={styles.sidebarSectionLabel}>Workspace</div>
                <nav className={styles.workspaceNav} aria-label="Workspaces">
                  {workspaces.map((item) => (
                    <button
                      className={styles.workspaceButton}
                      data-selected={workspace === item.id}
                      key={item.id}
                      onClick={() => setWorkspace(item.id)}
                      type="button"
                    >
                      <span className={styles.workspaceIcon} aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>

                <div
                  className={`${styles.sidebarSectionLabel} ${styles.sidebarSectionGap}`}
                >
                  Capture
                </div>
                <div className={styles.captureSource} aria-label="Local capture source">
                  <span className={styles.captureSourceIcon} aria-hidden="true">
                    <FolderOpenOutlined />
                  </span>
                  <span className={styles.captureSourceCopy}>
                    <span>Local traffic</span>
                    <code>127.0.0.1</code>
                  </span>
                  <span
                    className={styles.captureSourceDot}
                    data-state={coreStatus.state}
                    aria-hidden="true"
                  />
                </div>
              </div>

            </aside>

            <main className={styles.workspaceContent}>
              {workspace === 'capture' ? (
                <TrafficWorkspace />
              ) : (
                <WorkspacePlaceholder workspace={workspace} />
              )}
            </main>
          </div>

          <StatusBar status={coreStatus} />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

function WorkspacePlaceholder({
  workspace,
}: {
  workspace: Exclude<Workspace, 'capture'>;
}): React.JSX.Element {
  const title = workspace === 'rules' ? 'Rules' : 'Composer';
  const icon = workspace === 'rules' ? <CodeOutlined /> : <SendOutlined />;

  return (
    <section className={styles.placeholderWorkspace} aria-label={title}>
      <div className={styles.placeholderHeading}>
        <Typography.Text strong>{title}</Typography.Text>
      </div>
      <div className={styles.placeholderEmpty}>
        <span className={styles.placeholderIcon}>{icon}</span>
        <span>Empty</span>
      </div>
    </section>
  );
}

function StatusBar({ status }: { status: CoreStatus }): React.JSX.Element {
  const healthy = status.state === 'healthy';

  return (
    <footer className={styles.statusbar}>
      <div className={styles.statusGroup}>
        <span
          className={styles.statusDot}
          data-state={status.state}
          aria-hidden="true"
        />
        <span>Core {formatCoreState(status.state)}</span>
        {status.pid ? <code>PID {status.pid}</code> : null}
      </div>
      <div className={`${styles.statusGroup} ${styles.statusRight}`}>
        {status.restartCount > 0 ? (
          <span>Restarts {status.restartCount}</span>
        ) : null}
        <span>{healthy ? 'Local · 127.0.0.1' : status.detail ?? 'Initializing'}</span>
      </div>
    </footer>
  );
}

function readInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('interceptor.theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function formatCoreState(state: CoreStatus['state']): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}