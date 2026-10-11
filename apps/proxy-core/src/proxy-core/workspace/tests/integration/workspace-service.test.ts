import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../../constants';
import { WorkspaceService } from '../../entry';

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

  it('creates missing database directories without depending on Capture initialization', async () => {
    workspaceService.dispose();
    const storageDirectory = path.join(dataDirectory, 'fresh-profile', 'storage');
    initializeRuntime([`--data-dir=${storageDirectory}`]);
    workspaceService = new WorkspaceService();

    workspaceService.initialize();

    expect((await stat(path.join(storageDirectory, 'workspace.sqlite'))).isFile()).toBe(true);
    expect(workspaceService.loadDecryptionPreference()).toBe(false);
    expect(workspaceService.loadRuleSet()).toEqual({ revision: 0, nodes: [] });
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

describe('WorkspaceService TLS settings that survive a restart', () => {
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

  /** 关掉连接再开一个，等价于 Core 重启后从磁盘读。 */
  const reopen = (): void => {
    workspaceService.dispose();
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
  };

  it('starts with no insecure host exceptions', () => {
    expect(workspaceService.loadInsecureHosts()).toEqual([]);
  });

  it('normalizes, deduplicates, and reloads insecure hosts', () => {
    expect(workspaceService.saveInsecureHosts([
      ' EXAMPLE.com ',
      'example.com',
      '',
      'origin.internal',
    ])).toEqual(['example.com', 'origin.internal']);

    reopen();

    expect(workspaceService.loadInsecureHosts()).toEqual([
      'example.com',
      'origin.internal',
    ]);
  });

  it('overwrites insecure hosts without a revision conflict', () => {
    workspaceService.saveInsecureHosts(['first.example']);
    expect(workspaceService.saveInsecureHosts(['second.example']))
      .toEqual(['second.example']);
  });

  it('starts with HTTPS decryption off on a fresh profile', () => {
    expect(workspaceService.loadDecryptionPreference()).toBe(false);
  });

  it('remembers that the user turned HTTPS decryption on', () => {
    workspaceService.enableDecryptionPreference();
    reopen();
    expect(workspaceService.loadDecryptionPreference()).toBe(true);
  });

  it('remembers that the user turned HTTPS decryption back off', () => {
    workspaceService.enableDecryptionPreference();
    workspaceService.disableDecryptionPreference();
    reopen();
    expect(workspaceService.loadDecryptionPreference()).toBe(false);
  });
});