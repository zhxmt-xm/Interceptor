import {
  ApiOutlined,
  BugOutlined,
  CaretRightOutlined,
  CodeOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  MoonOutlined,
  PauseOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Empty,
  Input,
  Segmented,
  Space,
  Splitter,
  Tooltip,
  Typography,
  theme as antTheme,
} from 'antd';
import { startTransition, useEffect, useState } from 'react';

import type { CoreStatus } from '../shared/desktop-api';

type ThemeMode = 'light' | 'dark';
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
  { id: 'capture', label: 'Capture', icon: <ThunderboltOutlined /> },
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

  const dark = themeMode === 'dark';

  return (
    <ConfigProvider
      componentSize="small"
      theme={{
        algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        cssVar: {
          prefix: 'interceptor',
        },
        token: {
          borderRadius: 5,
          colorPrimary: '#147d78',
          colorError: '#d64b45',
          colorWarning: '#c58b18',
          fontFamily: '"IBM Plex Sans Variable", sans-serif',
          fontFamilyCode: '"IBM Plex Mono", monospace',
          fontSize: 13,
          controlHeight: 30,
          motionDurationFast: '0.12s',
          motionDurationMid: '0.18s',
        },
        components: {
          Button: {
            borderRadius: 5,
          },
          Input: {
            activeShadow: '0 0 0 2px rgba(20, 125, 120, 0.12)',
          },
          Segmented: {
            borderRadius: 5,
          },
        },
      }}
    >
      <AntApp className="app-provider">
        <div className="app-shell">
          <header className="topbar">
            <div className="brand" aria-label="Interceptor">
              <div className="brand-mark" aria-hidden="true">
                <ApiOutlined />
              </div>
              <Typography.Text className="brand-name">
                Interceptor
              </Typography.Text>
            </div>

            <div className="capture-controls" aria-label="Capture controls">
              <Tooltip title="Start capture">
                <Button
                  className="record-button"
                  disabled
                  icon={<CaretRightOutlined />}
                  aria-label="Start capture"
                />
              </Tooltip>
              <Tooltip title="Pause capture">
                <Button disabled icon={<PauseOutlined />} aria-label="Pause capture" />
              </Tooltip>
              <Tooltip title="Clear sessions">
                <Button disabled icon={<DeleteOutlined />} aria-label="Clear sessions" />
              </Tooltip>
            </div>

            <Input
              className="global-filter"
              disabled
              prefix={<SearchOutlined />}
              placeholder="Filter sessions"
              aria-label="Filter sessions"
            />

            <Space size={6} className="topbar-actions">
              <Segmented<ThemeMode>
                aria-label="Color theme"
                value={themeMode}
                onChange={(value) => {
                  startTransition(() => setThemeMode(value));
                }}
                options={[
                  {
                    value: 'light',
                    label: (
                      <Tooltip title="Light theme">
                        <SunOutlined aria-label="Light theme" />
                      </Tooltip>
                    ),
                  },
                  {
                    value: 'dark',
                    label: (
                      <Tooltip title="Dark theme">
                        <MoonOutlined aria-label="Dark theme" />
                      </Tooltip>
                    ),
                  },
                ]}
              />
              <Tooltip title="Settings">
                <Button icon={<SettingOutlined />} aria-label="Settings" disabled />
              </Tooltip>
            </Space>
          </header>

          <div className="workspace-frame">
            <aside className="sidebar">
              <nav className="workspace-nav" aria-label="Workspaces">
                {workspaces.map((item) => (
                  <button
                    className="workspace-button"
                    data-selected={workspace === item.id}
                    key={item.id}
                    onClick={() => setWorkspace(item.id)}
                    type="button"
                  >
                    <span className="workspace-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="sidebar-foot">
                <div className="environment-label">Local workspace</div>
                <div className="listener-address">127.0.0.1</div>
              </div>
            </aside>

            <main className="workspace-content">
              {workspace === 'capture' ? (
                <CaptureWorkspace />
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

function CaptureWorkspace(): React.JSX.Element {
  return (
    <Splitter className="capture-splitter">
      <Splitter.Panel defaultSize="62%" min="380px">
        <section className="session-pane" aria-label="Sessions">
          <div className="pane-heading">
            <Typography.Text strong>Sessions</Typography.Text>
            <Typography.Text type="secondary">0</Typography.Text>
          </div>
          <div className="session-columns" aria-hidden="true">
            <span>Status</span>
            <span>Method</span>
            <span>Host</span>
            <span>Path</span>
            <span>Time</span>
          </div>
          <div className="empty-region">
            <Empty
              image={<FileSearchOutlined className="empty-icon" />}
              description="No sessions"
            />
          </div>
        </section>
      </Splitter.Panel>
      <Splitter.Panel min="300px">
        <section className="inspector-pane" aria-label="Inspector">
          <div className="pane-heading">
            <Typography.Text strong>Inspector</Typography.Text>
          </div>
          <div className="inspector-tabs" aria-hidden="true">
            <span data-selected="true">Overview</span>
            <span>Request</span>
            <span>Response</span>
            <span>Timing</span>
          </div>
          <div className="empty-region">
            <Empty
              image={<BugOutlined className="empty-icon" />}
              description="No selection"
            />
          </div>
        </section>
      </Splitter.Panel>
    </Splitter>
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
    <section className="placeholder-workspace" aria-label={title}>
      <div className="pane-heading">
        <Typography.Text strong>{title}</Typography.Text>
      </div>
      <div className="empty-region">
        <Empty image={<span className="empty-icon">{icon}</span>} description="Empty" />
      </div>
    </section>
  );
}

function StatusBar({ status }: { status: CoreStatus }): React.JSX.Element {
  const healthy = status.state === 'healthy';

  return (
    <footer className="statusbar">
      <div className="status-group">
        <span className="status-dot" data-state={status.state} aria-hidden="true" />
        <span>Core {formatCoreState(status.state)}</span>
        {status.pid ? <code>PID {status.pid}</code> : null}
      </div>
      <div className="status-group status-right">
        {status.restartCount > 0 ? (
          <span>Restarts {status.restartCount}</span>
        ) : null}
        <span>{healthy ? 'Loopback' : status.detail ?? 'Initializing'}</span>
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