import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../constants';
import { WorkspaceService } from '../entry';

describe('WorkspaceService TLS passthrough settings', () => {
  let dataDirectory: string;
  let workspaceService: WorkspaceService;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'interceptor-workspace-'));
    initializeRuntime([`--data-dir=${dataDirectory}`]);
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
  });

  afterEach(async () => {
    workspaceService.dispose();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('returns an empty default before the first save', () => {
    expect(workspaceService.loadTlsPassthroughSettings()).toEqual({
      revision: 0,
      hosts: [],
    });
  });

  it('normalizes, deduplicates, persists, and reloads host patterns', () => {
    expect(workspaceService.saveTlsPassthroughSettings(0, [
      ' EXAMPLE.com ',
      'example.com',
      '*.MÜNCHEN.example',
      '127.0.0.1',
    ])).toEqual({
      revision: 1,
      hosts: ['example.com', '*.xn--mnchen-3ya.example', '127.0.0.1'],
    });

    workspaceService.dispose();
    workspaceService = new WorkspaceService();
    workspaceService.initialize();

    expect(workspaceService.loadTlsPassthroughSettings()).toEqual({
      revision: 1,
      hosts: ['example.com', '*.xn--mnchen-3ya.example', '127.0.0.1'],
    });
  });

  it('rejects malformed patterns without advancing the revision', () => {
    expect(() => workspaceService.saveTlsPassthroughSettings(0, [
      'https://example.com',
    ])).toThrow('Invalid TLS passthrough host pattern');
    expect(workspaceService.loadTlsPassthroughSettings().revision).toBe(0);
  });

  it('rejects stale revisions and preserves the current document', () => {
    workspaceService.saveTlsPassthroughSettings(0, ['example.com']);

    expect(() => workspaceService.saveTlsPassthroughSettings(0, ['other.example']))
      .toThrow('Revision conflict on tls_passthrough_hosts');
    expect(workspaceService.loadTlsPassthroughSettings()).toEqual({
      revision: 1,
      hosts: ['example.com'],
    });
  });
});