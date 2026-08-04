import { create } from 'zustand';

import type { ComposerResponse } from '../../../../shared/desktop-api';
import { HISTORY_LIMIT } from '../constants';
import type {
  CollectionNode,
  CollectionRequest,
  DocumentRuntime,
  FolderMenuAnchor,
  HistoryEntry,
  RequestTab,
  ResponseTab,
} from '../interfaces';
import {
  appendNode,
  collectRequestIds,
  newFolder,
  newRequest,
  nextId,
  removeNode,
  renameNode,
  replaceRequest,
} from '../utils';

/** 文档新打开时的运行态：无响应，请求页签停在 Headers。 */
const INITIAL_RUNTIME: DocumentRuntime = {
  response: null,
  sending: false,
  sendError: null,
  requestTab: 'headers',
  responseTab: 'body',
};

interface ComposerStore {
  /** 持久化的集合树；编辑即写回，由 useCollection 节流保存。 */
  nodes: CollectionNode[];
  /** 集合的乐观并发版本；replace 成功后由 Core 回传更新。 */
  revision: number;
  /** 集合是否已从 Core 载入，未载入时不触发保存。 */
  loaded: boolean;
  /** 已展开的目录 ID。 */
  expandedFolders: string[];
  /** 新建请求/子目录的落点目录；null 表示根。 */
  targetFolderId: string | null;
  /** Collection 分栏是否展开。 */
  collectionOpen: boolean;
  /** 正在重命名的节点 ID。 */
  renamingNodeId: string | null;
  /** 打开的目录操作菜单。 */
  folderMenu: FolderMenuAnchor | null;
  /** Recent sends 弹层是否打开。 */
  historyOpen: boolean;

  /** 打开的文档（请求 ID 列表，顺序即标签顺序）。 */
  openRequestIds: string[];
  /** 当前激活的文档。 */
  activeRequestId: string | null;
  /** 按文档隔离的运行态。 */
  runtimes: Record<string, DocumentRuntime>;
  /** 内存中的重放记录。 */
  history: HistoryEntry[];

  /** 用 Core 返回的集合替换本地树，并丢弃指向已删除请求的文档。 */
  loadCollection(nodes: CollectionNode[], revision: number): void;
  /** 记录一次成功保存后的新版本。 */
  markSaved(revision: number): void;

  /** 就地更新一条请求。 */
  updateRequest(request: CollectionRequest): void;
  /** 在落点目录下新建请求并打开它。 */
  createRequest(): void;
  /** 在落点目录下新建子目录并进入重命名。 */
  createFolder(name: string): void;
  /** 重命名任意节点。 */
  renameNode(nodeId: string, name: string): void;
  /** 删除任意节点（目录连同子树），并关闭受影响的文档。 */
  deleteNode(nodeId: string): void;

  toggleFolder(folderId: string): void;
  setTargetFolder(folderId: string | null): void;
  setCollectionOpen(open: boolean): void;
  setRenamingNode(nodeId: string | null): void;
  setFolderMenu(anchor: FolderMenuAnchor | null): void;
  setHistoryOpen(open: boolean): void;

  openRequest(requestId: string): void;
  closeRequest(requestId: string): void;
  setActiveRequest(requestId: string): void;
  setRequestTab(requestId: string, tab: RequestTab): void;
  setResponseTab(requestId: string, tab: ResponseTab): void;

  beginSend(requestId: string): void;
  sendSucceeded(
    requestId: string,
    method: string,
    url: string,
    response: ComposerResponse,
  ): void;
  sendFailed(requestId: string, message: string): void;
  clearHistory(): void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  nodes: [],
  revision: 0,
  loaded: false,
  expandedFolders: [],
  targetFolderId: null,
  collectionOpen: true,
  renamingNodeId: null,
  folderMenu: null,
  historyOpen: false,

  openRequestIds: [],
  activeRequestId: null,
  runtimes: {},
  history: [],

  loadCollection: (nodes, revision) =>
    set((state) => {
      const alive = new Set(collectRequestIds(nodes));
      const openRequestIds = state.openRequestIds.filter((id) => alive.has(id));
      return {
        nodes,
        revision,
        loaded: true,
        // 首次载入展开全部顶层目录，让集合内容直接可见。
        expandedFolders: state.loaded
          ? state.expandedFolders
          : nodes.filter((node) => node.kind === 'folder').map((node) => node.id),
        openRequestIds,
        activeRequestId:
          state.activeRequestId && alive.has(state.activeRequestId)
            ? state.activeRequestId
            : openRequestIds[0] ?? null,
      };
    }),

  markSaved: (revision) => set({ revision }),

  updateRequest: (request) =>
    set((state) => ({ nodes: replaceRequest(state.nodes, request) })),

  createRequest: () =>
    set((state) => {
      const request = newRequest();
      return {
        nodes: appendNode(state.nodes, state.targetFolderId, request),
        openRequestIds: [...state.openRequestIds, request.id],
        activeRequestId: request.id,
        runtimes: { ...state.runtimes, [request.id]: INITIAL_RUNTIME },
      };
    }),

  createFolder: (name) =>
    set((state) => {
      const folder = newFolder(name);
      return {
        nodes: appendNode(state.nodes, state.targetFolderId, folder),
        expandedFolders: [...state.expandedFolders, folder.id],
        renamingNodeId: folder.id,
        folderMenu: null,
      };
    }),

  renameNode: (nodeId, name) =>
    set((state) => ({
      nodes: renameNode(state.nodes, nodeId, name),
      renamingNodeId: null,
    })),

  deleteNode: (nodeId) =>
    set((state) => {
      const nodes = removeNode(state.nodes, nodeId);
      const alive = new Set(collectRequestIds(nodes));
      const openRequestIds = state.openRequestIds.filter((id) => alive.has(id));
      return {
        nodes,
        openRequestIds,
        activeRequestId:
          state.activeRequestId && alive.has(state.activeRequestId)
            ? state.activeRequestId
            : openRequestIds[0] ?? null,
        targetFolderId:
          state.targetFolderId === nodeId ? null : state.targetFolderId,
        folderMenu: null,
      };
    }),

  toggleFolder: (folderId) =>
    set((state) => ({
      expandedFolders: state.expandedFolders.includes(folderId)
        ? state.expandedFolders.filter((id) => id !== folderId)
        : [...state.expandedFolders, folderId],
    })),

  setTargetFolder: (targetFolderId) => set({ targetFolderId }),
  setCollectionOpen: (collectionOpen) => set({ collectionOpen }),
  setRenamingNode: (renamingNodeId) => set({ renamingNodeId, folderMenu: null }),
  setFolderMenu: (folderMenu) => set({ folderMenu }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),

  openRequest: (requestId) =>
    set((state) => ({
      openRequestIds: state.openRequestIds.includes(requestId)
        ? state.openRequestIds
        : [...state.openRequestIds, requestId],
      activeRequestId: requestId,
      runtimes: state.runtimes[requestId]
        ? state.runtimes
        : { ...state.runtimes, [requestId]: INITIAL_RUNTIME },
    })),

  closeRequest: (requestId) =>
    set((state) => {
      const openRequestIds = state.openRequestIds.filter(
        (id) => id !== requestId,
      );
      const { [requestId]: closed, ...runtimes } = state.runtimes;
      void closed;
      return {
        openRequestIds,
        runtimes,
        activeRequestId:
          state.activeRequestId === requestId
            ? openRequestIds.at(-1) ?? null
            : state.activeRequestId,
      };
    }),

  setActiveRequest: (activeRequestId) => set({ activeRequestId }),

  setRequestTab: (requestId, requestTab) =>
    set((state) => ({
      runtimes: patchRuntime(state.runtimes, requestId, { requestTab }),
    })),

  setResponseTab: (requestId, responseTab) =>
    set((state) => ({
      runtimes: patchRuntime(state.runtimes, requestId, { responseTab }),
    })),

  beginSend: (requestId) =>
    set((state) => ({
      runtimes: patchRuntime(state.runtimes, requestId, {
        sending: true,
        sendError: null,
      }),
      historyOpen: false,
    })),

  sendSucceeded: (requestId, method, url, response) =>
    set((state) => ({
      runtimes: patchRuntime(state.runtimes, requestId, {
        sending: false,
        sendError: response.ok ? null : response.error ?? 'Request failed.',
        response,
        responseTab: 'body',
      }),
      history: [
        {
          id: nextId('hist'),
          method,
          url,
          at: Date.now(),
          status: response.status,
          ok: response.ok,
          durationMs: response.durationMs,
        },
        ...state.history,
      ].slice(0, HISTORY_LIMIT),
    })),

  sendFailed: (requestId, sendError) =>
    set((state) => ({
      runtimes: patchRuntime(state.runtimes, requestId, {
        sending: false,
        sendError,
      }),
    })),

  clearHistory: () => set({ history: [], historyOpen: false }),
}));

/** 只改一个文档的运行态，其余文档保持同一对象引用。 */
function patchRuntime(
  runtimes: Record<string, DocumentRuntime>,
  requestId: string,
  patch: Partial<DocumentRuntime>,
): Record<string, DocumentRuntime> {
  return {
    ...runtimes,
    [requestId]: { ...(runtimes[requestId] ?? INITIAL_RUNTIME), ...patch },
  };
}

/** 读取一个文档的运行态；未打开过时给出初始值，避免调用方处理 undefined。 */
export function readRuntime(
  runtimes: Record<string, DocumentRuntime>,
  requestId: string | null,
): DocumentRuntime {
  return (requestId && runtimes[requestId]) || INITIAL_RUNTIME;
}
