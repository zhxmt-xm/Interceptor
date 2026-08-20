import { beforeEach, describe, expect, it } from 'vitest';

import {
  collectLeafIds,
  findNode,
  isFolder,
  type CollectionFolder,
  type CollectionNode,
  type CollectionRequest,
} from '@interceptor/core-protocol';

import type { ComposerResponse } from '../../../../../shared/desktop-api';
import { useComposerStore } from '../../data/composerStore';

function response(body: string): ComposerResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    httpVersion: 'h1',
    headers: [{ name: 'content-type', value: 'text/html' }],
    body: new TextEncoder().encode(body),
    totalBytes: body.length,
    durationMs: 1,
    timing: {
      dnsMs: 0,
      tcpMs: 0,
      tlsMs: 0,
      requestMs: 0,
      waitingMs: 0,
      downloadMs: 0,
      totalMs: 1,
    },
    tls: null,
    remoteAddress: null,
  };
}

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

  it('appends imported nodes after the existing collection', () => {
    seed([request('local')]);

    useComposerStore.getState().importSucceeded([
      request('local'),
      request('imported'),
    ], 2);

    expect(useComposerStore.getState().nodes.map((node) => node.id)).toEqual([
      'local',
      'imported',
    ]);
    expect(useComposerStore.getState().revision).toBe(2);
  });

  it('keeps the imported folder structure intact', () => {
    seed([]);

    useComposerStore.getState().importSucceeded([
      folder('group', [request('inside')]),
    ], 2);

    const group = findNode(useComposerStore.getState().nodes, 'group');
    expect(group && isFolder(group) ? collectLeafIds(group.children) : []).toEqual([
      'inside',
    ]);
  });

  it('does not change the active document or new-item target', () => {
    seed([folder('target'), request('local')], 'target');
    useComposerStore.getState().openRequest('local');
    useComposerStore.getState().setTargetFolder('target');

    useComposerStore.getState().importSucceeded([
      folder('target'),
      request('local'),
      request('imported'),
    ], 2);

    const state = useComposerStore.getState();
    expect(state.activeRequestId).toBe('local');
    expect(state.openRequestIds).toEqual(['local']);
    expect(state.targetFolderId).toBe('target');
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

  it('selecting a request clears the folder target while keeping one active document', () => {
    seed([folder('group', [request('inside')]), request('outside')], 'group');

    useComposerStore.getState().openRequest('outside');

    expect(useComposerStore.getState().targetFolderId).toBeNull();
    expect(useComposerStore.getState().activeRequestId).toBe('outside');
    expect(useComposerStore.getState().openRequestIds).toEqual(['outside']);
  });

  it('clears only the selected folder when collection whitespace is clicked', () => {
    seed([folder('group'), request('draft')]);
    useComposerStore.getState().openRequest('draft');
    useComposerStore.getState().setTargetFolder('group');

    useComposerStore.getState().clearSelection();

    expect(useComposerStore.getState().targetFolderId).toBeNull();
    expect(useComposerStore.getState().activeRequestId).toBe('draft');
  });

  it('creates new nodes beside the selected request', () => {
    seed([folder('group', [request('inside')])]);
    useComposerStore.getState().openRequest('inside');

    useComposerStore.getState().createRequest();
    useComposerStore.getState().openRequest('inside');
    useComposerStore.getState().createFolder('Sibling folder');

    const group = findNode(useComposerStore.getState().nodes, 'group');
    expect(group && isFolder(group) ? group.children : []).toEqual([
      expect.objectContaining({ id: 'inside' }),
      expect.objectContaining({ kind: 'request' }),
      expect.objectContaining({ kind: 'folder', name: 'Sibling folder' }),
    ]);
  });
});

describe('composerStore response formatting cache', () => {
  beforeEach(() => seed([request('draft')]));

  it('keeps a formatted view only for the response that produced it', () => {
    const firstResponse = response('<main></main>');
    useComposerStore.getState().sendSucceeded(
      'draft',
      'GET',
      'https://example.test',
      firstResponse,
    );

    useComposerStore.getState().cacheFormattedResponseBody(
      'draft',
      firstResponse,
      '<main>\n</main>',
    );
    expect(useComposerStore.getState().runtimes.draft).toMatchObject({
      formattedResponseBody: '<main>\n</main>',
    });

    const secondResponse = response('<aside></aside>');
    useComposerStore.getState().sendSucceeded(
      'draft',
      'GET',
      'https://example.test',
      secondResponse,
    );
    expect(useComposerStore.getState().runtimes.draft).toMatchObject({
      formattedResponseBody: null,
    });

    useComposerStore.getState().cacheFormattedResponseBody(
      'draft',
      firstResponse,
      '<stale></stale>',
    );
    expect(useComposerStore.getState().runtimes.draft).toMatchObject({
      formattedResponseBody: null,
    });

    useComposerStore.getState().closeRequest('draft');
    expect(useComposerStore.getState().runtimes.draft).toBeUndefined();

    const thirdResponse = response('<footer></footer>');
    useComposerStore.getState().sendSucceeded(
      'draft',
      'GET',
      'https://example.test',
      thirdResponse,
    );
    useComposerStore.getState().cacheFormattedResponseBody(
      'draft',
      thirdResponse,
      '<footer>\n</footer>',
    );
    useComposerStore.getState().deleteNode('draft');
    expect(useComposerStore.getState().runtimes.draft).toBeUndefined();
  });
});