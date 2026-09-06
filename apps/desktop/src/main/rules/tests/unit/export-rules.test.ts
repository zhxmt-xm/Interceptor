import type { RuleNode } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportRules } from '../../export-rules';

const { showSaveDialog, writeFile } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ writeFile }));

const nodes: RuleNode[] = [{
  kind: 'folder', id: 'saved-folder', name: 'Saved folder', children: [{
    kind: 'rule', id: 'saved-rule', name: 'Saved rule', enabled: true, priority: 0,
    matchers: [{ type: 'host', value: 'example.test', mode: 'exact' }],
    actions: [{ type: 'map-local', path: 'C:\\response\\saved.json' }],
  }],
}];
const selection = { canceled: false, filePath: 'C:\\exports\\rules.json' };

beforeEach(() => {
  vi.resetAllMocks();
  showSaveDialog.mockResolvedValue(selection);
  writeFile.mockResolvedValue(undefined);
});

describe('Rules file export', () => {
  it('preserves the supplied complete tree and writes only to the native selection', async () => {
    await expect(exportRules(nodes, 'Export title')).resolves.toBe(true);

    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Export title',
      defaultPath: expect.stringMatching(/^interceptor-rules-\d{4}-\d{2}-\d{2}\.json$/),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(writeFile).toHaveBeenCalledExactlyOnceWith(selection.filePath, JSON.stringify({ nodes }, null, 2), 'utf8');
  });

  it.each([{ canceled: true }, { canceled: false }])('does not write without a saved selection: %j', async (result) => {
    showSaveDialog.mockResolvedValue(result);

    await expect(exportRules(nodes)).resolves.toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not open a dialog when the call was already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(exportRules(nodes, undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not write a late selection after cancellation while the native dialog was open', async () => {
    const abortController = new AbortController();
    showSaveDialog.mockImplementation(async () => {
      abortController.abort();
      return selection;
    });

    await expect(exportRules(nodes, undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('finishes the selected write once it has started', async () => {
    const abortController = new AbortController();
    writeFile.mockImplementation(async () => { abortController.abort(); });

    await expect(exportRules(nodes, undefined, abortController.signal)).resolves.toBe(true);
    expect(writeFile).toHaveBeenCalledOnce();
  });
});