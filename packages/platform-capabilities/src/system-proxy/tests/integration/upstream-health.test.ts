import { once } from 'node:events';
import net from 'node:net';

import type { CoreResultForCommand, ProxyStatusResult, UpstreamProxySettings } from '@interceptor/core-protocol';
import { expect, it, vi } from 'vitest';

import { HelperService } from '../../../helper/entry';
import type { PlatformCapabilitiesOptions, PlatformCoreCommand } from '../../../interfaces';
import { SystemProxyService } from '../../entry';
import { MacosSystemProxyService } from '../../macos/entry';

it.runIf(process.platform === 'darwin')('reports a lost macOS upstream without silently switching Core to direct', async () => {
  let connections = 0;
  const server = net.createServer(socket => { connections += 1; socket.end(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Upstream has no TCP address.');
  const requests: PlatformCoreCommand[] = [];
  let settings: UpstreamProxySettings = { mode: 'system' };
  const status: ProxyStatusResult = { type: 'proxy.status', payload: {
    listening: true, recording: true, host: '127.0.0.1', port: 8888, sessionId: 'session', capturedExchanges: 0,
  } };
  function requestCore<Command extends PlatformCoreCommand>(command: Command): Promise<CoreResultForCommand<Command>>;
  async function requestCore(command: PlatformCoreCommand): Promise<CoreResultForCommand<PlatformCoreCommand>> {
    requests.push(command);
    switch (command.type) {
      case 'proxy.status':
      case 'proxy.setUpstream': return status;
      case 'upstream.getSettings': return { type: 'upstream.settings', payload: { settings } };
      case 'upstream.applySettings':
        settings = command.payload.settings;
        return { type: 'upstream.settings', payload: { settings } };
      default: throw new Error(`Unexpected command: ${command.type}`);
    }
  }
  const nativeStatus = { supported: true, enabled: false, owned: false, ownershipLost: false,
    proxyServer: null, bypassList: null, pacUrl: null, autoDetect: false };
  vi.spyOn(MacosSystemProxyService.prototype, 'status').mockResolvedValue(nativeStatus);
  vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockResolvedValue({ restored: false, status: nativeStatus });
  const options: PlatformCapabilitiesOptions = {
    platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profile',
    requestCore, getCoreProcessState: () => 'running',
    diagnostics: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    secureStore: { isEncryptionAvailable: () => true, encryptString: vi.fn(), decryptString: vi.fn() },
  };
  const systemProxyService = new SystemProxyService(options, new HelperService(options));
  try {
    await systemProxyService.applyUpstreamSettings({ mode: 'manual', protocol: 'http', host: '127.0.0.1', port: address.port });
    await expect.poll(() => connections).toBeGreaterThan(0);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await expect.poll(async () => (await systemProxyService.getUpstreamSettings()).health, { timeout: 3_000 }).toBe('unreachable');
    expect(requests.some(command => command.type === 'proxy.setUpstream' && command.payload.upstream === null)).toBe(false);
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: address.port },
      route: { kind: 'proxy', authority: `127.0.0.1:${address.port}` }, health: 'unreachable',
    });
  } finally {
    await systemProxyService.stop();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    vi.restoreAllMocks();
  }
});
