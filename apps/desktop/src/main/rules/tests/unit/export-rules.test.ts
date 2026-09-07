import type { RuleNode } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../../core/core-runtime';
import { exportRules, exportSavedRules } from '../../export-rules';

const { request, showSaveDialog, writeFile } = vi.hoisted(() => ({
  request: vi.fn(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ writeFile }));
vi.mock('../../../core/core-runtime', () => ({ CoreRuntime: vi.fn(function () { return { request }; }) }));

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
  it('exports the Core saved tree through the same native dialog and writer', async () => {
    request.mockResolvedValue({ payload: { ruleSet: { nodes } } });
    const abortSignal = new AbortController().signal;

    await expect(exportSavedRules(new CoreRuntime(), abortSignal)).resolves.toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith({ type: 'rules.get', payload: {} }, { abortSignal });
    expect(showSaveDialog).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledExactlyOnceWith(selection.filePath, JSON.stringify({ nodes }, null, 2), 'utf8');
  });

  it('does not open a dialog when loading the saved tree fails', async () => {
    request.mockRejectedValue(new Error('Core unavailable'));
    await expect(exportSavedRules(new CoreRuntime(), new AbortController().signal)).rejects.toThrow('Core unavailable');
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not open a dialog when cancellation occurs while loading the saved tree', async () => {
    const abortController = new AbortController();
    request.mockImplementation(async () => {
      abortController.abort();
      return { payload: { ruleSet: { nodes } } };
    });
    await expect(exportSavedRules(new CoreRuntime(), abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not query Core when the saved-tree export was already cancelled', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(exportSavedRules(new CoreRuntime(), abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

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