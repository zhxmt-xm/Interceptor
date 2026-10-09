import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../../constants';
import { WorkspaceService } from '../../entry';

describe('WorkspaceService upstream settings', () => {
  let dataDirectory: string;
  let workspaceService: WorkspaceService;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'interceptor-upstream-settings-'));
    initializeRuntime([`--data-dir=${dataDirectory}`]);
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
  });

  afterEach(async () => {
    workspaceService.dispose();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('defaults to the original system configuration without inventing a proxy address', () => {
    expect(workspaceService.loadUpstreamSettings()).toEqual({ mode: 'system' });
  });

  it.each([
    { mode: 'system' },
    { mode: 'direct' },
    { mode: 'manual', protocol: 'http', host: 'proxy.example.test', port: 8080 },
    { mode: 'manual', protocol: 'https', host: 'proxy.example.test', port: 8443 },
    { mode: 'manual', protocol: 'socks5', host: '::1', port: 1080 },
    { mode: 'pac', url: 'https://proxy.example.test/rules.pac' },
    { mode: 'wpad' },
  ])('persists only the selected mode fields and reloads $mode after a Core restart', settings => {
    expect(workspaceService.saveUpstreamSettings(settings)).toEqual(settings);
    workspaceService.dispose();
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
    expect(workspaceService.loadUpstreamSettings()).toEqual(settings);
    expect(workspaceService.loadRuleSet()).toEqual({ revision: 0, nodes: [] });
    expect(workspaceService.loadDecryptionPreference()).toBe(false);
  });

  it('normalizes whitespace and host spelling before saving', () => {
    expect(workspaceService.saveUpstreamSettings({
      mode: 'manual', protocol: 'http', host: ' Proxy.EXAMPLE.test ', port: 3128,
    })).toEqual({ mode: 'manual', protocol: 'http', host: 'proxy.example.test', port: 3128 });
    expect(workspaceService.saveUpstreamSettings({
      mode: 'pac', url: ' https://proxy.example.test/rules.pac ',
    })).toEqual({ mode: 'pac', url: 'https://proxy.example.test/rules.pac' });
  });

  it.each([
    null,
    [],
    { mode: 'unknown' },
    { mode: 'direct', proxyUrl: 'http://proxy.example.test' },
    { mode: 'manual', protocol: 'ftp', host: 'proxy.example.test', port: 8080 },
    { mode: 'manual', protocol: 'http', host: 'https://proxy.example.test', port: 8080 },
    { mode: 'manual', protocol: 'http', host: 'name:password@proxy.example.test', port: 8080 },
    { mode: 'manual', protocol: 'http', host: '', port: 8080 },
    { mode: 'manual', protocol: 'http', host: 'proxy.example.test', port: 0 },
    { mode: 'manual', protocol: 'http', host: 'proxy.example.test', port: 65536 },
    { mode: 'manual', protocol: 'http', host: 'proxy.example.test', port: '8080' },
    { mode: 'pac', url: 'file:///tmp/proxy.pac' },
    { mode: 'pac', url: 'https://name:password@proxy.example.test/rules.pac' },
    { mode: 'pac', url: 'not-a-url' },
    { mode: 'wpad', url: 'https://proxy.example.test/rules.pac' },
  ])('rejects invalid external settings without replacing the saved route: %j', settings => {
    workspaceService.saveUpstreamSettings({ mode: 'direct' });
    expect(() => workspaceService.saveUpstreamSettings(settings)).toThrow('Invalid upstream settings');
    expect(workspaceService.loadUpstreamSettings()).toEqual({ mode: 'direct' });
  });
});
