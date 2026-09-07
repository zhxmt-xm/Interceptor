import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../../core/core-runtime';
import { startHarExport, startHarImport } from '../../start-har-transfer';

const { request, showSaveDialog, showOpenDialog } = vi.hoisted(() => ({ request: vi.fn(), showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showSaveDialog, showOpenDialog } }));
vi.mock('../../../core/core-runtime', () => ({ CoreRuntime: vi.fn(function () { return { request }; }) }));

const options = { scope: { kind: 'all' as const }, redaction: { authorization: true, cookies: true, bodies: false } };
const job = { id: 'transfer-har', kind: 'har-export', state: 'running', processed: 0, total: 2, fileName: 'capture.har', startedAt: '2026-09-07T08:00:00.000Z', warnings: [] };

beforeEach(() => {
  vi.resetAllMocks();
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\exports\\capture.har' });
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\exports\\capture.har'] });
  request.mockResolvedValue({ type: 'transfer.job', payload: { job } });
});

describe('Native HAR transfer intents', () => {
  it('exports using only the native destination and formal explicit options', async () => {
    const abortSignal = new AbortController().signal;
    await expect(startHarExport(new CoreRuntime(), options, 'Export HAR', abortSignal)).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledWith({ title: 'Export HAR', defaultPath: expect.stringMatching(/^interceptor-\d{4}-\d{2}-\d{2}\.har$/), filters: [{ name: 'HTTP Archive', extensions: ['har'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
    expect(request).toHaveBeenCalledExactlyOnceWith({ type: 'har.export.start', payload: { ...options, jobId: expect.stringMatching(/^transfer-/), filePath: 'C:\\exports\\capture.har' } }, { abortSignal });
  });

  it('imports only the first native file without clearing existing Capture', async () => {
    const abortSignal = new AbortController().signal;
    await expect(startHarImport(new CoreRuntime(), 'Import HAR', abortSignal)).resolves.toEqual(job);
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith({ title: 'Import HAR', filters: [{ name: 'HTTP Archive', extensions: ['har'] }], properties: ['openFile'] });
    expect(request).toHaveBeenCalledExactlyOnceWith({ type: 'har.import.start', payload: { jobId: expect.stringMatching(/^transfer-/), filePath: 'C:\\exports\\capture.har' } }, { abortSignal });
  });

  it.each(['export', 'import'] as const)('%s cancellation creates no job', async (direction) => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(direction === 'export' ? startHarExport(new CoreRuntime(), options) : startHarImport(new CoreRuntime())).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['export', 'import'] as const)('%s pre-cancellation opens no dialog', async (direction) => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(direction === 'export'
      ? startHarExport(new CoreRuntime(), options, undefined, abortController.signal)
      : startHarImport(new CoreRuntime(), undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['export', 'import'] as const)('%s rejects a late native choice after cancellation', async (direction) => {
    const abortController = new AbortController();
    const selected = async () => { abortController.abort(); return { canceled: false, filePath: 'C:\\exports\\capture.har', filePaths: ['C:\\exports\\capture.har'] }; };
    showSaveDialog.mockImplementation(selected);
    showOpenDialog.mockImplementation(selected);
    await expect(direction === 'export'
      ? startHarExport(new CoreRuntime(), options, undefined, abortController.signal)
      : startHarImport(new CoreRuntime(), undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['export', 'import'] as const)('%s does not cancel a job already accepted by Core', async (direction) => {
    const abortController = new AbortController();
    request.mockImplementation(async () => { abortController.abort(); return { type: 'transfer.job', payload: { job } }; });
    await expect(direction === 'export'
      ? startHarExport(new CoreRuntime(), options, undefined, abortController.signal)
      : startHarImport(new CoreRuntime(), undefined, abortController.signal)).resolves.toEqual(job);
    expect(request).toHaveBeenCalledOnce();
  });
});