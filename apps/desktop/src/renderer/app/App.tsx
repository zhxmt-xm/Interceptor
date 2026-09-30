import { App as AntApp, ConfigProvider, Tooltip } from 'antd';
import { Menu } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeSummary,
  CoreProcessStatus,
  RuleActionType,
} from '../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../shared/automation-ids';
import type { LanguageId } from '../i18n/languages';
import { getLanguageDefinition, resolveLanguageId } from '../i18n/languages';
import { useBreakpoints, useBreakpointsStore } from '../features/breakpoints';
import {
  CaptureMain,
  ProxyReadinessDialog,
  CaptureStatusbar,
  useCaptureData,
} from '../features/capture';
import { useCaptureStore } from '../features/capture/data/captureStore';
import {
  ComposerMain,
  ComposerStatusbar,
  CollectionImportDialog,
  useCollection,
} from '../features/composer';
import {
  DiagnosticsMain,
  DiagnosticsProvider,
  DiagnosticsStatusbar,
} from '../features/diagnostics';
import { AgentPanelToggle, AgentSidePanel } from '../features/agent';
import { AgentModelsActions } from '../features/agent/data/agentModelsStore';
import { AgentSessionActions } from '../features/agent/data/agentSessionStore';
import {
  addBreakpointRule,
  addRequestRuleDraft,
  RulesMain,
  RulesImportDialog,
  RulesStatusbar,
  selectRuleDraft,
  useRulesData,
} from '../features/rules';
import {
  McpSettingsActions,
  McpToolApprovalDialog,
  SettingsMain,
  SettingsStatusbar,
  TlsCompatibilityDialog,
  TlsCompatibilityActions,
  UpdateActions,
  UpdateNotification,
} from '../features/settings';
import type { TlsPassthroughNavigationTarget } from '../features/settings/interfaces';
import { tlsPassthroughCoveringPattern } from '../features/settings/utils';
import { UiPreferencesActions } from '../features/settings/data/uiPreferencesActions';
import { createAppTheme, type ThemeMode } from '../theme/theme';
import { WindowControls } from '../components/WindowControls/WindowControls';
import styles from './App.module.css';
import { BreakpointCreatedMessage } from './BreakpointCreatedMessage/BreakpointCreatedMessage';
import { PlatformOperationMessage } from './PlatformOperationMessage/PlatformOperationMessage';
import { BootScreen } from './BootScreen/BootScreen';
import { useBootStore } from './bootStore';
import { FEATURE_VIEWS, type FeatureActions } from './featureViews';
import { readInitialTheme } from './utils';
import { Sidebar, type ViewId } from './Sidebar';

const VIEW_LABEL_KEYS: Record<ViewId, string> = {
  capture: 'sidebar.capture',
  rules: 'rules.title',
  composer: 'composer.title',
  diagnostics: 'diagnostics.title',
  settings: 'settings.title',
};

const initialCoreStatus: CoreProcessStatus = {
  state: 'starting',
  pid: null,
  restartCount: 0,
  startedAt: null,
  lastHeartbeatAt: null,
  updatedAt: new Date(0).toISOString(),
  detail: '',
};

/** 取该 exchange 的完整 URL；详情拿不到时用摘要拼一个可用的。 */
async function resolveExchangeUrl(summary: CaptureExchangeSummary): Promise<string> {
  const detail = await window.interceptor.getExchangeDetail(summary.id).catch(() => null);
  const fallbackPath = summary.path?.startsWith('/')
    ? summary.path
    : `/${summary.path ?? ''}`;
  return detail?.url
    ?? `${summary.secure ? 'https' : 'http'}://${summary.host ?? ''}${fallbackPath}`;
}

export function App(): React.JSX.Element {
  const booting = useBootStore((state) => !state.dismissed);
  useCaptureData();
  useRulesData();
  useBreakpoints();
  useCollection(!booting);
  const { i18n, t } = useTranslation();
  const [view, setView] = useState<ViewId>('capture');
  const [collapsed, setCollapsed] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const [settingsSection, setSettingsSection] = useState('certificates');
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [tlsPassthroughTarget, setTlsPassthroughTarget] =
    useState<TlsPassthroughNavigationTarget | null>(null);
  const [createdBreakpointRuleId, setCreatedBreakpointRuleId] = useState<string | null>(null);
  const [coreStatus, setCoreStatus] = useState<CoreProcessStatus>(() => ({
    ...initialCoreStatus,
    detail: t('app.connectingToCore'),
  }));
  const language = resolveLanguageId(i18n.resolvedLanguage ?? i18n.language);
  const languageDefinition = getLanguageDefinition(language);
  // The boot screen owns startup feedback, so the readiness dialog stays out of its way.
  const toggleCollapse = (): void => setCollapsed((value) => !value);
  const toggleAgentPanel = (): void => setAgentPanelOpen((value) => !value);
  const openAgentSettings = (): void => {
    setSettingsSection('agent');
    setView('settings');
  };
  const dismissBreakpointCreatedMessage = useCallback(
    (ruleId: string) => setCreatedBreakpointRuleId(
      (currentRuleId) => currentRuleId === ruleId ? null : currentRuleId,
    ),
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
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
  useEffect(() => new UiPreferencesActions(setThemeMode).subscribe(), []);
  useEffect(() => TlsCompatibilityActions.subscribe(), []);
  useEffect(() => McpSettingsActions.subscribe(), []);
  useEffect(() => {
    void AgentModelsActions.load().catch(() => undefined);
  }, []);
  useEffect(() => AgentSessionActions.subscribe(), []);

  useEffect(() => {
    if (!tlsPassthroughTarget) return undefined;
    const timer = window.setTimeout(() => setTlsPassthroughTarget(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [tlsPassthroughTarget]);

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
    void window.interceptor.setUiLanguage(nextLanguage).catch(() => undefined);
  };

  const changeTheme = (nextTheme: ThemeMode): void => {
    void window.interceptor.setUiTheme(nextTheme).catch(() => undefined);
  };

  const actions: FeatureActions = {
    createRequestRule: (summary, actionType, name) => {
      void (async () => {
        if (await addRequestRuleDraft(name, await resolveExchangeUrl(summary), actionType)) {
          setView('rules');
        }
      })();
    },
    createBreakpoint: (summary, scope, name) => {
      void (async () => {
        const url = await resolveExchangeUrl(summary);
        // Custom 要的是 method 限定、多条件与超时策略，那只有完整编辑器能表达。
        if (scope === 'custom') {
          if (await addRequestRuleDraft(name, url, 'breakpoint')) {
            setView('rules');
          }
          return;
        }
        const ruleId = await addBreakpointRule(name, url, scope);
        if (ruleId !== null) {
          setCreatedBreakpointRuleId(ruleId);
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
    openRules: () => setView('rules'),
    showRuleRequests: (ruleId) => {
      useCaptureStore.getState().filterByRule(ruleId);
      setView('capture');
    },
    viewTlsPassthroughPattern: (host) => {
      void window.interceptor.getTlsPassthroughSettings()
        .then((settings) => {
          const pattern = tlsPassthroughCoveringPattern(host, settings.hosts);
          setTlsPassthroughTarget((current) => pattern ? {
            host,
            pattern,
            sequence: (current?.sequence ?? 0) + 1,
          } : null);
        })
        .catch(() => setTlsPassthroughTarget(null))
        .finally(() => {
          setSettingsSection('tls-passthrough');
          setView('settings');
        });
    },
  };
  const feature = FEATURE_VIEWS[view](
    settingsSection,
    setSettingsSection,
    actions,
    tlsPassthroughTarget,
  );

  const content = (
    <div
      className={styles.app}
      data-agent-panel={agentPanelOpen ? 'open' : 'closed'}
      data-collapsed={collapsed}
      data-automation-id={AUTOMATION_IDS.app.root}
    >
      <Sidebar
        activeView={view}
        collapsed={collapsed}
        onSelect={setView}
        theme={themeMode}
        onThemeChange={changeTheme}
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
        <AgentPanelToggle open={agentPanelOpen} onToggle={toggleAgentPanel} />
        <WindowControls />
      </header>
      <div className={styles.notification}>
        <UpdateNotification />
      </div>
      <main className={styles.main} data-automation-id={AUTOMATION_IDS.app.main}>{feature.main}</main>
      {agentPanelOpen && (
        <AgentSidePanel
          onClose={() => setAgentPanelOpen(false)}
          onConfigure={openAgentSettings}
        />
      )}
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
        {booting ? null : (
          <ProxyReadinessDialog
            onOpenSettings={() => {
              setSettingsSection('proxy');
              setView('settings');
            }}
          />
        )}
        <TlsCompatibilityDialog
          onOpenSettings={() => {
            setTlsPassthroughTarget(null);
            setSettingsSection('tls-passthrough');
            setView('settings');
          }}
        />
        <McpToolApprovalDialog />
        <PlatformOperationMessage />
        <RulesImportDialog />
        <CollectionImportDialog />
        <BreakpointCreatedMessage
          ruleId={createdBreakpointRuleId}
          onDismiss={dismissBreakpointCreatedMessage}
        />
        <BootScreen onOpenDiagnostics={() => setView('diagnostics')} />
      </AntApp>
    </ConfigProvider>
  );
}
