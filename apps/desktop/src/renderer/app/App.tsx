import { App as AntApp, ConfigProvider } from 'antd';
import { useEffect, useState } from 'react';

import type { CoreProcessStatus } from '../../shared/desktop-api';
import type { LangId } from '../components';
import {
  BreakpointsMain,
  BreakpointsStatusbar,
  BreakpointsTopbar,
} from '../features/breakpoints';
import { CaptureMain, CaptureStatusbar, CaptureTopbar } from '../features/capture';
import { ComposerMain, ComposerStatusbar, ComposerTopbar } from '../features/composer';
import {
  DiagnosticsMain,
  DiagnosticsStatusbar,
  DiagnosticsTopbar,
} from '../features/diagnostics';
import { RulesMain, RulesStatusbar, RulesTopbar } from '../features/rules';
import { SettingsMain, SettingsStatusbar, SettingsTopbar } from '../features/settings';
import { createAppTheme, type ThemeMode } from '../theme/theme';
import { AppShell } from './AppShell';
import styles from './App.module.css';
import { Sidebar, type ViewId } from './Sidebar';

interface FeatureViews {
  topbar: React.ReactNode;
  main: React.ReactNode;
  statusbar: React.ReactNode;
}

function renderView(view: ViewId, onMenu: () => void): FeatureViews {
  switch (view) {
    case 'capture':
      return {
        topbar: <CaptureTopbar onMenu={onMenu} />,
        main: <CaptureMain />,
        statusbar: <CaptureStatusbar />,
      };
    case 'rules':
      return {
        topbar: <RulesTopbar onMenu={onMenu} />,
        main: <RulesMain />,
        statusbar: <RulesStatusbar />,
      };
    case 'composer':
      return {
        topbar: <ComposerTopbar onMenu={onMenu} />,
        main: <ComposerMain />,
        statusbar: <ComposerStatusbar />,
      };
    case 'settings':
      return {
        topbar: <SettingsTopbar onMenu={onMenu} />,
        main: <SettingsMain />,
        statusbar: <SettingsStatusbar />,
      };
    case 'breakpoints':
      return {
        topbar: <BreakpointsTopbar onMenu={onMenu} />,
        main: <BreakpointsMain />,
        statusbar: <BreakpointsStatusbar />,
      };
    case 'diagnostics':
      return {
        topbar: <DiagnosticsTopbar onMenu={onMenu} />,
        main: <DiagnosticsMain />,
        statusbar: <DiagnosticsStatusbar />,
      };
  }
}

const initialCoreStatus: CoreProcessStatus = {
  state: 'starting',
  pid: null,
  restartCount: 0,
  startedAt: null,
  lastHeartbeatAt: null,
  updatedAt: new Date(0).toISOString(),
  detail: 'Connecting to Proxy Core',
};

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewId>('capture');
  const [collapsed, setCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const [lang, setLang] = useState<LangId>(readInitialLang);
  const [coreStatus, setCoreStatus] = useState(initialCoreStatus);

  const toggleCollapse = (): void => setCollapsed((value) => !value);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem('interceptor.theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem('interceptor.lang', lang);
  }, [lang]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    // Dev-only hooks so the parity harness can drive the same state the
    // design SPA exposes via window.__setState.
    const devWindow = window as Window & {
      __setTheme?: (mode: ThemeMode) => void;
      __setView?: (view: ViewId) => void;
    };
    devWindow.__setTheme = setThemeMode;
    devWindow.__setView = setView;
  }, []);

  useEffect(() => {
    let active = true;
    let latestUpdatedAt = initialCoreStatus.updatedAt;

    const applyStatus = (next: CoreProcessStatus): void => {
      if (!active || next.updatedAt < latestUpdatedAt) {
        return;
      }
      latestUpdatedAt = next.updatedAt;
      setCoreStatus(next);
    };

    const unsubscribe = window.interceptor?.onCoreProcessStatusChange(applyStatus);

    void window.interceptor
      ?.getCoreProcessStatus()
      .then(applyStatus)
      .catch(() => {
        if (active && latestUpdatedAt === initialCoreStatus.updatedAt) {
          setCoreStatus((current) => ({
            ...current,
            state: 'unresponsive',
            detail: 'Proxy Core status unavailable',
            updatedAt: new Date().toISOString(),
          }));
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const feature = renderView(view, toggleCollapse);

  return (
    <ConfigProvider componentSize="small" theme={createAppTheme(themeMode)}>
      <AntApp className={styles.antApp}>
        <AppShell
          collapsed={collapsed}
          sidebar={
            <Sidebar
              activeView={view}
              collapsed={collapsed}
              onSelect={setView}
              theme={themeMode}
              onThemeChange={setThemeMode}
              lang={lang}
              onLangChange={setLang}
              coreStatus={coreStatus}
            />
          }
          topbar={feature.topbar}
          main={feature.main}
          statusbar={feature.statusbar}
        />
      </AntApp>
    </ConfigProvider>
  );
}

function readInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('interceptor.theme');
  if (stored === 'light' || stored === 'dark' || stored === 'warm' || stored === 'ember') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readInitialLang(): LangId {
  const stored = window.localStorage.getItem('interceptor.lang');
  if (stored === 'en' || stored === 'zh' || stored === 'ja' || stored === 'de') {
    return stored;
  }
  return 'en';
}
