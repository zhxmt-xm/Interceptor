import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ButtonProps } from '../../../../components/Button/Button';
import type { IconButtonProps } from '../../../../components/IconButton/IconButton';
import { StoragePanel } from '../../SettingsContent/StoragePanel';
import { SettingsRow } from '../../SettingsContent/SettingsRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));

vi.mock('../../../../components', async () => {
  const { createElement: element } = await import('react');
  return {
    Button: (props: ButtonProps) => element('button', {
      'data-automation-id': props.automationId, disabled: props.disabled,
    }, props.children),
    IconButton: (props: IconButtonProps) => element('button', {
      'data-automation-id': props.automationId, 'aria-label': props.label, disabled: props.disabled,
    }),
    StatusBadge: ({ children }: { children: ReactNode }) => element('span', null, children),
  };
});

describe('Storage panel presentation', () => {
  it('shows one body usage measure instead of database and disk totals', () => {
    const markup = renderToStaticMarkup(createElement(StoragePanel));

    expect(markup).toContain('settings.capturedBodyData');
    expect(markup).toContain('settings.capturedBodyDataHint');
    expect(markup).not.toContain('settings.captureDatabase');
    expect(markup).not.toContain('settings.responseBodies');
    expect(markup).not.toContain('settings.totalOnDisk');
    expect(markup).toContain('settings.sessions');
    expect(markup).toContain('settings.exchanges');
    expect(markup).toContain('settings.storedBodies');
  });

  it('places the refresh command in the heading and disables it while loading', () => {
    const markup = renderToStaticMarkup(createElement(StoragePanel));

    expect(markup).toMatch(/<header\b[^>]*>[\s\S]*data-automation-id="settings.storage.refresh"[^>]*disabled=""[\s\S]*?<\/header>/);
    expect(markup).not.toContain('settings.refreshUsage');
  });

  it('explains the shared Capture clear action and exposes its public control', () => {
    const markup = renderToStaticMarkup(createElement(StoragePanel));

    expect(markup).toContain('settings.clearCapturedDataHint');
    expect(markup).toContain('settings.clearCaptureEffectsHint');
    expect(markup).toContain('data-automation-id="settings.storage.clear"');
  });

  it('preserves the shared row while rendering an optional second hint', () => {
    const normal = renderToStaticMarkup(createElement(SettingsRow, {
      label: 'Existing setting', hint: 'Existing hint', children: 'Existing value',
    }));
    expect(normal).toContain('<b>Existing setting</b><span>Existing hint</span>');
    expect(normal).toContain('Existing value');
    const extended = renderToStaticMarkup(createElement(SettingsRow, {
      label: 'Clear capture', hint: 'Same operation', additionalHint: 'Saved files stay',
      className: 'capture-only', children: 'Clear',
    }));
    expect(extended).toContain('capture-only');
    expect(extended).toContain('<span>Same operation</span><span>Saved files stay</span>');
  });
});