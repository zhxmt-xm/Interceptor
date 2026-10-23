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
import { AcceptancePlayground } from '../features/Playground/AcceptancePlayground';
import { HomepageGuidePreview } from '../features/HomepageGuidePreview/HomepageGuidePreview';
import { AndroidPreview } from '../features/AndroidPreview/AndroidPreview';
import { AndroidDeviceDialog } from '../features/AndroidPreview/AndroidDeviceDialog';
import { AndroidPreviewControls } from '../features/AndroidPreview/AndroidPreviewControls';
import { Settings } from '../features/Settings/Settings';
import { AppContainerBulkDialog } from '../features/Settings/AppContainerBulkDialog';
import { AgentProviderDialog } from '../features/Settings/AgentProviderDialog';
import { AgentRemoveModelDialog } from '../features/Settings/AgentRemoveModelDialog';
import { McpClientConfirmationDialog } from '../features/Settings/McpClientConfirmationDialog';
import { McpClientDialog } from '../features/Settings/McpClientDialog';
import { McpToolApprovalDialog } from '../features/Settings/McpToolApprovalDialog';
import { FixtureRenderer, fixtureClassNames, type FixtureElementRenderer } from '../fixtures/FixtureRenderer';
import { UpstreamProxyStatus } from '../features/UpstreamProxy/UpstreamProxyStatus';
import { useUpstreamProposal } from '../features/UpstreamProxy/useUpstreamProposal';
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
  useUpstreamProposal();
  useDesignFixtureAdapter(rootRef, state, updateState);
  const renderStatusbarElement: FixtureElementRenderer = element => (
    element.attributes.class?.split(/\s+/).includes('capture-upstream')
      ? (state.view === 'capture' ? <UpstreamProxyStatus /> : null) : undefined
  );
  const messageConfig = useMemo(() => ({
    getContainer: () => rootRef.current ?? document.body,
    styles: { list: { position: 'absolute' as const } },
  }), []);

  const { class: rootClasses = '', ...attributes } = appAttributes;
  return (
    <ConfigProvider componentSize="small" theme={createDesignTheme(state.theme)}>
      <AntApp component={false} message={messageConfig}>
        <div
          {...attributes}
          {...designRootAttributes(state)}
          data-homepage-guide={state.homepageGuidePreview ? 'open' : undefined}
          ref={rootRef}
          className={fixtureClassNames(designRootClassName(state, rootClasses))}
        >
          {state.androidPreview ? <AndroidPreview /> : state.homepageGuidePreview ? <HomepageGuidePreview /> : state.view === 'playground' ? <AcceptancePlayground /> : (
            <>
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
              <FixtureRenderer node={statusbarFixture} renderElement={renderStatusbarElement} />
              <AndroidDeviceDialog />
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
            </>
          )}
        </div>
        {state.view === 'playground' ? null : <FixtureRenderer node={dockFixture} />}
        <AndroidPreviewControls />
      </AntApp>
    </ConfigProvider>
  );
}

export function DesignApp(): React.JSX.Element {
  return <DesignStateProvider><DesignAppContent /></DesignStateProvider>;
}