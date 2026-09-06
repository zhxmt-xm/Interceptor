import type { CollectionRequest } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposerStore } from '../../data/composerStore';
import { loadCollection, saveCollection, synchronizeExternalCollectionChange } from '../../data/useCollection';

function request(name: string): CollectionRequest {
  return {
    kind: 'request', id: 'request-1', name, method: 'GET', url: '', protocol: 'auto',
    headers: [], query: [], bodyType: 'none', bodyText: '', bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useComposerStore.setState(useComposerStore.getInitialState(), true);
});

describe('Collection synchronization', () => {
  it('旧保存响应只确认实际写入快照，不把后续编辑标为已保存', () => {
    useComposerStore.getState().loadCollection([request('initial')], 1);
    useComposerStore.getState().updateRequest(request('pending'));
    const pending = useComposerStore.getState().nodes;
    useComposerStore.getState().updateRequest(request('later edit'));

    useComposerStore.getState().markSaved(2, pending);

    expect(useComposerStore.getState().nodes[0]?.name).toBe('later edit');
    expect(useComposerStore.getState().savedNodes).toBe(pending);
    expect(useComposerStore.getState().nodes).not.toBe(useComposerStore.getState().savedNodes);
  });

  it('外部较新集合已经载入时忽略旧保存与导入响应', () => {
    useComposerStore.getState().loadCollection([request('Tool replacement')], 3);
    useComposerStore.getState().markSaved(2, [request('old save')]);
    useComposerStore.getState().importSucceeded([request('old import')], 2);

    expect(useComposerStore.getState()).toMatchObject({ revision: 3, nodes: [request('Tool replacement')] });
  });

  it('旧查询不能倒退已加载的revision', () => {
    useComposerStore.getState().loadCollection([request('latest')], 3);
    useComposerStore.getState().loadCollection([request('old')], 1);
    expect(useComposerStore.getState()).toMatchObject({ revision: 3, nodes: [request('latest')] });
  });

  it('外部替换重载Core权威树并保留仍存在的打开文档', async () => {
    useComposerStore.getState().loadCollection([request('initial')], 1);
    useComposerStore.getState().openRequest('request-1');
    const getCollection = vi.fn().mockResolvedValue({ revision: 2, nodes: [request('external')] });
    vi.stubGlobal('window', { interceptor: { getCollection } });

    await synchronizeExternalCollectionChange({ revision: 2 });

    expect(getCollection).toHaveBeenCalledOnce();
    expect(useComposerStore.getState()).toMatchObject({ revision: 2, nodes: [request('external')], activeRequestId: 'request-1' });
  });

  it('重复或过期变化通知不重复查询', async () => {
    useComposerStore.getState().loadCollection([request('current')], 3);
    const getCollection = vi.fn();
    vi.stubGlobal('window', { interceptor: { getCollection } });
    await synchronizeExternalCollectionChange({ revision: 2 });
    await synchronizeExternalCollectionChange({ revision: 3 });
    expect(getCollection).not.toHaveBeenCalled();
  });

  it('晚到初始查询不能覆盖之后完成的外部重载', async () => {
    let finishFirst!: (value: unknown) => void;
    const getCollection = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ revision: 3, nodes: [request('latest')] });
    vi.stubGlobal('window', { interceptor: { getCollection } });
    const first = loadCollection();
    await synchronizeExternalCollectionChange({ revision: 3 });
    finishFirst({ revision: 1, nodes: [request('stale')] });
    await first;
    expect(useComposerStore.getState()).toMatchObject({ revision: 3, nodes: [request('latest')] });
  });

  it('旧定时任务不保存已被新树替换的快照', async () => {
    useComposerStore.getState().loadCollection([request('initial')], 1);
    useComposerStore.getState().updateRequest(request('pending'));
    const pending = useComposerStore.getState().nodes;
    useComposerStore.getState().loadCollection([request('external')], 3);
    const replaceCollection = vi.fn();
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    await saveCollection(pending);
    expect(replaceCollection).not.toHaveBeenCalled();
  });

  it('保存完成后保留较新的编辑供下一轮自动保存', async () => {
    useComposerStore.getState().loadCollection([request('initial')], 1);
    useComposerStore.getState().updateRequest(request('pending'));
    const pending = useComposerStore.getState().nodes;
    let finishSave!: (value: unknown) => void;
    const replaceCollection = vi.fn().mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    const saving = saveCollection(pending);
    useComposerStore.getState().updateRequest(request('later edit'));
    finishSave({ ok: true, revision: 2 });
    await saving;
    expect(useComposerStore.getState().savedNodes).toBe(pending);
    expect(useComposerStore.getState().nodes[0]?.name).toBe('later edit');
  });

  it('同一时刻不发起第二次自动保存', async () => {
    useComposerStore.getState().loadCollection([request('initial')], 1);
    useComposerStore.getState().updateRequest(request('pending'));
    const pending = useComposerStore.getState().nodes;
    let finishSave!: (value: unknown) => void;
    const replaceCollection = vi.fn().mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    vi.stubGlobal('window', { interceptor: { replaceCollection } });
    const saving = saveCollection(pending);
    await saveCollection(pending);
    expect(replaceCollection).toHaveBeenCalledOnce();
    finishSave({ ok: true, revision: 2 });
    await saving;
  });
});