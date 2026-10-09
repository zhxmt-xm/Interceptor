import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { UpstreamProxyConfig, UpstreamProxySettings } from '@interceptor/core-protocol';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeRuntime } from '../../constants';
import { CoreApplication } from '../../core-application';
import { CaptureService } from '../../capture/entry';
import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/internal/capture-event-queue';
import { WorkspaceService } from '../../workspace/entry';

describe('Core upstream settings commands', () => {
  let dataDirectory: string;
  let workspaceService: WorkspaceService;
  let captureService: CaptureService;
  let proxyService: ProxyService;
  let coreApplication: CoreApplication;
  let origin: http.Server | undefined;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'interceptor-upstream-command-'));
    initializeRuntime([`--data-dir=${dataDirectory}`]);
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
    captureService = new CaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue());
    coreApplication = new CoreApplication({ on: vi.fn(), postMessage: vi.fn() }, {
      workspaceService, captureService, proxyService,
    });
  });

  afterEach(async () => {
    await proxyService.stop();
    await captureService.dispose();
    workspaceService.dispose();
    if (origin) {
      origin.closeAllConnections();
      await new Promise<void>((resolve, reject) => origin!.close(error => error ? reject(error) : resolve()));
      origin = undefined;
    }
    vi.restoreAllMocks();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('reads the persistent mode without changing runtime routing', async () => {
    const configure = vi.spyOn(proxyService, 'setUpstreamProxy');
    const result = await coreApplication.executeCommand({ type: 'upstream.getSettings', payload: {} }, new AbortController().signal);
    expect(result).toEqual({ type: 'upstream.settings', payload: { settings: { mode: 'system' } } });
    expect(configure).not.toHaveBeenCalled();
  });

  it('applies Direct without stopping the listener or clearing captured data', async () => {
    const configure = vi.spyOn(proxyService, 'setUpstreamProxy');
    const stop = vi.spyOn(proxyService, 'stop');
    const result = await coreApplication.executeCommand({
      type: 'upstream.applySettings', payload: { settings: { mode: 'direct' }, upstream: null },
    }, new AbortController().signal);
    expect(result).toEqual({ type: 'upstream.settings', payload: { settings: { mode: 'direct' } } });
    expect(workspaceService.loadUpstreamSettings()).toEqual({ mode: 'direct' });
    expect(configure).toHaveBeenCalledExactlyOnceWith(null);
    expect(stop).not.toHaveBeenCalled();
  });

  it('leaves the active route alone when settings persistence fails', async () => {
    vi.spyOn(workspaceService, 'saveUpstreamSettings').mockImplementation(() => { throw new Error('workspace-write-failed'); });
    const configure = vi.spyOn(proxyService, 'setUpstreamProxy');
    await expect(coreApplication.executeCommand({
      type: 'upstream.applySettings', payload: { settings: { mode: 'direct' }, upstream: null },
    }, new AbortController().signal)).rejects.toThrow('workspace-write-failed');
    expect(configure).not.toHaveBeenCalled();
    expect(workspaceService.loadUpstreamSettings()).toEqual({ mode: 'system' });
  });

  it('does not persist a cancelled Apply', async () => {
    const controller = new AbortController();
    controller.abort();
    const save = vi.spyOn(workspaceService, 'saveUpstreamSettings');
    const configure = vi.spyOn(proxyService, 'setUpstreamProxy');
    await expect(coreApplication.executeCommand({
      type: 'upstream.applySettings', payload: { settings: { mode: 'direct' }, upstream: null },
    }, controller.signal)).rejects.toThrow('cancelled');
    expect(save).not.toHaveBeenCalled();
    expect(configure).not.toHaveBeenCalled();
  });

  it.each([
    { valid: true, mode: 'pac' },
    { valid: false, mode: 'pac' },
    { valid: true, mode: 'system' },
    { valid: false, mode: 'system' },
  ] as const)('validates the actual PAC before committing the route ($mode, valid=$valid)', async ({ valid, mode }) => {
    let downloads = 0;
    origin = http.createServer((_request, response) => {
      downloads += 1;
      response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' });
      response.end(valid ? 'function FindProxyForURL(url, host) { return "DIRECT"; }' : 'function FindProxyForURL( {');
    });
    origin.listen(0, '127.0.0.1');
    await once(origin, 'listening');
    const address = origin.address();
    if (!address || typeof address === 'string') throw new Error('PAC origin has no TCP address.');
    const url = `http://127.0.0.1:${address.port}/proxy.pac`;
    const settings: UpstreamProxySettings = mode === 'pac' ? { mode, url } : { mode };
    const upstream: UpstreamProxyConfig = mode === 'pac' ? { proxyUrl: `pac+${url}` } : {
      httpProxyUrl: `pac+${url}`, httpsProxyUrl: `pac+${url}`, exceptions: [], excludeSimpleHostnames: false,
    };
    const configure = vi.spyOn(proxyService, 'setUpstreamProxy');
    const applying = coreApplication.executeCommand({
      type: 'upstream.applySettings', payload: { settings, upstream },
    }, new AbortController().signal);
    if (valid) {
      await expect(applying).resolves.toEqual({ type: 'upstream.settings', payload: { settings } });
      expect(workspaceService.loadUpstreamSettings()).toEqual(settings);
      expect(configure).toHaveBeenCalledExactlyOnceWith(upstream);
    } else {
      await expect(applying).rejects.toThrow('PAC');
      expect(workspaceService.loadUpstreamSettings()).toEqual({ mode: 'system' });
      expect(configure).not.toHaveBeenCalled();
    }
    expect(downloads).toBe(1);
  });
});
