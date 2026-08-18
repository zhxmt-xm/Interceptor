import { describe, expect, it, vi } from 'vitest';

import { formatCodeDocument } from '../../CodeViewer/formatCodeDocument';

function formatter(language: string, value: string) {
  return {
    language,
    value,
    replace: vi.fn(),
    run: vi.fn(async () => 'formatted'),
  };
}

describe('code viewer formatting', () => {
  it.each(['html', 'css', 'javascript'])('uses the Monaco worker result for %s', async (language) => {
    const document = formatter(language, 'minified');

    await formatCodeDocument(document);

    expect(document.run).toHaveBeenCalledOnce();
    expect(document.replace).toHaveBeenCalledWith('formatted');
  });

  it('formats XML without invoking a missing Monaco language formatter', async () => {
    const document = formatter('xml', '<root><child>value</child></root>');

    await formatCodeDocument(document);

    expect(document.replace).toHaveBeenCalledWith(
      '<root>\n  <child>\n    value\n  </child>\n</root>',
    );
    expect(document.run).not.toHaveBeenCalled();
  });

  it('restores the original value when the Monaco formatter fails', async () => {
    const document = formatter('html', '<main></main>');
    document.run.mockRejectedValueOnce(new Error('formatter failed'));

    await expect(formatCodeDocument(document)).resolves.toBeUndefined();
    expect(document.replace).toHaveBeenCalledWith('<main></main>');
  });

  it('keeps malformed XML unchanged instead of leaking the parser failure', async () => {
    const document = formatter('xml', '<root><');

    await expect(formatCodeDocument(document)).resolves.toBeUndefined();
    expect(document.replace).toHaveBeenCalledWith('<root><');
    expect(document.run).not.toHaveBeenCalled();
  });
});