import { App as AntApp, ConfigProvider } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CoreProcessStatus } from '../../shared/desktop-api';
import type { LanguageId } from '../i18n/languages';
import { getLanguageDefinition, resolveLanguageId } from '../i18n/languages';
import { BreakpointsMain, BreakpointsStatusbar } from '../features/breakpoints';
import {
  CaptureMain,
  ProxyReadinessDialog,
  CaptureStatusbar,
  useCaptureData,
} from '../features/capture';
import { ComposerMain, ComposerStatusbar } from '../features/composer';
import {
  DiagnosticsMain,
  DiagnosticsProvider,
  DiagnosticsStatusbar,
} from '../features/diagnostics';
import { RulesMain, RulesStatusbar } from '../features/rules';
import {
  SettingsMain,
  SettingsStatusbar,
  UpdateActions,
  UpdateNotification,
} from '../features/settings';
import { createAppTheme, type ThemeMode } from '../theme/theme';
import { AppShell } from './AppShell';
import styles from './App.module.css';
import { Sidebar, type ViewId } from './Sidebar';

interface FeatureViews {
  main: React.ReactNode;
  statusbar: React.ReactNode;
}

const VIEW_LABEL_KEYS: Record<ViewId, string> = {
  capture: 'sidebar.capture',
  rules: 'rules.title',
  composer: 'composer.title',
  breakpoints: 'breakpoints.title',
  diagnostics: 'diagnostics.title',
  settings: 'settings.title',
};

function renderView(
  view: ViewId,
  settingsSection: string,
  coreStatus: CoreProcessStatus,
): FeatureViews {
  switch (view) {
    case 'capture':
      return {
        main: <CaptureMain />,
        statusbar: <CaptureStatusbar coreStatus={coreStatus} />,
      };
    case 'rules':
      return {
        main: <RulesMain />,
        statusbar: <RulesStatusbar />,
      };
    case 'composer':
      return {
        main: <ComposerMain />,
        statusbar: <ComposerStatusbar />,
      };
    case 'settings':
      return {
        main: <SettingsMain section={settingsSection} />,
        statusbar: <SettingsStatusbar />,
      };
    case 'breakpoints':
      return {
        main: <BreakpointsMain />,
        statusbar: <BreakpointsStatusbar />,
      };
    case 'diagnostics':
      return {
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
  detail: '',
};

export function App(): React.JSX.Element {
  useCaptureData();
  const { i18n, t } = useTranslation();
  const [view, setView] = useState<ViewId>('capture');
  const [collapsed, setCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const [settingsSection, setSettingsSection] = useState('certificates');
  const [coreStatus, setCoreStatus] = useState<CoreProcessStatus>(() => ({
    ...initialCoreStatus,
    detail: t('app.connectingToCore'),
  }));
  const language = resolveLanguageId(i18n.resolvedLanguage ?? i18n.language);
  const languageDefinition = getLanguageDefinition(language);

  const toggleCollapse = (): void => setCollapsed((value) => !value);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem('interceptor.theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
    window.localStorage.setItem('interceptor.language', language);
    window.localStorage.removeItem('interceptor.lang');
    void window.interceptor.setUiLanguage(language).catch(() => undefined);
  }, [language]);

  useEffect(() => {
    setCoreStatus((current) =>
      current.updatedAt === initialCoreStatus.updatedAt
        ? { ...current, detail: t('app.connectingToCore') }
        : current,
    );
  }, [t]);

  useEffect(() => UpdateActions.subscribe(), []);

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
            detail: t('app.coreStatusUnavailable'),
            updatedAt: new Date().toISOString(),
          }));
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [t]);

  const changeLanguage = (nextLanguage: LanguageId): void => {
    void i18n.changeLanguage(nextLanguage);
  };

  const feature = renderView(view, settingsSection, coreStatus);

  const shell = (
    <>
      <AppShell
        collapsed={collapsed}
        sidebar={
          <Sidebar
            activeView={view}
            collapsed={collapsed}
            onSelect={setView}
            theme={themeMode}
            onThemeChange={setThemeMode}
            lang={language}
            onLangChange={changeLanguage}
            coreStatus={coreStatus}
          />
        }
        featureName={t(VIEW_LABEL_KEYS[view])}
        onToggleSidebar={toggleCollapse}
        notification={<UpdateNotification />}
        main={feature.main}
        statusbar={feature.statusbar}
      />
      <ProxyReadinessDialog
        onOpenSettings={() => {
          setSettingsSection('proxy');
          setView('settings');
        }}
      />
    </>
  );

  return (
    <ConfigProvider
      componentSize="small"
      direction="ltr"
      locale={languageDefinition.antdLocale}
      theme={createAppTheme(themeMode)}
    >
      <AntApp className={styles.antApp}>
        {view === 'diagnostics' ? <DiagnosticsProvider>{shell}</DiagnosticsProvider> : shell}
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
