import { App as AntApp, ConfigProvider, Tooltip } from 'antd';
import { Maximize2, Menu, Minus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeSummary,
  CoreProcessStatus,
  RuleActionType,
} from '../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../shared/automation-ids';
import type { LanguageId } from '../i18n/languages';
import { getLanguageDefinition, resolveLanguageId } from '../i18n/languages';
import { BreakpointsMain, BreakpointsStatusbar } from '../features/breakpoints';
import {
  CaptureMain,
  ProxyReadinessDialog,
  CaptureStatusbar,
  useCaptureData,
} from '../features/capture';
import { useCaptureStore } from '../features/capture/data/captureStore';
import { ComposerMain, ComposerStatusbar } from '../features/composer';
import {
  DiagnosticsMain,
  DiagnosticsProvider,
  DiagnosticsStatusbar,
} from '../features/diagnostics';
import {
  addRequestRuleDraft,
  RulesMain,
  RulesStatusbar,
  selectRuleDraft,
  useRulesData,
} from '../features/rules';
import {
  SettingsMain,
  SettingsStatusbar,
  UpdateActions,
  UpdateNotification,
} from '../features/settings';
import { createAppTheme, type ThemeMode } from '../theme/theme';
import styles from './App.module.css';
import { Sidebar, type ViewId } from './Sidebar';

interface FeatureViews {
  main: React.ReactNode;
  statusbar: React.ReactNode;
}

interface FeatureActions {
  createRequestRule(
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ): void;
  openRule(ruleId: string): void;
  showRuleRequests(ruleId: string): void;
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
  actions: FeatureActions,
): FeatureViews {
  switch (view) {
    case 'capture':
      return {
        main: (
          <CaptureMain
            onCreateRequestRule={actions.createRequestRule}
            onOpenRule={actions.openRule}
          />
        ),
        statusbar: <CaptureStatusbar coreStatus={coreStatus} />,
      };
    case 'rules':
      return {
        main: <RulesMain onShowRuleRequests={actions.showRuleRequests} />,
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
  useRulesData();
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

  const actions: FeatureActions = {
    createRequestRule: (summary, actionType, name) => {
      void (async () => {
        const detail = await window.interceptor.getExchangeDetail(summary.id).catch(() => null);
        const fallbackPath = summary.path?.startsWith('/')
          ? summary.path
          : `/${summary.path ?? ''}`;
        const url = detail?.url
          ?? `${summary.secure ? 'https' : 'http'}://${summary.host ?? ''}${fallbackPath}`;
        if (await addRequestRuleDraft(name, url, actionType)) {
          setView('rules');
        }
      })();
    },
    openRule: (ruleId) => {
      void selectRuleDraft(ruleId).then((selected) => {
        if (selected) {
          setView('rules');
        }
      });
    },
    showRuleRequests: (ruleId) => {
      useCaptureStore.getState().filterByRule(ruleId);
      setView('capture');
    },
  };
  const feature = renderView(view, settingsSection, coreStatus, actions);

  const content = (
    <div
      className={styles.app}
      data-collapsed={collapsed}
      data-automation-id={AUTOMATION_IDS.app.root}
    >
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
      <header className={styles.header}>
        <Tooltip title={t('capture.toggleSidebar')} mouseEnterDelay={0.4}>
          <button
            type="button"
            className={styles.sidebarToggle}
            aria-label={t('capture.toggleSidebar')}
            onClick={toggleCollapse}
            data-automation-id={AUTOMATION_IDS.shell.sidebarToggle}
          >
            <Menu size={15} strokeWidth={1.9} />
          </button>
        </Tooltip>
        <span className={styles.featureName} data-parity="window-header-title">
          {t(VIEW_LABEL_KEYS[view])}
        </span>
        <div className={styles.windowControls}>
          <Tooltip title={t('app.minimizeWindow')} mouseEnterDelay={0.4}>
            <button
              type="button"
              className={styles.windowControl}
              aria-label={t('app.minimizeWindow')}
              onClick={() => void window.interceptor.minimizeWindow()}
              data-automation-id={AUTOMATION_IDS.shell.window.minimize}
            >
              <Minus size={15} strokeWidth={1.9} />
            </button>
          </Tooltip>
          <Tooltip title={t('app.toggleMaximizeWindow')} mouseEnterDelay={0.4}>
            <button
              type="button"
              className={styles.windowControl}
              aria-label={t('app.toggleMaximizeWindow')}
              onClick={() => void window.interceptor.toggleMaximizeWindow()}
              data-automation-id={AUTOMATION_IDS.shell.window.maximizeRestore}
            >
              <Maximize2 size={14} strokeWidth={1.9} />
            </button>
          </Tooltip>
          <Tooltip title={t('capture.close')} mouseEnterDelay={0.4}>
            <button
              type="button"
              className={styles.windowClose}
              aria-label={t('capture.close')}
              onClick={() => {
                void window.interceptor.closeApplication().catch(() => window.close());
              }}
              data-automation-id={AUTOMATION_IDS.shell.window.close}
            >
              <X size={15} strokeWidth={1.9} />
            </button>
          </Tooltip>
        </div>
      </header>
      <div className={styles.notification}>
        <UpdateNotification />
      </div>
      <main className={styles.main} data-automation-id={AUTOMATION_IDS.app.main}>{feature.main}</main>
      <footer className={styles.footer} data-automation-id={AUTOMATION_IDS.app.statusbar}>{feature.statusbar}</footer>
    </div>
  );

  return (
    <ConfigProvider
      componentSize="small"
      direction="ltr"
      locale={languageDefinition.antdLocale}
      theme={createAppTheme(themeMode)}
    >
      <AntApp className={styles.antApp}>
        {view === 'diagnostics' ? (
          <DiagnosticsProvider>{content}</DiagnosticsProvider>
        ) : content}
        <ProxyReadinessDialog
          onOpenSettings={() => {
            setSettingsSection('proxy');
            setView('settings');
          }}
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
