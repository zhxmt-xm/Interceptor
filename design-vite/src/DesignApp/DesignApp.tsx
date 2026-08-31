import { App as AntApp, ConfigProvider } from 'antd';
import { useMemo, useRef } from 'react';

import { FileTransferBusyOverlay } from '../components/FileTransferBusyOverlay/FileTransferBusyOverlay';
import { AgentPanelToggle } from '../features/Agent/AgentPanelToggle';
import { AgentSidePanel } from '../features/Agent/AgentSidePanel';
import { Composer } from '../features/Composer/Composer';
import { ComposerImportDialog } from '../features/Composer/ComposerImportDialog';
import { Capture } from '../features/Capture/Capture';
import { Diagnostics } from '../features/Diagnostics/Diagnostics';
import { Rules } from '../features/Rules/Rules';
import { RulesImportDialog } from '../features/Rules/RulesImportDialog';
import { RulesRootContextMenu } from '../features/Rules/RulesRootContextMenu';
import { Settings } from '../features/Settings/Settings';
import { AppContainerBulkDialog } from '../features/Settings/AppContainerBulkDialog';
import { AgentProviderDialog } from '../features/Settings/AgentProviderDialog';
import { AgentRemoveModelDialog } from '../features/Settings/AgentRemoveModelDialog';
import { McpClientConfirmationDialog } from '../features/Settings/McpClientConfirmationDialog';
import { McpClientDialog } from '../features/Settings/McpClientDialog';
import { McpToolApprovalDialog } from '../features/Settings/McpToolApprovalDialog';
import { FixtureRenderer, fixtureClassNames } from '../fixtures/FixtureRenderer';
import { useDesignFixtureAdapter } from '../fixtures/useDesignFixtureAdapter';
import { appAttributes } from '../fixtures/generated/appAttributes';
import { bootFixture } from '../fixtures/generated/bootFixture';
import { contextMenuFixtures } from '../fixtures/generated/contextMenuFixtures';
import { dockFixture } from '../fixtures/generated/dockFixture';
import { footerPopoverFixtures } from '../fixtures/generated/footerPopoverFixtures';
import { overlayFixtures } from '../fixtures/generated/overlayFixtures';
import { statusbarFixture } from '../fixtures/generated/statusbarFixture';
import { topbarFixture } from '../fixtures/generated/topbarFixture';
import { updateNoticeFixture } from '../fixtures/generated/updateNoticeFixture';
import { DesignStateProvider } from '../state/DesignStateProvider';
import { designRootAttributes, designRootClassName } from '../state/utils';
import { useDesignState } from '../state/useDesignState';
import { createDesignTheme } from '../theme/theme';
import { Sidebar } from './Sidebar';

function DesignAppContent(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const { state, updateState } = useDesignState();
  useDesignFixtureAdapter(rootRef, state, updateState);
  const messageConfig = useMemo(() => ({
    getContainer: () => rootRef.current ?? document.body,
    top: 10,
    styles: { list: { position: 'absolute' as const } },
  }), []);

  const { class: rootClasses = '', ...attributes } = appAttributes;
  return (
    <ConfigProvider componentSize="small" theme={createDesignTheme(state.theme)}>
      <AntApp component={false} message={messageConfig}>
        <div
          {...attributes}
          {...designRootAttributes(state)}
          ref={rootRef}
          className={fixtureClassNames(designRootClassName(state, rootClasses))}
        >
          <Sidebar />
          <FixtureRenderer node={topbarFixture} />
          <AgentPanelToggle />
          <div className={fixtureClassNames('mainhost')}>
            <Capture />
            <Rules />
            <Composer />
            <Settings />
            <Diagnostics />
          </div>
          <AgentSidePanel />
          <FixtureRenderer node={statusbarFixture} />
          {overlayFixtures.map((fixture, index) => <FixtureRenderer key={`overlay-${index}`} node={fixture} />)}
          <AppContainerBulkDialog />
          <AgentProviderDialog />
          <AgentRemoveModelDialog />
          <McpClientDialog />
          <McpClientConfirmationDialog />
          <McpToolApprovalDialog />
          <RulesImportDialog />
          <ComposerImportDialog />
          <FileTransferBusyOverlay />
          {contextMenuFixtures.map((fixture, index) => <FixtureRenderer key={`context-${index}`} node={fixture} />)}
          <RulesRootContextMenu />
          <FixtureRenderer node={bootFixture} />
          <FixtureRenderer node={updateNoticeFixture} />
          {footerPopoverFixtures.map((fixture, index) => <FixtureRenderer key={`footer-${index}`} node={fixture} />)}
        </div>
        <FixtureRenderer node={dockFixture} />
      </AntApp>
    </ConfigProvider>
  );
}

export function DesignApp(): React.JSX.Element {
  return <DesignStateProvider><DesignAppContent /></DesignStateProvider>;
}