import { useCallback, type ReactNode } from 'react';

import { KvValueDesign } from '../components/KvValueDesign/KvValueDesign';
import { CaptureCodePreview } from './CaptureCodePreview';
import styles from './FixtureDetailSection/FixtureDetailSection.module.css';
import { FixtureDetailSection } from './FixtureDetailSection/FixtureDetailSection';
import { FixtureRenderer, fixtureClassNames, type FixtureElementRenderer } from './FixtureRenderer';
import type { FixtureElementNode, FixtureNode } from './FixtureNode';

interface DetailFixtureRendererProps {
  readonly node: FixtureNode;
  readonly renderElement?: FixtureElementRenderer;
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
  if (hasClass(node, 'bpane') && node.attributes['data-pane'] === 'code') {
    return (
      <div className={fixtureClassNames('bpane')} data-pane="code" data-fixture-node="">
        <CaptureCodePreview>{children}</CaptureCodePreview>
      </div>
    );
  }
  const value = node.children[0];
  if (hasClass(node, 'v') && value?.type === 'element'
    && (hasClass(value, 'kv-value-text') || hasClass(value, 'rulefx-old'))
    && value.children.every((child) => child.type === 'text')) {
    const effect = node.children.find((child) => child.type === 'element' && hasClass(child, 'rulefx'));
    return <KvValueDesign value={textContent(value)} accent={hasClass(node, 'a') ? 'a' : hasClass(node, 'g') ? 'g' : undefined}
      inactive={hasClass(value, 'rulefx-old')}
      effect={effect?.type === 'element' ? { className: effect.attributes.class!, label: textContent(effect),
        link: Object.hasOwn(effect.attributes, 'data-rule-link') } : undefined} />;
  }
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

  const content = title === 'TLS tunnel'
    ? node.children.map((child, index) => <FixtureRenderer key={index} node={child} />)
    : children;

  return (
    <FixtureDetailSection
      grow={hasClass(node, 'grow')}
      labelExtra={labelExtra}
      title={title}
    >
      {content.filter((_, index) => (
        index !== headerIndex
        && (node.children[index]?.type !== 'text' || node.children[index].value.trim())
      )) as ReactNode[]}
    </FixtureDetailSection>
  );
};

export function DetailFixtureRenderer({ node, renderElement }: DetailFixtureRendererProps): React.JSX.Element {
  const render = useCallback<FixtureElementRenderer>((element, children) => {
    const custom = renderElement?.(element, children);
    return custom === undefined ? renderDetailSection(element, children) : custom;
  }, [renderElement]);
  return <FixtureRenderer node={node} renderElement={render} /> as React.JSX.Element;
}