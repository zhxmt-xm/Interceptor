import { ShieldCheck, ShieldX, Waypoints } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  FixtureRenderer,
  fixtureClassNames,
  type FixtureElementRenderer,
} from '../../fixtures/FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';
import { useDesignState } from '../../state/useDesignState';
import styles from './SettingsFixtureRenderer.module.css';
import { AgentModelSettings } from './AgentModelSettings';
import { CaptureStorageProposal } from './CaptureStorageProposal';
import { UpstreamProxySettings } from '../UpstreamProxy/UpstreamProxySettings';

interface SettingsFixtureRendererProps {
  readonly node: FixtureNode;
}

function hasClass(node: FixtureElementNode, className: string): boolean {
  return node.attributes.class?.split(/\s+/).includes(className) ?? false;
}

function hasAttribute(node: FixtureNode, name: string): boolean {
  return node.type === 'element' && (
    name in node.attributes
    || node.children.some((child) => hasAttribute(child, name))
  );
}

export function SettingsFixtureRenderer({ node }: SettingsFixtureRendererProps): ReactNode {
  const { state, updateState } = useDesignState();
  const renderSettingsElement: FixtureElementRenderer = (element, children) => {
    if (element.attributes['data-settings-nav'] === 'proxy') {
      return <>
        <div className={fixtureClassNames('sni')} data-settings-nav="proxy">{children}</div>
        <button type="button" className={styles.upstreamNavigation} data-selected={state.settings === 'upstream'}
          data-design-upstream-navigation="" onClick={() => updateState({ settings: 'upstream' })}>
          <Waypoints size={16} aria-hidden="true" /><span>Upstream proxy</span>
        </button>
      </>;
    }
    if (
      element.attributes['data-tls-host-pattern']
      && element.attributes['data-tls-host-pattern'] === state.tlsPassthroughTargetPattern
    ) {
      return (
        <div
          className={[element.attributes.class, styles.tlsPassthroughHighlighted]
            .filter(Boolean)
            .join(' ')}
          data-highlighted="true"
          data-parity="tls-passthrough-target-row"
          data-tls-host-pattern={element.attributes['data-tls-host-pattern']}
        >
          {children}
        </div>
      );
    }
    if (hasClass(element, 'settings-toolbar') && hasAttribute(element, 'data-app-container-search')) {
      return (
        <div className={fixtureClassNames('settings-toolbar')} data-fixture-node="">
          {children}
          <button
            className={fixtureClassNames('btn sm danger')}
            type="button"
            disabled
            onClick={() => updateState({ overlay: 'app-container-disable-all' })}
          >
            <ShieldX aria-hidden="true" />
            Disable all
          </button>
          <button
            className={fixtureClassNames('btn sm')}
            type="button"
            onClick={() => updateState({ overlay: 'app-container-enable-all' })}
          >
            <ShieldCheck aria-hidden="true" />
            Enable all
          </button>
        </div>
      );
    }
    if (hasClass(element, 'scontent')) {
      if (state.settings === 'upstream') {
        return <div className={fixtureClassNames('scontent')} data-fixture-node="">
          {state.view === 'settings' ? <UpstreamProxySettings /> : null}
        </div>;
      }
      if (state.settings === 'storage') {
        return <div className={fixtureClassNames('scontent')} data-fixture-node="">
          <CaptureStorageProposal />
        </div>;
      }
      return (
        <div className={fixtureClassNames('scontent')} data-fixture-node="">
          {children}
          <AgentModelSettings />
        </div>
      );
    }
    return undefined;
  };

  return <FixtureRenderer node={node} renderElement={renderSettingsElement} />;
}