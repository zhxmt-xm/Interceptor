import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  FixtureRenderer,
  fixtureClassNames,
  type FixtureElementRenderer,
} from '../../fixtures/FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';
import { useDesignState } from '../../state/useDesignState';

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
  const { updateState } = useDesignState();
  const renderSettingsElement: FixtureElementRenderer = (element, children) => {
    if (hasClass(element, 'settings-toolbar') && hasAttribute(element, 'data-app-container-search')) {
      return (
        <div className={fixtureClassNames('settings-toolbar')} data-fixture-node="">
          {children}
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
    return undefined;
  };

  return <FixtureRenderer node={node} renderElement={renderSettingsElement} />;
}