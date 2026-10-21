import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';

import { resources } from '../../../../i18n/resources';
import { AgentSessionUsage } from '../../AgentSessionUsage/AgentSessionUsage';

vi.mock('antd', () => ({ Progress: () => null }));

it('preserves the formatted context percentage and token counts', async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources, lng: 'en', fallbackLng: 'en', initAsync: false,
    keySeparator: false, interpolation: { escapeValue: false },
  });
  const markup = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance },
    createElement(AgentSessionUsage, {
      contextUsage: {
        contextWindowTokens: 1_000_000, currentContextTokens: 23_000,
        remainingContextTokens: 977_000, maxOutputTokens: 8192, source: 'provider',
      },
      usage: {
        modelCallCount: 2, inputTokens: 43_900, outputTokens: 3300, totalTokens: 47_200,
        cacheHitInputTokens: 32_100, cacheMissInputTokens: 11_800,
        cacheHitRate: 0.731, cacheMetricsCoverage: 1,
      },
    }),
  ));
  expect(markup).toContain('<code>2.3% · 23k / 1M</code>');
});
