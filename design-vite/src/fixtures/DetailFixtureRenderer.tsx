import type { ReactNode } from 'react';

import styles from './FixtureDetailSection/FixtureDetailSection.module.css';
import { FixtureDetailSection } from './FixtureDetailSection/FixtureDetailSection';
import { FixtureRenderer, type FixtureElementRenderer } from './FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from './FixtureNode';

interface DetailFixtureRendererProps {
  readonly node: FixtureNode;
}

function hasClass(node: FixtureElementNode, className: string): boolean {
  return node.attributes.class?.split(/\s+/).includes(className) ?? false;
}

function textContent(node: FixtureNode): string {
  return node.type === 'text'
    ? node.value
    : node.children.map(textContent).join('');
}

const renderDetailSection: FixtureElementRenderer = (node, children) => {
  if (!hasClass(node, 'sec')) {
    return undefined;
  }

  const headerIndex = node.children.findIndex(
    (child) => child.type === 'element' && hasClass(child, 'sh'),
  );
  const header = node.children[headerIndex];
  if (!header || header.type !== 'element') {
    return undefined;
  }

  const title = header.children
    .filter((child) => child.type === 'text')
    .map(textContent)
    .join('')
    .trim();
  if (!title) {
    return undefined;
  }

  const labelNodes = header.children.filter(
    (child) => child.type === 'element' && !hasClass(child, 'sh-chev'),
  );
  const labelExtra = labelNodes.length ? (
    <span className={styles.fixtureDetailSectionMeta}>
      {labelNodes.map((child, index) => (
        <FixtureRenderer key={index} node={child} renderElement={renderDetailSection} />
      ))}
    </span>
  ) : undefined;

  return (
    <FixtureDetailSection
      grow={hasClass(node, 'grow')}
      labelExtra={labelExtra}
      title={title}
    >
      {children.filter((_, index) => (
        index !== headerIndex
        && (node.children[index]?.type !== 'text' || node.children[index].value.trim())
      )) as ReactNode[]}
    </FixtureDetailSection>
  );
};

export function DetailFixtureRenderer({ node }: DetailFixtureRendererProps): React.JSX.Element {
  return <FixtureRenderer node={node} renderElement={renderDetailSection} /> as React.JSX.Element;
}