import type { PopoverProps } from 'antd';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Flyout } from '../../Flyout';

const captured = vi.hoisted<{ props?: PopoverProps }>(() => ({}));

vi.mock('antd', () => ({
  Popover: (props: PopoverProps) => {
    captured.props = props;
    return createElement('span', null, props.children);
  },
}));

afterEach(() => {
  captured.props = undefined;
});

describe('Flyout Popover positioning', () => {
  it.each([
    'top', 'topLeft', 'topRight', 'bottom', 'bottomLeft', 'bottomRight',
    'left', 'leftTop', 'leftBottom', 'right', 'rightTop', 'rightBottom',
  ] as const)('delegates %s placement and dismissal to Ant Popover', placement => {
    const onOpenChange = vi.fn();
    const props = {
      open: true, placement, onOpenChange, content: 'Actions',
      children: createElement('button', null, 'Open'),
    };
    renderToString(createElement(Flyout, props));
    const styles = captured.props?.styles;
    if (!styles || typeof styles === 'function') throw new Error('Expected explicit Flyout styles');
    expect(styles.root).toBeUndefined();
    expect(captured.props?.align).toBeUndefined();
    expect(captured.props?.placement).toBe(placement);
    expect(captured.props?.autoAdjustOverflow).toBe(true);
    expect(captured.props?.onOpenChange).toBe(onOpenChange);
    expect(captured.props?.trigger).toBe('click');
  });

  it('preserves standard Popover typography and default placement', () => {
    renderToString(createElement(Flyout, {
      open: true, onOpenChange: vi.fn(), content: 'Settings',
      children: createElement('button', null, 'Open'),
    }));
    const styles = captured.props?.styles;
    if (!styles || typeof styles === 'function') throw new Error('Expected explicit Flyout styles');
    expect(styles.root).toBeUndefined();
    expect(styles.container?.lineHeight).toBeUndefined();
    expect(captured.props?.placement).toBe('bottomRight');
  });

  it('forwards the controlled open state and hidden-content lifecycle', () => {
    const onOpenChange = vi.fn();
    const props = {
      open: false, destroyOnHidden: true, onOpenChange, content: 'Rules',
      children: createElement('button', null, 'Open'),
    };
    renderToString(createElement(Flyout, props));
    expect(captured.props?.open).toBe(false);
    expect(captured.props?.destroyOnHidden).toBe(true);
    captured.props?.onOpenChange?.(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('keeps menu appearance configurable without custom positioning', () => {
    const props = {
      open: true, className: 'custom-menu', padding: 0,
      onOpenChange: vi.fn(), content: 'Export',
      children: createElement('button', null, 'Open'),
    };
    renderToString(createElement(Flyout, props));
    const styles = captured.props?.styles;
    if (!styles || typeof styles === 'function') throw new Error('Expected explicit Flyout styles');
    expect(styles.container?.padding).toBe(0);
    expect(captured.props?.classNames).toMatchObject({
      container: expect.stringContaining('custom-menu'),
    });
    expect(captured.props?.arrow).toBe(false);
  });
});
