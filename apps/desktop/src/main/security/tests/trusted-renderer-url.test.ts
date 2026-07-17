import { describe, expect, it } from 'vitest';

import { isTrustedRendererUrl } from '../trusted-renderer-url';

const packagedRendererUrl = 'interceptor://app/index.html';

describe('isTrustedRendererUrl', () => {
  it('allows development navigation within the Vite origin', () => {
    const options = {
      devServerUrl: 'http://localhost:5173/',
      packagedRendererUrl,
    };

    expect(isTrustedRendererUrl('http://localhost:5173/', options)).toBe(true);
    expect(
      isTrustedRendererUrl('http://localhost:5173/?reload=1#workspace', options),
    ).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', options)).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/', options)).toBe(false);
  });

  it('only allows the packaged renderer entry on the private app origin', () => {
    const options = {
      devServerUrl: undefined,
      packagedRendererUrl,
    };
    const rendererUrl = new URL(packagedRendererUrl);
    rendererUrl.search = '?reload=1';
    rendererUrl.hash = '#workspace';

    expect(isTrustedRendererUrl(rendererUrl.toString(), options)).toBe(true);
    expect(
      isTrustedRendererUrl(
        'interceptor://app/other.html',
        options,
      ),
    ).toBe(false);
    expect(isTrustedRendererUrl('interceptor://other/index.html', options)).toBe(false);
    expect(isTrustedRendererUrl('interceptor://app:443/index.html', options)).toBe(false);
    expect(isTrustedRendererUrl('file:///index.html', options)).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/', options)).toBe(false);
    expect(isTrustedRendererUrl('not a URL', options)).toBe(false);
  });
});