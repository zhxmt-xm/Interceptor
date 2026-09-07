import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../../core/core-runtime';
import { exportCapturedBody, startBodyExport } from '../../start-body-export';

const { request, showSaveDialog, getCoreProcessStatus } = vi.hoisted(() => ({
  request: vi.fn(), showSaveDialog: vi.fn(), getCoreProcessStatus: vi.fn(),
}));
vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('../../../core/core-runtime', () => ({ CoreRuntime: vi.fn(function () { return { request, getCoreProcessStatus }; }) }));

const identity = { exchangeId: 'exchange-one', bodyId: 'body-one' };
const detail = {
  url: 'https://example.test/recording.bin?token=private',
  responseBody: { bodyHash: 'body-one', encodedSize: 2_097_152, mediaType: 'application/octet-stream', contentEncoding: 'gzip' },
};
const job = {
  id: 'transfer-one', kind: 'body-export', state: 'running', fileName: 'recording.bin',
  processed: 0, total: 2_097_152, startedAt: '2026-09-07T06:00:00.000Z', warnings: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  getCoreProcessStatus.mockReturnValue({ pid: 100, startedAt: '2026-09-07T06:00:00.000Z' });
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\exports\\recording.bin' });
  request.mockImplementation(async (command) => command.type === 'sessions.detail'
    ? { type: 'sessions.detail', payload: { detail } }
    : { type: 'transfer.job', payload: { job } });
});

describe('Capture native body export', () => {
  it('preserves the existing UI save intent and sanitizes only the filename suggestion', async () => {
    await expect(startBodyExport(new CoreRuntime(), { bodyId: 'body-one', suggestedName: '../recording.bin' }, 'Save body')).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Save body', defaultPath: 'recording.bin', properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      type: 'body.export.start', payload: { jobId: expect.stringMatching(/^transfer-/), bodyId: 'body-one', filePath: 'C:\\exports\\recording.bin' },
    }, {});
  });

  it('revalidates body ownership after the dialog and starts the existing raw-byte job', async () => {
    const abortSignal = new AbortController().signal;
    await expect(exportCapturedBody(new CoreRuntime(), identity, abortSignal)).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      defaultPath: 'recording.bin', properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(request.mock.calls.map(([command]) => command.type)).toEqual(['sessions.detail', 'sessions.detail', 'body.export.start']);
    expect(request).toHaveBeenLastCalledWith({
      type: 'body.export.start', payload: { jobId: expect.stringMatching(/^transfer-/), bodyId: 'body-one', filePath: 'C:\\exports\\recording.bin' },
    }, { abortSignal });
  });

  it.each([null, { ...detail, responseBody: { bodyHash: 'different-body' } }])('rejects unavailable bodies before opening a dialog: %j', async (currentDetail) => {
    request.mockResolvedValue({ payload: { detail: currentDetail } });
    await expect(exportCapturedBody(new CoreRuntime(), identity, new AbortController().signal)).rejects.toThrow('The captured body is no longer available.');
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not start a job after native cancellation', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    await expect(exportCapturedBody(new CoreRuntime(), identity, new AbortController().signal)).resolves.toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });

  it('rejects a body cleared while the Save Dialog was open', async () => {
    showSaveDialog.mockImplementation(async () => {
      request.mockResolvedValue({ payload: { detail: null } });
      return { canceled: false, filePath: 'C:\\exports\\recording.bin' };
    });
    await expect(exportCapturedBody(new CoreRuntime(), identity, new AbortController().signal)).rejects.toThrow('The captured body is no longer available.');
    expect(request.mock.calls.map(([command]) => command.type)).toEqual(['sessions.detail', 'sessions.detail']);
  });

  it('rejects a replacement Core generation even if an identity is repeated', async () => {
    showSaveDialog.mockImplementation(async () => {
      getCoreProcessStatus.mockReturnValue({ pid: 200, startedAt: '2026-09-07T06:01:00.000Z' });
      return { canceled: false, filePath: 'C:\\exports\\recording.bin' };
    });
    await expect(exportCapturedBody(new CoreRuntime(), identity, new AbortController().signal)).rejects.toThrow('The captured body is no longer available.');
    expect(request.mock.calls.map(([command]) => command.type)).toEqual(['sessions.detail', 'sessions.detail']);
  });

  it('does not read metadata or show a dialog after pre-cancellation', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(exportCapturedBody(new CoreRuntime(), identity, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it('does not accept a late destination after Tool cancellation', async () => {
    const abortController = new AbortController();
    showSaveDialog.mockImplementation(async () => {
      abortController.abort();
      return { canceled: false, filePath: 'C:\\exports\\recording.bin' };
    });
    await expect(exportCapturedBody(new CoreRuntime(), identity, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('supports a captured original request body and shares the MIME fallback filename', async () => {
    request.mockImplementation(async (command) => command.type === 'sessions.detail'
      ? { payload: { detail: { url: 'https://example.test/', requestBodyEffect: { originalBody: { bodyHash: 'body-one', encodedSize: 5, mediaType: 'audio/mpeg' } } } } }
      : { payload: { job } });
    await expect(exportCapturedBody(new CoreRuntime(), identity, new AbortController().signal)).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'request-body.mp3' }));
  });

  it('does not send a second cancellation command for a job already accepted by Core', async () => {
    const abortController = new AbortController();
    request.mockImplementation(async (command) => {
      if (command.type === 'sessions.detail') return { payload: { detail } };
      abortController.abort();
      return { payload: { job } };
    });
    await expect(exportCapturedBody(new CoreRuntime(), identity, abortController.signal)).resolves.toEqual(job);
    expect(request.mock.calls.map(([command]) => command.type)).toEqual(['sessions.detail', 'sessions.detail', 'body.export.start']);
  });
});