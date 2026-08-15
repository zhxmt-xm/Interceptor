import type { ReactNode } from 'react';

import {
  FixtureRenderer,
  fixtureClassNames,
  type FixtureElementRenderer,
} from '../../fixtures/FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';

interface RulesFixtureRendererProps {
  readonly node: FixtureNode;
}

function hasClass(node: FixtureElementNode, className: string): boolean {
  return node.attributes.class?.split(/\s+/).includes(className) ?? false;
}

function hasAttribute(node: FixtureNode, name: string, value: string): boolean {
  return node.type === 'element' && (
    node.attributes[name] === value
    || node.children.some((child) => hasAttribute(child, name, value))
  );
}

const renderRulesElement: FixtureElementRenderer = (node, children) => {
  if (node.attributes['data-rule-id'] === 'token') {
    return null;
  }
  if (hasClass(node, 'vnote')) {
    return null;
  }
  if (hasClass(node, 'icon-actions') && hasAttribute(node, 'aria-label', 'New rule')) {
    return null;
  }
  if (hasClass(node, 'edhead')) {
    return (
      <div className={fixtureClassNames('edhead')} data-fixture-node="">
        {children}
        <button className={fixtureClassNames('btn pri sm')} disabled type="button">Save</button>
      </div>
    );
  }
  return undefined;
};

export function RulesFixtureRenderer({ node }: RulesFixtureRendererProps): ReactNode {
  return <FixtureRenderer node={node} renderElement={renderRulesElement} />;
}