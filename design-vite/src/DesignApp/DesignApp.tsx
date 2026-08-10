import { useRef } from 'react';

import { Composer } from '../features/Composer/Composer';
import { Capture } from '../features/Capture/Capture';
import { Diagnostics } from '../features/Diagnostics/Diagnostics';
import { Rules } from '../features/Rules/Rules';
import { Settings } from '../features/Settings/Settings';
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
import { Sidebar } from './Sidebar';

function DesignAppContent(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const { state, updateState } = useDesignState();
  useDesignFixtureAdapter(rootRef, state, updateState);

  const { class: rootClasses = '', ...attributes } = appAttributes;
  return (
    <>
      <div
        {...attributes}
        {...designRootAttributes(state)}
        ref={rootRef}
        className={fixtureClassNames(designRootClassName(state, rootClasses))}
        data-ui="app"
      >
        <Sidebar />
        <FixtureRenderer node={topbarFixture} />
        <div className={fixtureClassNames('mainhost')}>
          <Capture />
          <Rules />
          <Composer />
          <Settings />
          <Diagnostics />
        </div>
        <FixtureRenderer node={statusbarFixture} />
        {overlayFixtures.map((fixture, index) => <FixtureRenderer key={`overlay-${index}`} node={fixture} />)}
        {contextMenuFixtures.map((fixture, index) => <FixtureRenderer key={`context-${index}`} node={fixture} />)}
        <FixtureRenderer node={bootFixture} />
        <FixtureRenderer node={updateNoticeFixture} />
        {footerPopoverFixtures.map((fixture, index) => <FixtureRenderer key={`footer-${index}`} node={fixture} />)}
      </div>
      <FixtureRenderer node={dockFixture} />
    </>
  );
}

export function DesignApp(): React.JSX.Element {
  return <DesignStateProvider><DesignAppContent /></DesignStateProvider>;
}