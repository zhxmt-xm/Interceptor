import { createElement, type CSSProperties, type ReactNode } from 'react';

import { MonacoFixture, type MonacoFixturePreset } from '../components/MonacoFixture/MonacoFixture';
import styles from '../DesignApp/DesignApp.module.css';
import { FixtureIcon } from './FixtureIcon';
import type { FixtureElementNode, FixtureNode } from './FixtureNode';

export type FixtureElementRenderer = (
  node: FixtureElementNode,
  children: readonly ReactNode[],
) => ReactNode | undefined;

interface FixtureRendererProps {
  readonly node: FixtureNode;
  readonly renderElement?: FixtureElementRenderer;
}

const PROPERTY_BY_ATTRIBUTE: Readonly<Record<string, string>> = {
  class: 'className',
  colspan: 'colSpan',
  for: 'htmlFor',
  maxlength: 'maxLength',
  preserveaspectratio: 'preserveAspectRatio',
  readonly: 'readOnly',
  rowspan: 'rowSpan',
  tabindex: 'tabIndex',
  viewbox: 'viewBox',
};

const BOOLEAN_ATTRIBUTES = new Set([
  'disabled',
  'draggable',
  'multiple',
  'readonly',
  'required',
  'selected',
]);

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function mapClassNames(classNames: string): string {
  return [...new Set(classNames
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((className) => [styles[className] ?? className, className]))]
    .join(' ');
}

function toStyle(style: string): CSSProperties {
  return Object.fromEntries(
    style
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        const property = declaration.slice(0, separator).trim();
        const value = declaration.slice(separator + 1).trim();
        const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        return [camelCaseProperty, value];
      }),
  ) as CSSProperties;
}

function mapAttributes(
  tag: string,
  attributes: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [attribute, value] of Object.entries(attributes)) {
    if (attribute === 'class') {
      properties.className = mapClassNames(value);
    } else if (attribute === 'style') {
      properties.style = toStyle(value);
    } else if (attribute === 'value' && (tag === 'input' || tag === 'textarea')) {
      properties.defaultValue = value;
    } else if (attribute === 'checked') {
      properties.defaultChecked = true;
    } else if (BOOLEAN_ATTRIBUTES.has(attribute)) {
      properties[PROPERTY_BY_ATTRIBUTE[attribute] ?? attribute] = value !== 'false';
    } else {
      properties[PROPERTY_BY_ATTRIBUTE[attribute] ?? attribute] = value;
    }
  }
  return properties;
}

function textContent(node: FixtureNode): string {
  return node.type === 'text'
    ? node.value
    : node.children.map(textContent).join('');
}

function dedent(raw: string): string {
  const lines = raw.replace(/\t/g, '  ').split('\n');
  while (lines[0] !== undefined && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  const indent = Math.min(...lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^ */)?.[0].length ?? 0));
  return lines.map((line) => line.slice(indent)).join('\n');
}

function fixtureIconId(node: FixtureNode): string | undefined {
  if (node.type !== 'element' || node.tag !== 'svg' || node.children.length !== 1) return undefined;
  const use = node.children[0];
  if (!use || use.type !== 'element' || use.tag !== 'use') return undefined;
  const href = use.attributes.href;
  return href?.startsWith('#i-') ? href.slice(1) : undefined;
}

export function FixtureRenderer({ node, renderElement }: FixtureRendererProps): ReactNode {
  if (node.type === 'text') {
    return node.value;
  }

  const properties = mapAttributes(node.tag, node.attributes);
  const iconId = fixtureIconId(node);
  if (iconId) {
    return <FixtureIcon iconId={iconId} svgProps={properties} />;
  }
  const monacoPreset = node.attributes['data-monaco'] as MonacoFixturePreset | undefined;
  if (monacoPreset) {
    return (
      <MonacoFixture
        {...properties}
        language={node.attributes['data-lang'] ?? 'json'}
        preset={monacoPreset}
        source={dedent(textContent(node))}
      />
    );
  }

  const children = node.tag === 'textarea' || VOID_ELEMENTS.has(node.tag)
    ? undefined
    : node.children.map((child, index) => (
        <FixtureRenderer key={index} node={child} renderElement={renderElement} />
      ));
  const renderedElement = children ? renderElement?.(node, children) : undefined;
  if (renderedElement !== undefined) {
    return renderedElement;
  }
  return createElement(
    node.tag,
    { ...properties, 'data-fixture-node': '' },
    children,
  );
}

export function fixtureClassNames(...classNames: string[]): string {
  return mapClassNames(classNames.join(' '));
}