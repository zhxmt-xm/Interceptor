import type { CollectionRequest } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposerStore } from '../../data/composerStore';
import { importCollection, saveCollection } from '../../data/useCollection';

function request(id: string): CollectionRequest {
  return {
    kind: 'request', id, name: id, method: 'GET', url: '', protocol: 'auto',
    headers: [], query: [], bodyType: 'none', bodyText: '', bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useComposerStore.setState(useComposerStore.getInitialState(), true);
  useComposerStore.getState().loadCollection([request('original')], 1);
});

describe('Collection导入写入协调', () => {
  it('等待已发出的自动保存后以新revision追加当前编辑与导入节点', async () => {
    let finishSave!: (result: { ok: true; revision: number }) => void;
    const replaceCollection = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }))
      .mockResolvedValueOnce({ ok: true, revision: 3 });
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    useComposerStore.getState().updateRequest({ ...request('original'), name: 'first edit' });
    const saving = saveCollection(useComposerStore.getState().nodes);
    useComposerStore.getState().updateRequest({ ...request('original'), name: 'latest edit' });
    const importing = importCollection([request('imported')]);
    const beforeCompletion = replaceCollection.mock.calls.length;
    finishSave({ ok: true, revision: 2 });
    await saving;
    const imported = await importing;

    expect(beforeCompletion).toBe(1);
    expect(imported).toBe(true);
    expect(replaceCollection).toHaveBeenLastCalledWith(2, [{ ...request('original'), name: 'latest edit' }, request('imported')]);
    expect(useComposerStore.getState()).toMatchObject({ revision: 3, nodes: [{ ...request('original'), name: 'latest edit' }, request('imported')] });
  });

  it('等待自动保存期间取消不再追加', async () => {
    let finishSave!: (result: { ok: true; revision: number }) => void;
    const replaceCollection = vi.fn().mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    useComposerStore.getState().updateRequest({ ...request('original'), name: 'edit' });
    const saving = saveCollection(useComposerStore.getState().nodes);
    const abortController = new AbortController();
    const importing = importCollection([request('imported')], abortController.signal);
    abortController.abort();
    finishSave({ ok: true, revision: 2 });
    await saving;

    await expect(importing).resolves.toBe(false);
    expect(replaceCollection).toHaveBeenCalledOnce();
  });

  it('导入写入期间不并发自动保存', async () => {
    let finishImport!: (result: { ok: true; revision: number }) => void;
    const replaceCollection = vi.fn().mockReturnValue(new Promise((resolve) => { finishImport = resolve; }));
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    const importing = importCollection([request('imported')]);
    useComposerStore.getState().updateRequest({ ...request('original'), name: 'late edit' });
    await saveCollection(useComposerStore.getState().nodes);
    const whileSaving = replaceCollection.mock.calls.length;
    finishImport({ ok: true, revision: 2 });
    await importing;

    expect(whileSaving).toBe(1);
    expect(useComposerStore.getState().saving).toBe(false);
  });

  it('导入失败保持现有树并释放保存状态', async () => {
    const replaceCollection = vi.fn().mockResolvedValue({ ok: false, reason: 'conflict', message: 'Collection changed.' });
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    await expect(importCollection([request('imported')])).resolves.toBe(false);
    expect(useComposerStore.getState()).toMatchObject({ revision: 1, nodes: [request('original')], saving: false });
  });
});