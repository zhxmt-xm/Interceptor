import { useEffect } from 'react';

import { COLLECTION_SAVE_DELAY_MS } from '../constants';
import type {
  CollectionImportPreview,
  CollectionNode,
  CollectionRequest,
} from '../interfaces';
import {
  buildRequestBody,
  buildRequestHeaders,
  buildRequestUrl,
  defaultContentType,
  parseImportedCollection,
} from '../utils';

import { useComposerStore } from './composerStore';

let collectionLoadSequence = 0;

export async function loadCollection(): Promise<void> {
  const sequence = ++collectionLoadSequence;
  try {
    const collection = await window.interceptor.getCollection();
    if (sequence !== collectionLoadSequence) return;
    useComposerStore.getState().loadCollection([...collection.nodes], collection.revision);
  } catch {
    return;
  }
}

export async function synchronizeExternalCollectionChange(change: { revision: number }): Promise<void> {
  if (change.revision <= useComposerStore.getState().revision) return;
  await loadCollection();
}

export async function saveCollection(nodes: CollectionNode[]): Promise<void> {
  const store = useComposerStore.getState();
  if (!store.loaded || store.saving || store.nodes !== nodes || store.savedNodes === nodes) return;
  useComposerStore.setState({ saving: true });
  try {
    const result = await window.interceptor.replaceCollection(store.revision, nodes);
    if (result.ok) {
      useComposerStore.getState().markSaved(result.revision, nodes);
    } else {
      await loadCollection();
    }
  } catch {
    return;
  } finally {
    useComposerStore.setState({ saving: false });
  }
}

/**
 * 载入集合并把后续编辑节流写回 Core。
 *
 * 「编辑即生效」没有保存动作，所以写回必须节流，否则每次按键都会落库；
 * revision 冲突时以 Core 的版本为准重新载入，本地未保存的按键会被覆盖，
 * 这与规则集不同——集合没有草稿概念。
 */
export function useCollection(readyToLoad: boolean): void {
  const nodes = useComposerStore((state) => state.nodes);
  const savedNodes = useComposerStore((state) => state.savedNodes);
  const loaded = useComposerStore((state) => state.loaded);
  const saving = useComposerStore((state) => state.saving);

  useEffect(() => {
    const api = window.interceptor;
    if (!readyToLoad || !api?.getCollection) {
      return;
    }
    void loadCollection();
    const unsubscribe = api.onCollectionChanged((change) => {
      void synchronizeExternalCollectionChange(change);
    });
    return () => {
      collectionLoadSequence += 1;
      unsubscribe();
    };
  }, [readyToLoad]);

  useEffect(() => {
    const api = window.interceptor;
    if (!readyToLoad || !loaded || saving || !api?.replaceCollection || nodes === savedNodes) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveCollection(nodes);
    }, COLLECTION_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [nodes, savedNodes, loaded, saving, readyToLoad]);
}

/** 把整棵集合导出成 JSON 文件；落盘路径由 Main 的系统对话框选择。 */
export async function exportCollection(title: string): Promise<boolean> {
  const api = window.interceptor;
  if (!api?.exportCollection) {
    return false;
  }
  return api.exportCollection(useComposerStore.getState().nodes, title);
}

/** 选择并分析一个集合 JSON；写入只在用户确认后发生。 */
export async function analyzeCollectionImport(
  title: string,
): Promise<CollectionImportPreview | null> {
  const api = window.interceptor;
  if (!api?.readImportFile) {
    return null;
  }
  const file = await api.readImportFile(title);
  if (!file) {
    return null;
  }
  if (!file.ok) {
    return { ok: false, reason: file.reason };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(file.content);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  const parsed = parseImportedCollection(payload);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  return {
    ok: true,
    fileName: file.fileName,
    nodes: parsed.nodes,
    folderCount: parsed.folderCount,
    leafCount: parsed.leafCount,
    skipped: parsed.skipped,
  };
}

/** 追加并持久化已清洗的集合节点；失败时不改本地集合。 */
export async function importCollection(
  nodes: readonly CollectionNode[],
): Promise<boolean> {
  const api = window.interceptor;
  if (!api?.replaceCollection || nodes.length === 0) {
    return false;
  }
  const store = useComposerStore.getState();
  const combined = [...store.nodes, ...nodes];
  try {
    const result = await api.replaceCollection(store.revision, combined);
    if (!result.ok) {
      return false;
    }
    useComposerStore.getState().importSucceeded(combined, result.revision);
    return true;
  } catch {
    return false;
  }
}

/** 发送一条请求；URL、头部与正文都按当前编辑态组装。 */
export async function sendRequest(request: CollectionRequest): Promise<void> {
  const api = window.interceptor;
  const store = useComposerStore.getState();
  if (!api?.sendComposerRequest) {
    return;
  }
  const url = buildRequestUrl(request);
  const headers = buildRequestHeaders(request);
  const contentType = defaultContentType(request);
  if (
    contentType
    && !headers.some((header) => header.name.toLowerCase() === 'content-type')
  ) {
    headers.push({ name: 'content-type', value: contentType });
  }

  store.beginSend(request.id);
  try {
    const response = await api.sendComposerRequest({
      method: request.method,
      url,
      headers,
      body: buildRequestBody(request),
      protocol: request.protocol,
    });
    useComposerStore
      .getState()
      .sendSucceeded(request.id, request.method, url, response);
  } catch (error) {
    useComposerStore
      .getState()
      .sendFailed(
        request.id,
        error instanceof Error ? error.message : String(error),
      );
  }
}
