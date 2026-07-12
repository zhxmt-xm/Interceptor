import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isTrustedRendererUrl } from '../trusted-renderer-url';

const packagedRendererPath = path.resolve(
  'C:/Interceptor/resources/app.asar/.vite/renderer/main_window/index.html',
);

describe('isTrustedRendererUrl', () => {
  it('allows development navigation within the Vite origin', () => {
    const options = {
      devServerUrl: 'http://localhost:5173/',
      packagedRendererPath,
    };

    expect(isTrustedRendererUrl('http://localhost:5173/', options)).toBe(true);
    expect(
      isTrustedRendererUrl('http://localhost:5173/?reload=1#workspace', options),
    ).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', options)).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/', options)).toBe(false);
  });

  it('only allows the packaged renderer file in production', () => {
    const options = {
      devServerUrl: undefined,
      packagedRendererPath,
    };
    const rendererUrl = pathToFileURL(packagedRendererPath);
    rendererUrl.search = '?reload=1';
    rendererUrl.hash = '#workspace';

    expect(isTrustedRendererUrl(rendererUrl.toString(), options)).toBe(true);
    expect(
      isTrustedRendererUrl(
        pathToFileURL(path.join(path.dirname(packagedRendererPath), 'other.html'))
          .toString(),
        options,
      ),
    ).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/', options)).toBe(false);
    expect(isTrustedRendererUrl('not a URL', options)).toBe(false);
  });
});