import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionImportActions } from '../../data/collectionImportActions';
import { useCollectionImportStore } from '../../data/collectionImportStore';
import { useComposerStore } from '../../data/composerStore';

const { analyzeCollectionImport, importCollection, loadCollection } = vi.hoisted(() => ({
  analyzeCollectionImport: vi.fn(), importCollection: vi.fn(), loadCollection: vi.fn(),
}));

vi.mock('../../data/useCollection', () => ({ analyzeCollectionImport, importCollection, loadCollection }));

const preview = {
  ok: true as const, fileName: 'collection.json',
  nodes: [{ kind: 'folder' as const, id: 'fresh-folder', name: 'Folder', children: [] }],
  folderCount: 1, leafCount: 2, skipped: [],
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  useComposerStore.setState(useComposerStore.getInitialState(), true);
  useComposerStore.getState().loadCollection([], 1);
  useCollectionImportStore.setState(useCollectionImportStore.getInitialState(), true);
  loadCollection.mockResolvedValue(undefined);
  analyzeCollectionImport.mockResolvedValue(preview);
  importCollection.mockImplementation(async () => {
    useComposerStore.setState({ revision: 2 });
    return true;
  });
});

describe('Collection共享导入流程', () => {
  it('把Main请求送入同一预览，仅回传当前请求的公开完成结果', async () => {
    let requestImport!: (requestId: string) => void;
    const stopRequests = vi.fn();
    const stopCancellations = vi.fn();
    const completeCollectionImport = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { interceptor: {
      onCollectionImportRequested: (listener: typeof requestImport) => { requestImport = listener; return stopRequests; },
      onCollectionImportCanceled: () => stopCancellations,
      completeCollectionImport,
    } });
    const collectionImportActions = new CollectionImportActions();
    const unsubscribe = collectionImportActions.subscribe(() => 'Import title');
    requestImport('request-1');
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    await collectionImportActions.confirmImport();
    await vi.waitFor(() => expect(completeCollectionImport).toHaveBeenCalledExactlyOnceWith('request-1', {
      status: 'completed', result: { imported: true, revision: 2, requestCount: 2, folderCount: 1, skippedCount: 0 },
    }));
    unsubscribe();
    expect(stopRequests).toHaveBeenCalledOnce();
    expect(stopCancellations).toHaveBeenCalledOnce();
  });

  it('只取消匹配请求且不回传已取消结果', async () => {
    let requestImport!: (requestId: string) => void;
    let cancelImport!: (requestId: string) => void;
    const completeCollectionImport = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { interceptor: {
      onCollectionImportRequested: (listener: typeof requestImport) => { requestImport = listener; return vi.fn(); },
      onCollectionImportCanceled: (listener: typeof cancelImport) => { cancelImport = listener; return vi.fn(); },
      completeCollectionImport,
    } });
    const collectionImportActions = new CollectionImportActions();
    const unsubscribe = collectionImportActions.subscribe(() => 'Import title');
    requestImport('request-1');
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    cancelImport('other-request');
    expect(useCollectionImportStore.getState().phase).toBe('preview');
    cancelImport('request-1');
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('idle'));
    expect(completeCollectionImport).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('只读取一次文件且不重载已就绪的当前编辑', async () => {
    const collectionImportActions = new CollectionImportActions();
    const result = collectionImportActions.startImport('Import Collection', new AbortController().signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    expect(loadCollection).not.toHaveBeenCalled();
    expect(analyzeCollectionImport).toHaveBeenCalledExactlyOnceWith('Import Collection');
    expect(useCollectionImportStore.getState().preview).toEqual(preview);
    expect(importCollection).not.toHaveBeenCalled();
    collectionImportActions.cancelImport();
    await expect(result).resolves.toEqual({ status: 'completed', result: { imported: false } });
  });

  it('未就绪时先读取Collection，失败不打开文件', async () => {
    useComposerStore.setState({ loaded: false });
    const collectionImportActions = new CollectionImportActions();
    await expect(collectionImportActions.startImport('Import Collection', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(loadCollection).toHaveBeenCalledOnce();
    expect(analyzeCollectionImport).not.toHaveBeenCalled();
    expect(useCollectionImportStore.getState().errorKey).toBe('composer.import.readFailed');
  });

  it('原生取消不展示预览且不保存', async () => {
    analyzeCollectionImport.mockResolvedValue(null);
    const collectionImportActions = new CollectionImportActions();
    await expect(collectionImportActions.startImport('Import Collection', new AbortController().signal))
      .resolves.toEqual({ status: 'completed', result: { imported: false } });
    expect(useCollectionImportStore.getState()).toMatchObject({ phase: 'idle', preview: null });
    expect(importCollection).not.toHaveBeenCalled();
  });

  it('把同一预览与取消信号交给正式原子导入，仅返回计数', async () => {
    const collectionImportActions = new CollectionImportActions();
    const abortController = new AbortController();
    const result = collectionImportActions.startImport('Import Collection', abortController.signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    await collectionImportActions.confirmImport();
    expect(importCollection).toHaveBeenCalledExactlyOnceWith(preview.nodes, abortController.signal);
    expect(analyzeCollectionImport).toHaveBeenCalledOnce();
    await expect(result).resolves.toEqual({ status: 'completed', result: {
      imported: true, revision: 2, requestCount: 2, folderCount: 1, skippedCount: 0,
    } });
    expect(useCollectionImportStore.getState()).toMatchObject({ phase: 'idle', preview: null });
  });

  it('保存期间重复确认只写一次', async () => {
    let finishSave!: (saved: boolean) => void;
    importCollection.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const collectionImportActions = new CollectionImportActions();
    const result = collectionImportActions.startImport('Import Collection', new AbortController().signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    const saving = collectionImportActions.confirmImport();
    await collectionImportActions.confirmImport();
    expect(importCollection).toHaveBeenCalledOnce();
    expect(useCollectionImportStore.getState().phase).toBe('saving');
    finishSave(true);
    await saving;
    await expect(result).resolves.toMatchObject({ status: 'completed', result: { imported: true } });
  });

  it('并发准备不覆盖当前预览', async () => {
    const collectionImportActions = new CollectionImportActions();
    const first = collectionImportActions.startImport('First', new AbortController().signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    await expect(collectionImportActions.startImport('Second', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(analyzeCollectionImport).toHaveBeenCalledOnce();
    expect(useCollectionImportStore.getState().preview).toEqual(preview);
    collectionImportActions.cancelImport();
    await first;
  });

  it('预先取消的请求不开始读取', async () => {
    const collectionImportActions = new CollectionImportActions();
    const abortController = new AbortController();
    abortController.abort();
    await expect(collectionImportActions.startImport('Import Collection', abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(loadCollection).not.toHaveBeenCalled();
    expect(analyzeCollectionImport).not.toHaveBeenCalled();
  });

  it('取消后的迟到选择不能替换下一次预览', async () => {
    let finishRead!: (value: typeof preview) => void;
    analyzeCollectionImport.mockReturnValueOnce(new Promise((resolve) => { finishRead = resolve; }));
    const collectionImportActions = new CollectionImportActions();
    const abortController = new AbortController();
    const first = collectionImportActions.startImport('First', abortController.signal);
    await vi.waitFor(() => expect(analyzeCollectionImport).toHaveBeenCalledOnce());
    abortController.abort();
    await expect(first).resolves.toEqual({ status: 'completed', result: { imported: false } });
    const nextPreview = { ...preview, fileName: 'newer.json' };
    analyzeCollectionImport.mockResolvedValueOnce(nextPreview);
    const second = collectionImportActions.startImport('Second', new AbortController().signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().preview).toEqual(nextPreview));
    finishRead(preview);
    await Promise.resolve();
    expect(useCollectionImportStore.getState().preview).toEqual(nextPreview);
    expect(importCollection).not.toHaveBeenCalled();
    collectionImportActions.cancelImport();
    await second;
  });

  it('保存失败保留预览供重试或取消', async () => {
    importCollection.mockResolvedValue(false);
    const collectionImportActions = new CollectionImportActions();
    const result = collectionImportActions.startImport('Import Collection', new AbortController().signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    await collectionImportActions.confirmImport();
    expect(useCollectionImportStore.getState()).toMatchObject({ phase: 'preview', preview, errorKey: 'composer.import.failed' });
    collectionImportActions.cancelImport();
    await expect(result).resolves.toEqual({ status: 'completed', result: { imported: false } });
  });

  it('取消后已开始的正式写入完成而不回滚', async () => {
    let finishSave!: (saved: boolean) => void;
    importCollection.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const collectionImportActions = new CollectionImportActions();
    const abortController = new AbortController();
    const result = collectionImportActions.startImport('Import Collection', abortController.signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    const saving = collectionImportActions.confirmImport();
    abortController.abort();
    expect(useCollectionImportStore.getState().phase).toBe('saving');
    finishSave(true);
    await saving;
    await expect(result).resolves.toMatchObject({ status: 'completed', result: { imported: true } });
  });

  it('等待自动保存期间取消后结束流程且不重开预览', async () => {
    let finishSave!: (saved: boolean) => void;
    importCollection.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const collectionImportActions = new CollectionImportActions();
    const abortController = new AbortController();
    const result = collectionImportActions.startImport('Import Collection', abortController.signal);
    await vi.waitFor(() => expect(useCollectionImportStore.getState().phase).toBe('preview'));
    const saving = collectionImportActions.confirmImport();
    abortController.abort();
    finishSave(false);
    await saving;
    await expect(result).resolves.toEqual({ status: 'completed', result: { imported: false } });
    expect(useCollectionImportStore.getState().phase).toBe('idle');
  });

  it('非法文件只暴露公开失败原因', async () => {
    analyzeCollectionImport.mockResolvedValue({ ok: false, reason: 'invalid-json' });
    const collectionImportActions = new CollectionImportActions();
    await expect(collectionImportActions.startImport('Import Collection', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(useCollectionImportStore.getState()).toMatchObject({ phase: 'idle', preview: null, errorKey: 'import.reason.invalid-json' });
    expect(importCollection).not.toHaveBeenCalled();
  });
});