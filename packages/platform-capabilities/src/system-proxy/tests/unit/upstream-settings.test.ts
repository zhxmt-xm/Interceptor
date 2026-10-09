import type { CoreProcessState, CoreResultForCommand, ProxyStatusResult, UpstreamProxySettings } from '@interceptor/core-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HelperService } from '../../../helper/entry';
import type { PlatformCapabilitiesOptions, PlatformCoreCommand, PlatformCoreRequest } from '../../../interfaces';
import { SystemProxyService } from '../../entry';
import { MacosSystemProxyService } from '../../macos/entry';
import { UpstreamProbe } from '../../internal/upstream-probe';
import { MacosHelperServiceClient } from '../../../helper/macos/helper-client';

describe('Main-owned upstream settings', () => {
  let persisted: UpstreamProxySettings;
  let applyFailure: Error | undefined;
  let releaseApply: (() => void) | undefined;
  let waitForApply: Promise<void> | undefined;
  let requestCore: ReturnType<typeof vi.fn<PlatformCoreRequest>>;
  let onUpstreamSettingsChanged: ReturnType<typeof vi.fn<() => void>>;
  let systemProxyService: SystemProxyService;
  let coreProcessState: CoreProcessState;
  const proxyStatus: ProxyStatusResult = { type: 'proxy.status', payload: {
    listening: true, recording: true, host: '127.0.0.1', port: 8888, sessionId: 'session', capturedExchanges: 0,
  } };

  function dispatch<Command extends PlatformCoreCommand>(command: Command): Promise<CoreResultForCommand<Command>>;
  async function dispatch(command: PlatformCoreCommand): Promise<CoreResultForCommand<PlatformCoreCommand>> {
    switch (command.type) {
      case 'proxy.status':
      case 'proxy.setUpstream': return proxyStatus;
      case 'upstream.getSettings': return { type: 'upstream.settings', payload: { settings: structuredClone(persisted) } };
      case 'upstream.applySettings':
        await waitForApply;
        if (applyFailure) throw applyFailure;
        persisted = structuredClone(command.payload.settings);
        return { type: 'upstream.settings', payload: { settings: persisted } };
      default: throw new Error(`Unexpected platform command: ${command.type}`);
    }
  }

  beforeEach(() => {
    vi.spyOn(UpstreamProbe.prototype, 'start').mockImplementation(() => undefined);
    persisted = { mode: 'system' };
    applyFailure = undefined;
    waitForApply = undefined;
    releaseApply = undefined;
    requestCore = vi.fn<PlatformCoreRequest>().mockImplementation(dispatch);
    onUpstreamSettingsChanged = vi.fn();
    coreProcessState = 'running';
    const options: PlatformCapabilitiesOptions = {
      platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profile',
      requestCore, getCoreProcessState: () => coreProcessState,
      diagnostics: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      secureStore: { isEncryptionAvailable: () => true, encryptString: vi.fn(), decryptString: vi.fn() },
      onUpstreamSettingsChanged,
    };
    systemProxyService = new SystemProxyService(options, new HelperService(options));
  });

  afterEach(() => {
    releaseApply?.();
    vi.restoreAllMocks();
  });

  it('reads saved settings without performing a system proxy operation', async () => {
    persisted = { mode: 'pac', url: 'https://proxy.example.test/config.pac' };
    const nativeEnable = vi.spyOn(MacosSystemProxyService.prototype, 'enable');
    const nativeRestore = vi.spyOn(MacosSystemProxyService.prototype, 'restore');
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: persisted, operation: 'idle', error: null,
    });
    expect(nativeEnable).not.toHaveBeenCalled();
    expect(nativeRestore).not.toHaveBeenCalled();
    expect(requestCore).toHaveBeenCalledExactlyOnceWith({ type: 'upstream.getSettings', payload: {} });
  });

  it('applies and broadcasts Direct without changing native system settings', async () => {
    const nativeEnable = vi.spyOn(MacosSystemProxyService.prototype, 'enable');
    const nativeRestore = vi.spyOn(MacosSystemProxyService.prototype, 'restore');
    const result = await systemProxyService.applyUpstreamSettings({ mode: 'direct' });
    expect(result).toMatchObject({ settings: { mode: 'direct' }, route: { kind: 'direct' }, operation: 'idle', error: null });
    expect(requestCore).toHaveBeenCalledWith({
      type: 'upstream.applySettings', payload: { settings: { mode: 'direct' }, upstream: null },
    });
    expect(persisted).toEqual({ mode: 'direct' });
    expect(nativeEnable).not.toHaveBeenCalled();
    expect(nativeRestore).not.toHaveBeenCalled();
    expect(onUpstreamSettingsChanged).toHaveBeenCalled();
  });

  it.each([
    { mode: 'manual', protocol: 'http', host: 'localhost', port: 8888 },
    { mode: 'manual', protocol: 'http', host: '127.1', port: 8888 },
    { mode: 'manual', protocol: 'socks5', host: '::ffff:127.0.0.1', port: 8888 },
    { mode: 'pac', url: 'http://127.0.0.1:8888/rules.pac' },
  ])('refuses a route back into the Core listener: %j', async settings => {
    await expect(systemProxyService.applyUpstreamSettings(settings)).rejects.toThrow('Interceptor');
    expect(requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
    expect(persisted).toEqual({ mode: 'system' });
  });

  it('does not report a successful Apply or change the previous settings when Core rejects it', async () => {
    await systemProxyService.applyUpstreamSettings({ mode: 'direct' });
    applyFailure = new Error('Core did not accept the upstream.');
    await expect(systemProxyService.applyUpstreamSettings({
      mode: 'pac', url: 'https://proxy.example.test/config.pac',
    })).rejects.toThrow('Core did not accept');
    expect(persisted).toEqual({ mode: 'direct' });
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'direct' }, route: { kind: 'direct' }, operation: 'idle',
      error: { kind: 'connection', message: 'Core did not accept the upstream.' },
    });
  });

  it('rejects overlapping Apply and Restore while Core is still applying', async () => {
    waitForApply = new Promise<void>(resolve => { releaseApply = resolve; });
    const pending = systemProxyService.applyUpstreamSettings({ mode: 'direct' });
    try {
      await expect.poll(() => requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(true);
      await expect(systemProxyService.applyUpstreamSettings({ mode: 'system' })).rejects.toMatchObject({ code: 'operation_in_progress' });
      await expect(systemProxyService.restore()).rejects.toMatchObject({ code: 'operation_in_progress' });
      expect(persisted).toEqual({ mode: 'system' });
    } finally {
      releaseApply?.();
      await pending;
    }
    expect(persisted).toEqual({ mode: 'direct' });
  });

  it('restores the saved route to a new Core generation without rewriting the preference', async () => {
    persisted = { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7891 };
    await systemProxyService.synchronizeCore();
    expect(requestCore).toHaveBeenCalledWith({ type: 'proxy.setUpstream', payload: { upstream: { proxyUrl: 'http://127.0.0.1:7891' } } });
    expect(requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: persisted, route: { kind: 'proxy', authority: '127.0.0.1:7891' },
    });
  });

  it('does not replace a chosen manual upstream with the detected system route during takeover', async () => {
    vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockResolvedValue({
      supported: true, enabled: true, owned: true, ownershipLost: false,
      proxyServer: '127.0.0.1:8888', bypassList: null, pacUrl: null, autoDetect: false,
    });
    await systemProxyService.applyUpstreamSettings({ mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7891 });
    requestCore.mockClear();
    await systemProxyService.enable();
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      route: { kind: 'proxy', authority: '127.0.0.1:7891' },
    });
    expect(requestCore.mock.calls.some(([command]) => command.type === 'proxy.setUpstream' && command.payload.upstream === null)).toBe(false);
  });

  it('restores system ownership without clearing or reapplying an explicit upstream', async () => {
    vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockResolvedValue({ restored: true, status: {
      supported: true, enabled: false, owned: false, ownershipLost: false,
      proxyServer: null, bypassList: null, pacUrl: null, autoDetect: false,
    } });
    await systemProxyService.applyUpstreamSettings({ mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7891 });
    requestCore.mockClear();
    await systemProxyService.restore();
    expect(requestCore).not.toHaveBeenCalled();
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      route: { kind: 'proxy', authority: '127.0.0.1:7891' },
    });
  });

  it('keeps the original system upstream for explicit proxy clients after restoring OS settings', async () => {
    vi.spyOn(MacosSystemProxyService.prototype, 'readUpstreamSource').mockResolvedValue({
      platform: 'darwin', settings: {
        HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 7890,
        HTTPSEnable: 1, HTTPSProxy: '127.0.0.1', HTTPSPort: 7890,
      },
    });
    vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockResolvedValue({ restored: true, status: {
      supported: true, enabled: true, owned: false, ownershipLost: false,
      proxyServer: '127.0.0.1:7890', bypassList: null, pacUrl: null, autoDetect: false,
    } });
    await systemProxyService.applyUpstreamSettings({ mode: 'system' });
    requestCore.mockClear();
    await systemProxyService.restore();
    expect(requestCore).not.toHaveBeenCalled();
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'system' }, route: { kind: 'proxy', authority: '127.0.0.1:7890' },
    });
  });

  it('loads crash ownership before Core is ready without trying to resolve a WPAD route', async () => {
    vi.spyOn(MacosSystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({ restored: false, status: {
      supported: true, enabled: true, owned: true, ownershipLost: false,
      proxyServer: '127.0.0.1:8888', bypassList: null, pacUrl: null, autoDetect: false,
    } });
    const resolveLegacy = vi.spyOn(MacosSystemProxyService.prototype, 'detectedUpstream')
      .mockImplementation(() => { throw new Error('WPAD route requires Core discovery.'); });
    await expect(systemProxyService.recoverAfterCrash()).resolves.toMatchObject({ restored: false, status: { owned: true } });
    expect(resolveLegacy).not.toHaveBeenCalled();
    expect(requestCore).not.toHaveBeenCalled();
  });

  it('applies the recovered PAC during the Core ready barrier and publishes it when running', async () => {
    coreProcessState = 'starting';
    vi.spyOn(MacosSystemProxyService.prototype, 'readUpstreamSource').mockResolvedValue({
      platform: 'darwin', settings: {
        ProxyAutoDiscoveryEnable: 1, ProxyAutoConfigEnable: 1, ProxyAutoConfigURLString: 'http://wpad/wpad.dat',
      },
    });
    await systemProxyService.synchronizeCore();
    expect(requestCore).toHaveBeenCalledWith({
      type: 'proxy.setUpstream', payload: { upstream: {
        httpProxyUrl: 'pac+http://wpad/wpad.dat', httpsProxyUrl: 'pac+http://wpad/wpad.dat',
        exceptions: [], excludeSimpleHostnames: false,
      } },
    });
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({ route: { kind: 'unavailable' } });
    onUpstreamSettingsChanged.mockClear();
    coreProcessState = 'running';
    await systemProxyService.updateCoreProcessStatus({ state: 'running' });
    expect(onUpstreamSettingsChanged).toHaveBeenCalledOnce();
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'system' }, route: { kind: 'pac', url: 'http://wpad/wpad.dat' }, health: 'not-applicable',
    });
  });

  it('does not turn a failed system WPAD discovery into a successful Direct route', async () => {
    vi.spyOn(MacosHelperServiceClient.prototype, 'readWpadDiscoveryInfo')
      .mockResolvedValue({ searchDomains: [], dhcpPacUrl: null });
    const source = { platform: 'darwin' as const, settings: { ProxyAutoDiscoveryEnable: 1 } };
    vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockImplementation(async (_host, _port, beforeTakeover) => {
      await beforeTakeover?.(source);
      throw new Error('Discovery should reject before changing system settings.');
    });
    vi.spyOn(MacosSystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({ restored: false, status: {
      supported: true, enabled: true, owned: false, ownershipLost: false,
      proxyServer: null, bypassList: null, pacUrl: null, autoDetect: true,
    } });
    await expect(systemProxyService.enable()).rejects.toThrow('No WPAD configuration');
    expect(requestCore.mock.calls.some(([command]) => command.type === 'proxy.setUpstream')).toBe(false);
    expect(await systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'system' }, route: { kind: 'unavailable' },
      error: { kind: 'discovery' },
    });
  });
});
