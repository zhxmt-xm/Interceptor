import { describe, expect, it } from 'vitest';

import { TrustedRendererUrl } from '../trusted-renderer-url';

const packagedRendererUrl = 'interceptor://app/index.html';

describe('TrustedRendererUrl.isTrusted', () => {
  it('allows development navigation within the Vite origin', () => {
    const options = {
      devServerUrl: 'http://localhost:5173/',
      packagedRendererUrl,
    };

    expect(TrustedRendererUrl.isTrusted('http://localhost:5173/', options)).toBe(true);
    expect(
      TrustedRendererUrl.isTrusted('http://localhost:5173/?reload=1#workspace', options),
    ).toBe(true);
    expect(TrustedRendererUrl.isTrusted('http://127.0.0.1:5173/', options)).toBe(false);
    expect(TrustedRendererUrl.isTrusted('https://example.com/', options)).toBe(false);
  });

  it('only allows the packaged renderer entry on the private app origin', () => {
    const options = {
      devServerUrl: undefined,
      packagedRendererUrl,
    };
    const rendererUrl = new URL(packagedRendererUrl);
    rendererUrl.search = '?reload=1';
    rendererUrl.hash = '#workspace';

    expect(TrustedRendererUrl.isTrusted(rendererUrl.toString(), options)).toBe(true);
    expect(
      TrustedRendererUrl.isTrusted(
        'interceptor://app/other.html',
        options,
      ),
    ).toBe(false);
    expect(TrustedRendererUrl.isTrusted('interceptor://other/index.html', options)).toBe(false);
    expect(TrustedRendererUrl.isTrusted('interceptor://app:443/index.html', options)).toBe(false);
    expect(TrustedRendererUrl.isTrusted('file:///index.html', options)).toBe(false);
    expect(TrustedRendererUrl.isTrusted('https://example.com/', options)).toBe(false);
    expect(TrustedRendererUrl.isTrusted('not a URL', options)).toBe(false);
  });
});