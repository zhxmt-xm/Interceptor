import { describe, expect, it, vi } from 'vitest';

import { RulesImportService } from '../../import-service';

const canceledResponse = { status: 'completed', result: { imported: false } } as const;

describe('RulesImportService', () => {
  it('requests one Renderer-owned flow and resolves only its matching response', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, cancelImport);
    const result = rulesImportService.startImport(new AbortController().signal);
    const requestId = requestImport.mock.calls[0]?.[0] as string;

    expect(requestId).toEqual(expect.any(String));
    rulesImportService.completeImport('different-request', canceledResponse);
    rulesImportService.completeImport(requestId, canceledResponse);

    await expect(result).resolves.toEqual(canceledResponse);
    expect(cancelImport).not.toHaveBeenCalled();
  });

  it('does not replace an active preview with a concurrent request', async () => {
    const requestImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, vi.fn());
    const first = rulesImportService.startImport(new AbortController().signal);

    await expect(rulesImportService.startImport(new AbortController().signal))
      .rejects.toThrow('A Rules import is already running.');
    expect(requestImport).toHaveBeenCalledOnce();
    rulesImportService.completeImport(requestImport.mock.calls[0]?.[0] as string, canceledResponse);
    await expect(first).resolves.toEqual(canceledResponse);
  });

  it('does not start an already canceled request', async () => {
    const requestImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, vi.fn());
    const abortController = new AbortController();
    abortController.abort();

    await expect(rulesImportService.startImport(abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestImport).not.toHaveBeenCalled();
  });

  it('forwards cancellation and ignores the late response without affecting a newer request', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, cancelImport);
    const abortController = new AbortController();
    const first = rulesImportService.startImport(abortController.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const firstRequestId = requestImport.mock.calls[0]?.[0] as string;
    abortController.abort();
    await rejected;
    expect(cancelImport).toHaveBeenCalledExactlyOnceWith(firstRequestId);

    const second = rulesImportService.startImport(new AbortController().signal);
    const secondRequestId = requestImport.mock.calls[1]?.[0] as string;
    expect(secondRequestId).not.toBe(firstRequestId);
    rulesImportService.completeImport(firstRequestId, { status: 'failed' });
    rulesImportService.completeImport(secondRequestId, canceledResponse);
    await expect(second).resolves.toEqual(canceledResponse);
  });

  it('cancels the pending flow before the application begins draining IPC', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, cancelImport);
    const result = rulesImportService.startImport(new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    rulesImportService.cancelImport();
    rulesImportService.cancelImport();

    await rejected;
    expect(cancelImport).toHaveBeenCalledExactlyOnceWith(requestImport.mock.calls[0]?.[0]);
  });

  it('removes the abort listener after completion', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, cancelImport);
    const abortController = new AbortController();
    const result = rulesImportService.startImport(abortController.signal);

    rulesImportService.completeImport(requestImport.mock.calls[0]?.[0] as string, canceledResponse);
    await result;
    abortController.abort();

    expect(cancelImport).not.toHaveBeenCalled();
  });

  it('settles a failed preparation without forwarding raw file errors', async () => {
    const requestImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, vi.fn());
    const result = rulesImportService.startImport(new AbortController().signal);

    rulesImportService.completeImport(requestImport.mock.calls[0]?.[0] as string, { status: 'failed' });

    await expect(result).resolves.toEqual({ status: 'failed' });
  });

  it.each([
    null,
    { status: 'completed' },
    { status: 'completed', result: { imported: 'yes' } },
    { status: 'completed', result: { imported: false, path: 'C:\\private\\rules.json' } },
    { status: 'failed', error: 'C:\\private\\rules.json' },
    { status: 'completed', result: { imported: true, revision: -1, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 } },
    { status: 'completed', result: { imported: true, revision: 2, ruleCount: 'C:\\private\\rules.json', folderCount: 1, enabledCount: 1, skippedCount: 0 } },
  ])('拒绝非法Renderer响应并释放请求：%j', async (response) => {
    const requestImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, vi.fn());
    const result = rulesImportService.startImport(new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('Invalid Rules import response.');

    rulesImportService.completeImport(requestImport.mock.calls[0]?.[0] as string, response);
    await rejected;
    const next = rulesImportService.startImport(new AbortController().signal);
    rulesImportService.completeImport(requestImport.mock.calls[1]?.[0] as string, canceledResponse);
    await expect(next).resolves.toEqual(canceledResponse);
  });

  it('接受成功响应中的公开计数与revision', async () => {
    const requestImport = vi.fn();
    const rulesImportService = new RulesImportService(requestImport, vi.fn());
    const result = rulesImportService.startImport(new AbortController().signal);
    const response = { status: 'completed', result: {
      imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0,
    } } as const;

    rulesImportService.completeImport(requestImport.mock.calls[0]?.[0] as string, response);

    await expect(result).resolves.toEqual(response);
  });
});