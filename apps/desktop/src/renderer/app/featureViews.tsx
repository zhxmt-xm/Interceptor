import type {
  CaptureExchangeSummary,
  RuleActionType,
} from '../../shared/desktop-api';
import { CaptureMain, CaptureStatusbar } from '../features/capture';
import { ComposerMain, ComposerStatusbar } from '../features/composer';
import { DiagnosticsMain, DiagnosticsStatusbar } from '../features/diagnostics';
import { GuidebookMain, GuidebookStatusbar } from '../features/guidebook';
import type { LanguageId } from '../i18n/languages';
import { RulesMain, RulesStatusbar } from '../features/rules';
import type { BreakpointScope } from '../features/rules/interfaces';
import { SettingsMain, SettingsStatusbar } from '../features/settings';
import type { TlsPassthroughNavigationTarget } from '../features/settings/interfaces';
import type { ThemeMode } from '../theme/theme';

import type { ViewId } from './Sidebar';

export interface FeatureViews {
  main: React.ReactNode;
  statusbar: React.ReactNode;
}

/** 跨 feature 的跳转动作，由 App 注入给需要联动的视图。 */
export interface FeatureActions {
  createRequestRule(
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ): void;
  createBreakpoint(
    summary: CaptureExchangeSummary,
    scope: BreakpointScope | 'custom',
    name: string,
  ): void;
  openRule(ruleId: string): void;
  openRules(): void;
  openUpstreamSettings(): void;
  showRuleRequests(ruleId: string): void;
  viewTlsPassthroughPattern(host: string): void;
}

/** 视图注册表：每个工作区提供主区与状态栏两块内容。 */
export const FEATURE_VIEWS: Record<
  ViewId,
  (
    settingsSection: string,
    onSettingsSectionChange: (section: string) => void,
    actions: FeatureActions,
    tlsPassthroughTarget: TlsPassthroughNavigationTarget | null,
    theme: ThemeMode,
    language: LanguageId,
  ) => FeatureViews
> = {
  capture: (_settingsSection, _onSettingsSectionChange, actions) => ({
    main: (
      <CaptureMain
        onCreateRequestRule={actions.createRequestRule}
        onCreateBreakpoint={actions.createBreakpoint}
        onOpenRule={actions.openRule}
        onOpenRules={actions.openRules}
        onViewTlsPassthroughPattern={actions.viewTlsPassthroughPattern}
      />
    ),
    statusbar: <CaptureStatusbar onOpenUpstreamSettings={actions.openUpstreamSettings} />,
  }),
  rules: (_settingsSection, _onSettingsSectionChange, actions) => ({
    main: <RulesMain onShowRuleRequests={actions.showRuleRequests} />,
    statusbar: <RulesStatusbar />,
  }),
  composer: () => ({
    main: <ComposerMain />,
    statusbar: <ComposerStatusbar />,
  }),
  settings: (settingsSection, onSettingsSectionChange, _actions, tlsPassthroughTarget) => ({
    main: (
      <SettingsMain
        section={settingsSection}
        onSectionChange={onSettingsSectionChange}
        tlsPassthroughTarget={tlsPassthroughTarget}
      />
    ),
    statusbar: <SettingsStatusbar />,
  }),
  diagnostics: () => ({
    main: <DiagnosticsMain />,
    statusbar: <DiagnosticsStatusbar />,
  }),
  guidebook: (
    _settingsSection,
    _onSettingsSectionChange,
    _actions,
    _tlsPassthroughTarget,
    theme,
    language,
  ) => ({
    main: <GuidebookMain theme={theme} language={language} />,
    statusbar: <GuidebookStatusbar />,
  }),
};
