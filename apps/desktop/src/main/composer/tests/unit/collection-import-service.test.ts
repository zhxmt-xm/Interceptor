import { describe, expect, it, vi } from 'vitest';

import { CollectionImportService } from '../../collection-import-service';

const canceled = { status: 'completed', result: { imported: false } } as const;
const imported = { status: 'completed', result: { imported: true, revision: 2, requestCount: 2, folderCount: 1, skippedCount: 0 } } as const;

describe('Collection导入生命周期', () => {
  it('只接受当前请求的完成响应', async () => {
    const requestImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, vi.fn());
    const result = collectionImportService.startImport(new AbortController().signal);
    collectionImportService.completeImport('unknown', { status: 'failed' });
    collectionImportService.completeImport(requestImport.mock.calls[0]?.[0], imported);
    await expect(result).resolves.toEqual(imported);
  });

  it('拒绝并发导入，不覆盖当前请求', async () => {
    const requestImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, vi.fn());
    const first = collectionImportService.startImport(new AbortController().signal);
    await expect(collectionImportService.startImport(new AbortController().signal)).rejects.toThrow('A Collection import is already running.');
    expect(requestImport).toHaveBeenCalledOnce();
    collectionImportService.completeImport(requestImport.mock.calls[0]?.[0], canceled);
    await expect(first).resolves.toEqual(canceled);
  });

  it('取消会通知Renderer并释放请求，晚到完成不能影响下一次', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, cancelImport);
    const abortController = new AbortController();
    const result = collectionImportService.startImport(abortController.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    abortController.abort();
    await rejected;
    expect(cancelImport).toHaveBeenCalledExactlyOnceWith(requestImport.mock.calls[0]?.[0]);
    const next = collectionImportService.startImport(new AbortController().signal);
    collectionImportService.completeImport(requestImport.mock.calls[0]?.[0], imported);
    collectionImportService.completeImport(requestImport.mock.calls[1]?.[0], canceled);
    await expect(next).resolves.toEqual(canceled);
  });

  it('请求已取消时不打开流程，退出取消幂等', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, cancelImport);
    const abortController = new AbortController();
    abortController.abort();
    await expect(collectionImportService.startImport(abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestImport).not.toHaveBeenCalled();
    const result = collectionImportService.startImport(new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    collectionImportService.cancelImport();
    collectionImportService.cancelImport();
    await rejected;
    expect(cancelImport).toHaveBeenCalledOnce();
  });

  it.each([
    null, { status: 'completed' }, { status: 'failed', path: 'secret.json' },
    { status: 'completed', result: { imported: false, path: 'secret.json' } },
    { status: 'completed', result: { ...imported.result, revision: -1 } },
    { status: 'completed', result: { ...imported.result, requestCount: 'secret' } },
  ])('非法响应脱敏拒绝并释放请求：%j', async (response) => {
    const requestImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, vi.fn());
    const result = collectionImportService.startImport(new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('Invalid Collection import response.');
    collectionImportService.completeImport(requestImport.mock.calls[0]?.[0], response);
    await rejected;
  });

  it('完成后移除取消监听器', async () => {
    const requestImport = vi.fn();
    const cancelImport = vi.fn();
    const collectionImportService = new CollectionImportService(requestImport, cancelImport);
    const abortController = new AbortController();
    const result = collectionImportService.startImport(abortController.signal);
    collectionImportService.completeImport(requestImport.mock.calls[0]?.[0], canceled);
    await result;
    abortController.abort();
    expect(cancelImport).not.toHaveBeenCalled();
  });
});