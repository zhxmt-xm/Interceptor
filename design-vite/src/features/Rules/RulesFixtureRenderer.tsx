import type { ReactNode } from 'react';

import {
  FixtureRenderer,
  fixtureClassNames,
  type FixtureElementRenderer,
} from '../../fixtures/FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';
import { useDesignState } from '../../state/useDesignState';
import { BreakpointAction } from './BreakpointAction';

interface RulesFixtureRendererProps {
  readonly node: FixtureNode;
}

function hasClass(node: FixtureElementNode, className: string): boolean {
  return node.attributes.class?.split(/\s+/).includes(className) ?? false;
}

function fixtureText(node: FixtureNode): string {
  return node.type === 'text' ? node.value : node.children.map(fixtureText).join('');
}

export function RulesFixtureRenderer({ node }: RulesFixtureRendererProps): ReactNode {
  const { state } = useDesignState();
  const renderRulesElement: FixtureElementRenderer = (element, children) => {
    if (element.attributes['data-rule-id'] === 'token') return null;
    if (hasClass(element, 'vnote')) return null;
    if (state.ruleBreakpointAction && hasClass(element, 'acards')) {
      return <div className={fixtureClassNames('acards')}><BreakpointAction /></div>;
    }
    if (
      state.ruleBreakpointAction
      && hasClass(element, 'sh')
      && fixtureText(element).includes('Actions')
    ) {
      return <div className={fixtureClassNames('sh')}>Actions <span className={fixtureClassNames('c')}>1</span></div>;
    }
    if (hasClass(element, 'edhead')) {
      return (
        <div className={fixtureClassNames('edhead')} data-fixture-node="">
          {children}
          <button className={fixtureClassNames('btn pri sm')} disabled type="button">Save</button>
        </div>
      );
    }
    return undefined;
  };
  return <FixtureRenderer node={node} renderElement={renderRulesElement} />;
}