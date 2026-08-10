import { beforeEach, describe, expect, it } from 'vitest';

import {
  collectLeafIds,
  findNode,
  isFolder,
  type CollectionFolder,
  type CollectionNode,
  type CollectionRequest,
} from '@interceptor/core-protocol';

import { useComposerStore } from '../data/composerStore';

function request(id: string): CollectionRequest {
  return {
    kind: 'request',
    id,
    name: id,
    method: 'GET',
    url: '',
    protocol: 'auto',
    query: [],
    headers: [],
    bodyType: 'none',
    bodyText: '',
    bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

function folder(id: string, children: CollectionNode[] = []): CollectionFolder {
  return { kind: 'folder', id, name: id, children };
}

function seed(nodes: CollectionNode[], targetFolderId: string | null = null): void {
  useComposerStore.setState({
    nodes,
    revision: 1,
    loaded: true,
    expandedFolders: [],
    targetFolderId,
    renamingNodeId: null,
    openRequestIds: [],
    activeRequestId: null,
    runtimes: {},
  });
}

describe('composerStore collection tree', () => {
  beforeEach(() => seed([]));

  it('moves a request into a folder at the requested sibling position', () => {
    seed([folder('group', [request('inside')]), request('outside')]);

    useComposerStore.getState().moveNode('outside', {
      parentId: 'group',
      beforeId: 'inside',
    });

    const group = findNode(useComposerStore.getState().nodes, 'group');
    expect(group && isFolder(group) ? collectLeafIds(group.children) : []).toEqual([
      'outside',
      'inside',
    ]);
  });

  it('moves a folder together with its complete subtree', () => {
    seed([
      folder('source', [folder('nested', [request('leaf')])]),
      folder('target'),
    ]);

    useComposerStore.getState().moveNode('source', {
      parentId: 'target',
      beforeId: null,
    });

    const target = findNode(useComposerStore.getState().nodes, 'target');
    expect(target && isFolder(target) ? collectLeafIds(target.children) : []).toEqual([
      'leaf',
    ]);
    expect(useComposerStore.getState().nodes.map((node) => node.id)).toEqual([
      'target',
    ]);
  });

  it('refuses moves and folder creation that would exceed three levels', () => {
    seed([
      folder('level1', [folder('level2', [folder('level3', [request('deep')])])]),
      folder('spare', [folder('spare-child')]),
    ]);

    useComposerStore.getState().moveNode('spare', {
      parentId: 'level3',
      beforeId: null,
    });
    expect(useComposerStore.getState().nodes.map((node) => node.id)).toEqual([
      'level1',
      'spare',
    ]);

    useComposerStore.setState({ targetFolderId: 'level3' });
    useComposerStore.getState().createFolder('blocked');
    expect(findNode(useComposerStore.getState().nodes, 'level3')).toMatchObject({
      children: [expect.objectContaining({ id: 'deep' })],
    });
  });

  it('auto-expands a folder idempotently', () => {
    seed([folder('group')]);

    useComposerStore.getState().expandFolder('group');
    useComposerStore.getState().expandFolder('group');

    expect(useComposerStore.getState().expandedFolders).toEqual(['group']);
  });
});

describe('composerStore selection', () => {
  it('keeps the open request when a folder becomes the new-item target', () => {
    seed([folder('group'), request('draft')]);
    useComposerStore.getState().openRequest('draft');

    useComposerStore.getState().setTargetFolder('group');

    expect(useComposerStore.getState().targetFolderId).toBe('group');
    expect(useComposerStore.getState().activeRequestId).toBe('draft');
  });
});