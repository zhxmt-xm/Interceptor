import type { FixtureNode } from '../../fixtures/FixtureNode';

function nodeText(node: FixtureNode): string {
  return node.type === 'text' ? node.value : node.children.map(nodeText).join('');
}

function removeUpdatesSignIn(node: FixtureNode): FixtureNode | null {
  if (node.type === 'text') {
    const replacements: Readonly<Record<string, string>> = {
      'Uses your GitHub identity to check and download signed installers from the private release channel. Downloads start only when you choose.':
        'Stable releases from GitHub. Downloads start only when you choose.',
      'Newest private stable release available to this account': 'Newest stable release',
      'Private stable channel · authorized with your GitHub account': 'Stable release channel',
    };
    return { ...node, value: replacements[node.value] ?? node.value };
  }
  const classes = node.attributes.class?.split(/\s+/) ?? [];
  if (classes.includes('update-auth-required')
    || (classes.includes('sbadge') && nodeText(node).trim() === 'Private')
    || (classes.includes('sgroup') && node.children.some((child) => (
    child.type === 'element' && child.attributes.class === 'gh' && nodeText(child).trim() === 'GitHub access'
  )))) return null;
  const action = ['check', 'download', 'open'].find((value) => classes.includes(`update-${value}`));
  return { ...node, attributes: action ? { ...node.attributes, 'data-public-update-action': action } : node.attributes, children: node.children.flatMap((child) => {
    const result = removeUpdatesSignIn(child);
    return result ? [result] : [];
  }) };
}

export function previewUpdatesWithoutSignIn(node: FixtureNode): FixtureNode {
  if (node.type === 'text') return node;
  if (node.attributes['data-settings-panel'] === 'updates') return removeUpdatesSignIn(node)!;
  return { ...node, children: node.children.map(previewUpdatesWithoutSignIn) };
}