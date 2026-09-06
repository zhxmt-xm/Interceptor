import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentSessionSnapshot } from '../../../../../shared/desktop-api';
import { Flyout, type FlyoutProps } from '../../../../components/Flyout/Flyout';
import { AgentPanelComposer } from '../../AgentPanelComposer/AgentPanelComposer';

const fixture = vi.hoisted(() => ({ open: true, setOpen: vi.fn(), setModel: vi.fn() }));

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  const react = {
    ...original,
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => initial === false ? [fixture.open, fixture.setOpen] : [initial, vi.fn()],
  };
  return { ...react, default: react };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../components', async () => ({
  Flyout: (await import('../../../../components/Flyout/Flyout')).Flyout,
  IconButton: () => null,
  Segmented: () => null,
}));
vi.mock('../../data/agentSessionStore', () => ({
  useAgentSessionStore: () => false,
  AgentSessionActions: { setModel: fixture.setModel },
}));

const session = {
  sessionId: 'chat-one',
  summary: { providerId: 'provider-one', modelId: 'model-one' },
  currentTurn: null,
} as AgentSessionSnapshot;

function findFlyout(node: ReactNode): ReactElement<FlyoutProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === Flyout) return child as ReactElement<FlyoutProps>;
    const nested = findFlyout(child.props.children);
    if (nested) return nested;
  }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.open = true;
});

describe('Agent模型菜单统一弹层', () => {
  it('让共享Flyout拥有模型按钮的定位和开关事件', () => {
    const flyout = findFlyout(AgentPanelComposer({ models: [], session, onConfigure: vi.fn() }));
    expect(flyout).toBeDefined();
    expect(flyout!.props).toMatchObject({ open: true, placement: 'topLeft' });
    const trigger = flyout!.props.children as ReactElement<Record<string, unknown>>;
    expect(trigger.props['data-parity']).toBe('agent-model-select');
    expect(trigger.props.onClick).toBeUndefined();
  });

  it('响应外部点击关闭而不更改Chat模型', () => {
    const flyout = findFlyout(AgentPanelComposer({ models: [], session, onConfigure: vi.fn() }));
    expect(flyout).toBeDefined();
    flyout!.props.onOpenChange(false);
    expect(fixture.setOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(fixture.setModel).not.toHaveBeenCalled();
  });

  it('关闭时卸载菜单内容，使重开后能重新聚焦当前选项', () => {
    fixture.open = false;
    const flyout = findFlyout(AgentPanelComposer({ models: [], session, onConfigure: vi.fn() }));
    expect(flyout).toBeDefined();
    expect(flyout!.props).toMatchObject({ open: false, destroyOnHidden: true });
    expect(isValidElement(flyout!.props.content)).toBe(true);
  });
});