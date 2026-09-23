import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemProxyService } from '../../entry';
import { MacosSystemProxyService } from '../../macos/entry';
import type { SystemProxyStatus } from '../../interfaces';
import type { PlatformCapabilitiesOptions } from '../../../interfaces';
import { CoreRuntime } from '../../../../core/core-runtime';
import { MainDiagnostics } from '../../../../diagnostics/main-diagnostics';
import { MacosHelperServiceError } from '../../../helper/macos/internal/errors';
import { HelperService } from '../../../helper/entry';

const status: SystemProxyStatus = {
  supported: true, enabled: true, owned: true, ownershipLost: false,
  proxyServer: '127.0.0.1:8888', bypassList: null, pacUrl: null, autoDetect: false,
};
const coreRuntime = new CoreRuntime();
const options: PlatformCapabilitiesOptions = {
  platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profile',
  coreRuntime, diagnostics: new MainDiagnostics({ ingestDiagnostic: vi.fn(async () => undefined) }),
  secureStore: { isEncryptionAvailable: () => true, encryptString: vi.fn(), decryptString: vi.fn() },
};
const helperService = new HelperService(options);

describe('SystemProxyService operation ownership', () => {
  beforeEach(() => {
    vi.spyOn(coreRuntime, 'getCoreProcessStatus').mockReturnValue({
      ...coreRuntime.getCoreProcessStatus(), state: 'running', pid: 123,
    });
    vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({
      type: command.type, payload: { listening: true, host: '127.0.0.1', port: 8888 },
    }) as never);
    vi.spyOn(MacosSystemProxyService.prototype, 'status').mockResolvedValue(status);
  });

  afterEach(() => vi.restoreAllMocks());

  it('rejects a conflicting user Restore immediately and never executes it later', async () => {
    let finishEnable!: () => void;
    const pendingEnable = new Promise<void>((resolve) => { finishEnable = resolve; });
    vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockImplementation(async () => { await pendingEnable; return status; });
    const restore = vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockResolvedValue({ restored: true, status });
    const systemProxyService = new SystemProxyService(options, helperService);
    const running = systemProxyService.enable();
    try {
      await expect(systemProxyService.restore()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'system-proxy.enable',
      });
      expect(restore).not.toHaveBeenCalled();
    } finally {
      finishEnable();
      await running;
    }
    expect(restore).not.toHaveBeenCalled();
    await systemProxyService.restore();
    expect(restore).toHaveBeenCalledOnce();
  });

  it('retains ownership until module-owned Core synchronization has finished', async () => {
    let finishSynchronization!: () => void;
    const synchronization = new Promise<void>((resolve) => { finishSynchronization = resolve; });
    const onSystemProxyChanged = vi.fn();
    const request = vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => {
      if (command.type === 'proxy.setUpstream') await synchronization;
      return { type: command.type, payload: { listening: true, host: '127.0.0.1', port: 8888 } } as never;
    });
    vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockResolvedValue(status);
    const systemProxyService = new SystemProxyService({ ...options, onSystemProxyChanged }, helperService);
    const running = systemProxyService.enable();
    try {
      await expect.poll(() => request.mock.calls.some(([command]) => command.type === 'proxy.setUpstream')).toBe(true);
      expect(onSystemProxyChanged).not.toHaveBeenCalled();
      await expect(systemProxyService.restore()).rejects.toMatchObject({ code: 'operation_in_progress' });
    } finally {
      finishSynchronization();
      await running;
    }
    expect(systemProxyService.getActiveOperation()).toBeNull();
    expect(onSystemProxyChanged).toHaveBeenCalledExactlyOnceWith({
      ...status, upstreamProxy: null, upstreamReachable: false,
    });
  });

  it('checks the real Core listener before changing native proxy settings', async () => {
    vi.spyOn(coreRuntime, 'request').mockResolvedValue({
      type: 'proxy.status', payload: { listening: false, host: null, port: null },
    } as never);
    const enable = vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockResolvedValue(status);
    const systemProxyService = new SystemProxyService(options, helperService);

    await expect(systemProxyService.enable()).rejects.toThrow('Start capture before enabling the system proxy.');
    expect(enable).not.toHaveBeenCalled();
    expect(systemProxyService.getActiveOperation()).toBeNull();
  });

  it('owns listener discovery while concurrent Enable requests are rejected', async () => {
    let finishRead!: () => void;
    const read = new Promise<void>((resolve) => { finishRead = resolve; });
    const request = vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => {
      if (command.type === 'proxy.status') await read;
      return { type: command.type, payload: { listening: true, host: '127.0.0.1', port: 8888 } } as never;
    });
    const enable = vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockResolvedValue(status);
    const systemProxyService = new SystemProxyService(options, helperService);
    const running = systemProxyService.enable();
    try {
      await expect.poll(() => request.mock.calls.length).toBe(1);
      await expect(systemProxyService.enable()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'system-proxy.enable',
      });
      expect(enable).not.toHaveBeenCalled();
    } finally {
      finishRead();
      await running;
    }
    expect(enable).toHaveBeenCalledExactlyOnceWith('127.0.0.1', 8888);
  });

  it('completes one necessary failure restore after an in-flight enable settles', async () => {
    let finishEnable!: () => void;
    const pendingEnable = new Promise<void>((resolve) => { finishEnable = resolve; });
    const actions: string[] = [];
    vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockImplementation(async () => {
      actions.push('enable-start');
      await pendingEnable;
      actions.push('enable-end');
      return status;
    });
    vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockImplementation(async () => {
      actions.push('restore');
      return { restored: true, status };
    });
    const systemProxyService = new SystemProxyService(options, helperService);
    const running = systemProxyService.enable();
    await expect.poll(() => actions).toEqual(['enable-start']);
    const recovery = systemProxyService.restoreAfterFailure();
    const duplicateRecovery = systemProxyService.restoreAfterFailure();
    try {
      await expect(systemProxyService.enable()).rejects.toMatchObject({ code: 'operation_in_progress' });
      expect(actions).toEqual(['enable-start']);
    } finally { finishEnable(); }
    await running;
    await expect(recovery).resolves.toMatchObject({ restored: true });
    await expect(duplicateRecovery).resolves.toMatchObject({ restored: true });
    expect(actions).toEqual(['enable-start', 'enable-end', 'restore']);
  });

  it('restores the journal-derived upstream when a new Core becomes ready', async () => {
    vi.spyOn(MacosSystemProxyService.prototype, 'detectedUpstream').mockReturnValue(null);
    const systemProxyService = new SystemProxyService(options, helperService);

    await systemProxyService.synchronizeCore();

    expect(coreRuntime.request).toHaveBeenCalledExactlyOnceWith({
      type: 'proxy.setUpstream', payload: { upstream: null },
    });
    expect(systemProxyService.getActiveOperation()).toBeNull();
  });

  it.each(['unavailable', 'invalid-response', 'verification-failed'] as const)(
    'reconciles the journal after a confirmed %s failure before releasing the operation', async (code) => {
      const failure = new MacosHelperServiceError(code, 'completed');
      vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockRejectedValue(failure);
      const recover = vi.spyOn(MacosSystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({ restored: false, status });
      const onSystemProxyChanged = vi.fn();
      const systemProxyService = new SystemProxyService({ ...options, onSystemProxyChanged }, helperService);

      await expect(systemProxyService.enable()).rejects.toBe(failure);

      expect(recover).toHaveBeenCalledOnce();
      expect(coreRuntime.request).toHaveBeenCalledWith({ type: 'proxy.setUpstream', payload: { upstream: null } });
      expect(onSystemProxyChanged).toHaveBeenCalledExactlyOnceWith({ ...status, upstreamProxy: null, upstreamReachable: false });
      expect(systemProxyService.getActiveOperation()).toBeNull();
    },
  );

  it.each(['timeout', 'unavailable', 'invalid-response', 'verification-failed'] as const)(
    'keeps an unconfirmed %s write protected without treating a readback as completion', async (code) => {
      const failure = new MacosHelperServiceError(code);
      vi.spyOn(MacosSystemProxyService.prototype, 'enable').mockRejectedValue(failure);
      const recover = vi.spyOn(MacosSystemProxyService.prototype, 'recoverAfterCrash');
      const restore = vi.spyOn(MacosSystemProxyService.prototype, 'restore');
      const systemProxyService = new SystemProxyService(options, helperService);

      await expect(systemProxyService.enable()).rejects.toBe(failure);

      expect(systemProxyService.getActiveOperation()).toEqual({ operation: 'system-proxy.enable', state: 'uncertain' });
      await expect(systemProxyService.restore()).rejects.toMatchObject({ code: 'operation_in_progress' });
      expect(recover).not.toHaveBeenCalled();
      expect(restore).not.toHaveBeenCalled();
    },
  );
});