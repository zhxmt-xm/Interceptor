import { ChevronDown, Download, ExternalLink, Loader2 } from 'lucide-react';
import { Children, isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button, type ButtonProps } from '../../Button/Button';
import { IconButton } from '../../IconButton/IconButton';

function renderButton(props: ButtonProps) {
  const element = Button(props);
  if (!isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(element) || element.type !== 'button') {
    throw new Error('Expected the real native Button.');
  }
  return element;
}

describe('Button icon and label layout', () => {
  it.each([
    { text: 'Download', icon: Download },
    { text: 'Open', icon: ExternalLink },
  ])('gives $text its own centered label item beside the icon', ({ text, icon }) => {
    const element = renderButton({ children: text, icon, size: 'compact' });
    const children = Children.toArray(element.props.children);
    expect(children).toHaveLength(2);
    expect(isValidElement(children[0]) && children[0].type).toBe(icon);
    expect(isValidElement<{ 'aria-hidden': boolean }>(children[0]) && children[0].props['aria-hidden']).toBe(true);
    const label = children[1];
    expect(isValidElement(label) && label.type).toBe('span');
    if (!isValidElement<{ children: ReactNode; className: string }>(label)) {
      throw new Error('The label must be a styled flex item.');
    }
    expect(label.props.children).toBe(text);
    expect(label.props.className).toBeTruthy();
  });

  it('keeps the end icon after the label', () => {
    const children = Children.toArray(renderButton({ children: 'Open', icon: ExternalLink, iconPosition: 'end' }).props.children);
    expect(isValidElement(children.at(-1)) && (children.at(-1) as { type: unknown }).type).toBe(ExternalLink);
  });

  it('keeps loading disabled with one spinner and the original label', () => {
    const element = renderButton({ children: 'Download', icon: Download, loading: true });
    const children = Children.toArray(element.props.children);
    expect(element.props.disabled).toBe(true);
    expect(children).toHaveLength(2);
    expect(isValidElement(children[0]) && children[0].type).toBe(Loader2);
    expect(isValidElement<{ 'aria-hidden': boolean }>(children[0]) && children[0].props['aria-hidden']).toBe(true);
  });

  it.each(['md', 'compact', 'sm'] as const)('preserves native actions and accessible names for size %s', (size) => {
    const onClick = vi.fn();
    const element = renderButton({ children: 'Action', size, onClick, ariaLabel: 'Accessible action' });
    expect(element.props.type).toBe('button');
    expect(element.props.disabled).toBe(false);
    expect(element.props.onClick).toBe(onClick);
    expect(element.props['aria-label']).toBe('Accessible action');
  });
});

describe('IconButton sizes', () => {
  it.each([
    { size: 'md', iconSize: 18 },
    { size: 'sm', iconSize: 15 },
    { size: 'xs', iconSize: 13 },
  ] as const)('renders the $size icon without a caller style override', ({ size, iconSize }) => {
    const button = IconButton({ icon: ChevronDown, label: 'Collapse', tooltip: null, size });
    if (!isValidElement<{ children: ReactNode }>(button) || button.type !== 'button') {
      throw new Error('Expected a native icon button.');
    }
    const icon = Children.toArray(button.props.children)[0];
    expect(isValidElement<{ size: number }>(icon) && icon.props.size).toBe(iconSize);
  });
});