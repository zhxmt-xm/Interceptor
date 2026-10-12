import path from 'node:path';
import type { CoreProcessState, CoreResultForCommand, ProxyStatusResult, UpstreamProxySettings } from '@interceptor/core-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HelperService } from '../../../../helper/entry';
import type { PlatformCapabilitiesOptions, PlatformCoreCommand, PlatformCoreRequest } from '../../../../interfaces';
import { SystemProxyService } from '../../../entry';
import type { WinInetProxySettings } from '../../../interfaces';
import { SystemProxyError, WpadNotFoundError } from '../../../internal/errors';
import { UpstreamProbe } from '../../../internal/upstream-probe';
import { WindowsSystemProxyService } from '../../entry';

interface NativeReply {
  stdout: string;
  stderr: string;
  error: Error | null;
}

interface NativeFixture {
  calls: { command: string; args: readonly string[]; options: Readonly<Record<string, unknown>> }[];
  settings: WinInetProxySettings;
  discovery: NativeReply;
  delayDiscovery: boolean;
  completeDiscovery: (() => void) | null;
}

const native = vi.hoisted((): NativeFixture => ({
  calls: [],
  settings: { flags: 9, proxyEnabled: false, autoDetect: true, proxyServer: null, bypassList: null, pacUrl: null },
  discovery: { stdout: '', stderr: '', error: null },
  delayDiscovery: false,
  completeDiscovery: null,
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile(
      command: string,
      args: readonly string[],
      options: Readonly<Record<string, unknown>>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) {
      native.calls.push({ command, args: [...args], options });
      const reply = args[0] === 'get'
        ? { stdout: JSON.stringify(native.settings), stderr: '', error: null }
        : args[0] === 'discover-wpad' ? native.discovery
          : { stdout: '', stderr: '', error: new Error(`Unexpected native command: ${args[0]}`) };
      const complete = () => {
        native.completeDiscovery = null;
        callback(reply.error, reply.stdout, reply.stderr);
      };
      if (args[0] === 'discover-wpad' && native.delayDiscovery) native.completeDiscovery = complete;
      else queueMicrotask(complete);
      return new actual.ChildProcess();
    },
  };
});

const PAC_URL = 'http://wpad.office.example.test/wpad.dat';
const HELPER_PATH = 'C:\\fixture\\native resources\\system-proxy\\wininet-proxy-helper.exe';
const PROXY_STATUS: ProxyStatusResult = { type: 'proxy.status', payload: {
  listening: true, recording: true, host: '127.0.0.1', port: 8888, sessionId: 'session', capturedExchanges: 0,
} };

beforeEach(() => {
  native.calls = [];
  native.settings = settings();
  native.discovery = { stdout: JSON.stringify({ pacUrl: PAC_URL }), stderr: '', error: null };
  native.delayDiscovery = false;
  native.completeDiscovery = null;
  vi.spyOn(UpstreamProbe.prototype, 'start').mockImplementation(() => undefined);
});

afterEach(() => {
  native.completeDiscovery?.();
  vi.restoreAllMocks();
});

describe('Windows native WPAD discovery', () => {
  it('returns the native PAC URL through one bounded read-only helper invocation', async () => {
    const windowsSystemProxyService = new WindowsSystemProxyService({ platform: 'win32', helperPath: HELPER_PATH });
    await expect(windowsSystemProxyService.discoverWpadPacUrl()).resolves.toBe(PAC_URL);
    expect(native.calls).toEqual([{
      command: HELPER_PATH,
      args: ['discover-wpad'],
      options: { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 },
    }]);
  });

  it('maps native autodetection failure to the shared discovery error', async () => {
    failDiscovery(12180);
    await expect(createWindowsService().discoverWpadPacUrl()).rejects.toBeInstanceOf(WpadNotFoundError);
  });

  it('preserves a different Win32 failure instead of treating it as an absent PAC', async () => {
    failDiscovery(8);
    await expect(createWindowsService().discoverWpadPacUrl()).rejects.toThrow('Win32 error 8');
  });

  it('reports a terminated discovery deadline explicitly', async () => {
    native.discovery.error = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM', code: null });
    await expect(createWindowsService().discoverWpadPacUrl()).rejects.toThrow('timed out after 30000 ms');
  });

  it.each(['ENOENT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'])('preserves execution failure %s', async code => {
    const error = Object.assign(new Error(code), { code, killed: true, signal: 'SIGTERM' });
    native.discovery.error = error;
    await expect(createWindowsService().discoverWpadPacUrl()).rejects.toBe(error);
  });

  it.each(['not-json', '{}', '{"pacUrl":null}', '{"pacUrl":""}', '{"pacUrl":1}', '{"pacUrl":"http://wpad/wpad.dat","extra":true}'])(
    'rejects an invalid native success response: %s', async stdout => {
      native.discovery.stdout = stdout;
      await expect(createWindowsService().discoverWpadPacUrl()).rejects.toThrow('invalid WPAD response');
    },
  );

  it.each(['not-json', '{}', '{"win32Error":"12180"}', '{"win32Error":0}', '{"win32Error":12180,"extra":true}'])(
    'rejects an invalid native failure response: %s', async stderr => {
      failDiscovery(12180);
      native.discovery.stderr = stderr;
      await expect(createWindowsService().discoverWpadPacUrl()).rejects.toThrow('invalid WPAD error response');
    },
  );

  it('rejects unsupported hosts without executing the Windows helper', async () => {
    const windowsSystemProxyService = new WindowsSystemProxyService({ platform: 'linux', helperPath: HELPER_PATH });
    await expect(windowsSystemProxyService.discoverWpadPacUrl()).rejects.toBeInstanceOf(SystemProxyError);
    expect(native.calls).toEqual([]);
  });
});

describe('Windows discovery behind the shared upstream API', () => {
  it('applies explicit WPAD without requiring the WinINet Auto Detect setting', async () => {
    native.settings = settings({ flags: 1 });
    const fixture = createMainService();
    const result = await fixture.systemProxyService.applyUpstreamSettings({ mode: 'wpad' });
    expect(result).toMatchObject({
      settings: { mode: 'wpad' }, route: { kind: 'pac', url: PAC_URL },
      operation: 'idle', health: 'not-applicable', error: null,
    });
    expect(fixture.requestCore).toHaveBeenCalledWith({
      type: 'upstream.applySettings',
      payload: { settings: { mode: 'wpad' }, upstream: { proxyUrl: `pac+${PAC_URL}` } },
    });
    expect(native.calls.map(call => call.args[0])).toEqual(['discover-wpad']);
    expect(fixture.onUpstreamSettingsChanged).toHaveBeenCalled();
  });

  it('resolves System Auto Detect and preserves the original bypass without changing its snapshot', async () => {
    native.settings = settings({ bypassList: 'internal.example.test;<local>', pacUrl: 'http://disabled.example.test/old.pac' });
    const original = structuredClone(native.settings);
    const fixture = createMainService();
    const result = await fixture.systemProxyService.applyUpstreamSettings({ mode: 'system' });
    expect(result.route).toEqual({ kind: 'pac', url: PAC_URL });
    expect(fixture.requestCore).toHaveBeenCalledWith({
      type: 'upstream.applySettings',
      payload: { settings: { mode: 'system' }, upstream: {
        proxyUrl: `pac+${PAC_URL}`, noProxy: ['internal.example.test', 'localhost', '127.0.0.1'],
      } },
    });
    expect(native.settings).toEqual(original);
    expect(native.calls.map(call => call.args[0])).toEqual(['get', 'discover-wpad']);
  });

  it.each([
    { original: settings({ flags: 11, proxyServer: 'corp.example.test:8080' }), proxyUrl: 'http://corp.example.test:8080' },
    { original: settings({ flags: 13, pacUrl: 'https://corp.example.test/config.pac' }), proxyUrl: 'pac+https://corp.example.test/config.pac' },
    { original: settings({ flags: 1, pacUrl: 'http://disabled.example.test/old.pac' }), proxyUrl: null },
  ])('does not discover over an existing explicit route or disabled Auto Detect: $proxyUrl', async ({ original, proxyUrl }) => {
    native.settings = original;
    const fixture = createMainService();
    await fixture.systemProxyService.applyUpstreamSettings({ mode: 'system' });
    expect(fixture.requestCore).toHaveBeenCalledWith({
      type: 'upstream.applySettings',
      payload: { settings: { mode: 'system' }, upstream: proxyUrl === null ? null : { proxyUrl } },
    });
    expect(native.calls.map(call => call.args[0])).toEqual(['get']);
  });

  it.each(['wpad', 'system'] as const)('preserves the saved Manual route after %s discovery fails', async mode => {
    const fixture = createMainService();
    const manual = { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7891 } as const;
    await fixture.systemProxyService.applyUpstreamSettings(manual);
    fixture.requestCore.mockClear();
    failDiscovery(12180);
    await expect(fixture.systemProxyService.applyUpstreamSettings({ mode })).rejects.toBeInstanceOf(WpadNotFoundError);
    expect(fixture.state.persisted).toEqual(manual);
    expect(await fixture.systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: manual, route: { kind: 'proxy', authority: '127.0.0.1:7891' },
      operation: 'idle', error: { kind: 'discovery' },
    });
    expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings'
      || command.type === 'proxy.setUpstream')).toBe(false);
    expect(native.calls.some(call => call.args[0] === 'set')).toBe(false);
  });

  it('publishes discovery progress and rejects overlapping operations until the helper completes', async () => {
    native.delayDiscovery = true;
    const fixture = createMainService();
    const applying = fixture.systemProxyService.applyUpstreamSettings({ mode: 'wpad' }).then(
      () => ({ status: 'fulfilled' } as const),
      error => ({ status: 'rejected', error } as const),
    );
    try {
      await expect.poll(() => native.completeDiscovery !== null).toBe(true);
      expect(await fixture.systemProxyService.getUpstreamSettings()).toMatchObject({ operation: 'discovering' });
      await expect(fixture.systemProxyService.restore()).rejects.toMatchObject({ code: 'operation_in_progress' });
      expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
    } finally {
      native.completeDiscovery?.();
      const outcome = await applying;
      if (outcome.status === 'rejected') throw outcome.error;
    }
    expect(await fixture.systemProxyService.getUpstreamSettings()).toMatchObject({ operation: 'idle', settings: { mode: 'wpad' } });
  });

  it.each(['file:///C:/proxy.pac', 'http://user:password@wpad.example.test/wpad.dat', 'http://wpad.example.test/wpad.dat#fragment'])(
    'validates a discovered PAC URL before asking Core to apply it: %s', async pacUrl => {
      native.discovery.stdout = JSON.stringify({ pacUrl });
      const fixture = createMainService();
      await expect(fixture.systemProxyService.applyUpstreamSettings({ mode: 'wpad' })).rejects.toThrow('PAC URL');
      expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
    },
  );

  it('rejects a discovered PAC URL pointing back to the Core listener', async () => {
    native.discovery.stdout = JSON.stringify({ pacUrl: 'http://127.0.0.1:8888/wpad.dat' });
    const fixture = createMainService();
    await expect(fixture.systemProxyService.applyUpstreamSettings({ mode: 'wpad' })).rejects.toThrow('Interceptor');
    expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
  });

  it('preserves the active route when Core rejects the discovered PAC', async () => {
    const fixture = createMainService();
    await fixture.systemProxyService.applyUpstreamSettings({ mode: 'direct' });
    fixture.state.rejectApply = true;
    await expect(fixture.systemProxyService.applyUpstreamSettings({ mode: 'wpad' })).rejects.toThrow('PAC validation failed');
    expect(fixture.state.persisted).toEqual({ mode: 'direct' });
    expect(await fixture.systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'direct' }, route: { kind: 'direct' }, operation: 'idle', error: { kind: 'connection' },
    });
  });

  it('rediscovers a saved WPAD mode for each Core generation without saving the discovered URL', async () => {
    const fixture = createMainService();
    fixture.state.persisted = { mode: 'wpad' };
    fixture.state.coreProcessState = 'starting';
    await fixture.systemProxyService.synchronizeCore();
    expect(fixture.requestCore).toHaveBeenCalledWith({
      type: 'proxy.setUpstream', payload: { upstream: { proxyUrl: `pac+${PAC_URL}` } },
    });
    const nextPacUrl = 'http://wpad.next.example.test/wpad.dat';
    native.discovery.stdout = JSON.stringify({ pacUrl: nextPacUrl });
    await fixture.systemProxyService.synchronizeCore();
    expect(fixture.requestCore).toHaveBeenLastCalledWith({
      type: 'proxy.setUpstream', payload: { upstream: { proxyUrl: `pac+${nextPacUrl}` } },
    });
    expect(fixture.state.persisted).toEqual({ mode: 'wpad' });
    expect(native.calls.map(call => call.args[0])).toEqual(['discover-wpad', 'discover-wpad']);
    expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'upstream.applySettings')).toBe(false);
  });

  it('uses the original Auto Detect source during an already-owned Enable', async () => {
    native.settings = settings({ flags: 3, proxyServer: '127.0.0.1:8888' });
    const original = settings();
    vi.spyOn(WindowsSystemProxyService.prototype, 'enable').mockImplementation(async (_host, _port, beforeTakeover) => {
      await beforeTakeover?.({ platform: 'win32', settings: original });
      return proxyStatus(true);
    });
    const fixture = createMainService();
    await fixture.systemProxyService.enable();
    expect(fixture.requestCore).toHaveBeenCalledWith({
      type: 'proxy.setUpstream', payload: { upstream: { proxyUrl: `pac+${PAC_URL}` } },
    });
    expect(native.calls.map(call => call.args[0])).toEqual(['discover-wpad']);
    expect(original).toEqual(settings());
  });

  it('rejects failed System discovery before takeover without publishing a Direct route', async () => {
    failDiscovery(12180);
    vi.spyOn(WindowsSystemProxyService.prototype, 'enable').mockImplementation(async (_host, _port, beforeTakeover) => {
      await beforeTakeover?.({ platform: 'win32', settings: settings() });
      throw new Error('Takeover must not proceed after failed discovery.');
    });
    vi.spyOn(WindowsSystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({
      restored: false, status: proxyStatus(false),
    });
    const fixture = createMainService();
    await expect(fixture.systemProxyService.enable()).rejects.toBeInstanceOf(WpadNotFoundError);
    expect(fixture.requestCore.mock.calls.some(([command]) => command.type === 'proxy.setUpstream')).toBe(false);
    expect(await fixture.systemProxyService.getUpstreamSettings()).toMatchObject({
      settings: { mode: 'system' }, route: { kind: 'unavailable' }, error: { kind: 'discovery' },
    });
  });
});

function createWindowsService(): WindowsSystemProxyService {
  return new WindowsSystemProxyService({ platform: 'win32', helperPath: HELPER_PATH });
}

function settings(overrides: Partial<WinInetProxySettings> = {}): WinInetProxySettings {
  const flags = overrides.flags ?? 9;
  return {
    flags, proxyEnabled: (flags & 2) !== 0, autoDetect: (flags & 8) !== 0,
    proxyServer: null, bypassList: null, pacUrl: null, ...overrides,
  };
}

function failDiscovery(win32Error: number): void {
  native.discovery = {
    stdout: '', stderr: JSON.stringify({ win32Error }),
    error: Object.assign(new Error('Command failed'), { code: 1 }),
  };
}

function proxyStatus(owned: boolean) {
  return {
    supported: true, enabled: owned, owned, ownershipLost: false,
    proxyServer: owned ? '127.0.0.1:8888' : null, bypassList: null, pacUrl: null, autoDetect: !owned,
  };
}

function createMainService() {
  const state: { persisted: UpstreamProxySettings; rejectApply: boolean; coreProcessState: CoreProcessState } = {
    persisted: { mode: 'system' }, rejectApply: false, coreProcessState: 'running',
  };
  function dispatch<Command extends PlatformCoreCommand>(command: Command): Promise<CoreResultForCommand<Command>>;
  async function dispatch(command: PlatformCoreCommand): Promise<CoreResultForCommand<PlatformCoreCommand>> {
    switch (command.type) {
      case 'proxy.status':
      case 'proxy.setUpstream': return PROXY_STATUS;
      case 'upstream.getSettings': return { type: 'upstream.settings', payload: { settings: structuredClone(state.persisted) } };
      case 'upstream.applySettings':
        if (state.rejectApply) throw new Error('PAC validation failed');
        state.persisted = structuredClone(command.payload.settings);
        return { type: 'upstream.settings', payload: { settings: state.persisted } };
      default: throw new Error(`Unexpected Core command: ${command.type}`);
    }
  }
  const requestCore = vi.fn<PlatformCoreRequest>().mockImplementation(dispatch);
  const onUpstreamSettingsChanged = vi.fn();
  const options: PlatformCapabilitiesOptions = {
    platform: 'win32', nativeDirectory: path.dirname(path.dirname(HELPER_PATH)),
    userDataDirectory: 'C:\\fixture\\profile', localAppDataDirectory: 'C:\\fixture\\appdata',
    requestCore, getCoreProcessState: () => state.coreProcessState,
    diagnostics: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    secureStore: { isEncryptionAvailable: () => true, encryptString: vi.fn(), decryptString: vi.fn() },
    onUpstreamSettingsChanged,
  };
  return {
    state, requestCore, onUpstreamSettingsChanged,
    systemProxyService: new SystemProxyService(options, new HelperService(options)),
  };
}
