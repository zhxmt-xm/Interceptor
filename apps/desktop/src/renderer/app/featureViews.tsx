import type {
  CaptureExchangeSummary,
  RuleActionType,
} from '../../shared/desktop-api';
import { CaptureMain, CaptureStatusbar } from '../features/capture';
import { ComposerMain, ComposerStatusbar } from '../features/composer';
import { DiagnosticsMain, DiagnosticsStatusbar } from '../features/diagnostics';
import { RulesMain, RulesStatusbar } from '../features/rules';
import type { BreakpointScope } from '../features/rules/interfaces';
import { SettingsMain, SettingsStatusbar } from '../features/settings';

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
  showRuleRequests(ruleId: string): void;
}

/** 视图注册表：每个工作区提供主区与状态栏两块内容。 */
export const FEATURE_VIEWS: Record<
  ViewId,
  (settingsSection: string, actions: FeatureActions) => FeatureViews
> = {
  capture: (_settingsSection, actions) => ({
    main: (
      <CaptureMain
        onCreateRequestRule={actions.createRequestRule}
        onCreateBreakpoint={actions.createBreakpoint}
        onOpenRule={actions.openRule}
        onOpenRules={actions.openRules}
      />
    ),
    statusbar: <CaptureStatusbar />,
  }),
  rules: (_settingsSection, actions) => ({
    main: <RulesMain onShowRuleRequests={actions.showRuleRequests} />,
    statusbar: <RulesStatusbar />,
  }),
  composer: () => ({
    main: <ComposerMain />,
    statusbar: <ComposerStatusbar />,
  }),
  settings: (settingsSection) => ({
    main: <SettingsMain section={settingsSection} />,
    statusbar: <SettingsStatusbar />,
  }),
  diagnostics: () => ({
    main: <DiagnosticsMain />,
    statusbar: <DiagnosticsStatusbar />,
  }),
};
