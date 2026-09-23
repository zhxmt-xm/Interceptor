import i18next from 'i18next';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { resources } from '../../../../i18n/resources';
import { HttpsConnectionChain } from '../../HttpsDecryptionDialog/HttpsConnectionChain';
import { HttpsDecryptionDialog } from '../../HttpsDecryptionDialog/HttpsDecryptionDialog';

vi.mock('antd', () => ({
  Modal: ({ open, children, transitionName }: { open: boolean; children: ReactNode; transitionName?: string }) => (
    open ? createElement('section', { role: 'dialog', 'data-transition': transitionName ?? 'default' }, children) : null
  ),
}));
vi.mock('../../../../components', () => ({
  Button: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  IconButton: () => null,
  StatusBadge: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  cx: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

async function renderDialog(open: boolean): Promise<string> {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', fallbackLng: 'en', resources });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(HttpsDecryptionDialog, { open, onClose: () => undefined }),
  ));
}

describe('HTTPS setup connection diagram', () => {
  it('opens at its final centered position without click-origin zoom', async () => {
    expect(await renderDialog(true)).toContain('data-transition=""');
  });

  it('shows the client, Interceptor and Internet route before certificate actions', async () => {
    const html = await renderDialog(true);
    expect(html).toContain('Client apps');
    expect(html).toContain('Interceptor');
    expect(html).toContain('Internet');
    expect(html.indexOf('Client apps')).toBeLessThan(html.indexOf('Root Certificate Authority'));
  });

  it('does not render the connection diagram when the dialog is closed', async () => {
    expect(await renderDialog(false)).toBe('');
  });

  it.each([false, true])('reflects the effective decryption state %s without actions', async (decrypting) => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', fallbackLng: 'en', resources });
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n },
      createElement(HttpsConnectionChain, { decrypting }),
    ));
    expect(html).toContain(`data-decrypting="${decrypting}"`);
    expect(html).toContain(decrypting ? 'class="lucide lucide-lock"' : 'class="lucide lucide-lock-open"');
    expect(html).not.toContain('<button');
    expect(html).toContain('Client apps');
    expect(html).toContain('Internet');
  });
});