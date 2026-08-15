import { describe, expect, it, vi } from 'vitest';

import { formatCodeDocument } from '../../CodeViewer/formatCodeDocument';

function formatter(language: string, value: string) {
  return {
    language,
    value,
    replace: vi.fn(),
    run: vi.fn(async () => {}),
    setReadOnly: vi.fn(),
  };
}

describe('code viewer formatting', () => {
  it.each(['html', 'css'])('runs the Monaco formatter for %s and restores read-only mode', async (language) => {
    const document = formatter(language, 'minified');

    await formatCodeDocument(document);

    expect(document.run).toHaveBeenCalledOnce();
    expect(document.replace).not.toHaveBeenCalled();
    expect(document.setReadOnly.mock.calls).toEqual([[false], [true]]);
  });

  it('formats XML without invoking a missing Monaco language formatter', async () => {
    const document = formatter('xml', '<root><child>value</child></root>');

    await formatCodeDocument(document);

    expect(document.replace).toHaveBeenCalledWith(
      '<root>\n  <child>\n    value\n  </child>\n</root>',
    );
    expect(document.run).not.toHaveBeenCalled();
    expect(document.setReadOnly).not.toHaveBeenCalled();
  });

  it('restores read-only mode when the Monaco formatter fails', async () => {
    const document = formatter('html', '<main></main>');
    document.run.mockRejectedValueOnce(new Error('formatter failed'));

    await expect(formatCodeDocument(document)).rejects.toThrow('formatter failed');
    expect(document.setReadOnly.mock.calls).toEqual([[false], [true]]);
  });
});