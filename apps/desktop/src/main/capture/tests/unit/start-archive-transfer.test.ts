import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../../core/core-runtime';
import { startArchiveExport, startArchiveImport } from '../../start-archive-transfer';

const { request, showSaveDialog, showOpenDialog } = vi.hoisted(() => ({ request: vi.fn(), showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showSaveDialog, showOpenDialog } }));
vi.mock('../../../core/core-runtime', () => ({ CoreRuntime: vi.fn(function () { return { request }; }) }));

const job = { id: 'transfer-archive', kind: 'archive-export', state: 'running', processed: 0, total: 4, fileName: 'capture.iarchive', startedAt: '2026-09-07T11:00:00.000Z', warnings: [] };
const TARGETS = [
  { direction: 'export', start: startArchiveExport },
  { direction: 'import', start: startArchiveImport },
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\exports\\capture.iarchive' });
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\exports\\capture.iarchive'] });
  request.mockResolvedValue({ type: 'transfer.job', payload: { job } });
});

describe('Native Archive transfer intents', () => {
  it('exports the entire snapshot only to the native destination', async () => {
    const abortSignal = new AbortController().signal;
    await expect(startArchiveExport(new CoreRuntime(), 'Export Archive', abortSignal)).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Export Archive', defaultPath: expect.stringMatching(/^interceptor-\d{4}-\d{2}-\d{2}\.iarchive$/),
      filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }], properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      type: 'archive.export.start', payload: { jobId: expect.stringMatching(/^transfer-/), filePath: 'C:\\exports\\capture.iarchive' },
    }, { abortSignal });
  });

  it('imports only the native selected file without clearing Capture', async () => {
    await expect(startArchiveImport(new CoreRuntime(), 'Import Archive')).resolves.toEqual(job);
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Import Archive', filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }], properties: ['openFile'],
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      type: 'archive.import.start', payload: { jobId: expect.stringMatching(/^transfer-/), filePath: 'C:\\exports\\capture.iarchive' },
    }, {});
  });

  it.each(TARGETS)('$direction native cancellation creates no job', async ({ start }) => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(start(new CoreRuntime())).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(TARGETS)('$direction missing destination creates no job', async ({ start }) => {
    showSaveDialog.mockResolvedValue({ canceled: false });
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
    await expect(start(new CoreRuntime())).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(TARGETS)('$direction pre-cancellation opens no dialog', async ({ start }) => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(start(new CoreRuntime(), undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(TARGETS)('$direction rejects a late native choice after cancellation', async ({ start }) => {
    const abortController = new AbortController();
    const selected = async () => {
      abortController.abort();
      return { canceled: false, filePath: 'C:\\exports\\capture.iarchive', filePaths: ['C:\\exports\\capture.iarchive'] };
    };
    showSaveDialog.mockImplementation(selected);
    showOpenDialog.mockImplementation(selected);
    await expect(start(new CoreRuntime(), undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(TARGETS)('$direction never sends cancellation for a job already accepted by Core', async ({ start }) => {
    const abortController = new AbortController();
    request.mockImplementation(async () => { abortController.abort(); return { type: 'transfer.job', payload: { job } }; });
    await expect(start(new CoreRuntime(), undefined, abortController.signal)).resolves.toEqual(job);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(TARGETS)('$direction leaves failed starts to the shared error path', async ({ start }) => {
    request.mockRejectedValue(new Error('Core request failed'));
    await expect(start(new CoreRuntime())).rejects.toThrow('Core request failed');
    expect(request).toHaveBeenCalledOnce();
  });
});