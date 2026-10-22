import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';

export function findActionMenu(root: FixtureNode): FixtureElementNode {
  const nodes: FixtureNode[] = [root];
  for (const node of nodes) {
    if (node.type === 'text') continue;
    if (node.attributes.class?.split(/\s+/).includes('apop')) {
      return { ...node, attributes: { class: 'rulesActionMenuContent' } };
    }
    nodes.push(...node.children);
  }
  throw new Error('The Rules action menu fixture is missing.');
}
