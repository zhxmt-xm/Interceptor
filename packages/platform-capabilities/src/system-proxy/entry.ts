import os from 'node:os';
import path from 'node:path';
import { PlatformOperationInProgressError, type PlatformOperation } from '@interceptor/tools';
import { parseUpstreamProxySettings, type CoreProcessState, type DiagnosticsRecorder, type UpstreamProxyConfig, type UpstreamProxySettings } from '@interceptor/core-protocol';
import { MacosHelperServiceError } from '../helper/macos/internal/errors';

import type { SystemProxyStatus as DesktopSystemProxyStatus, SystemProxyRestoreResult, UpstreamSettingsSnapshot } from './interfaces/public';
import { UPSTREAM_PROBE_INTERVAL_MS, UPSTREAM_PROBE_TIMEOUT_MS } from './internal/constants';
import { readErrorMessage, readErrorName } from '../utils';
import type { PlatformCapabilitiesOptions } from '../interfaces';
import type { HelperService } from '../helper/entry';
import type { SystemProxyService as PlatformSystemProxyService, SystemProxyStatus, SystemProxyUpstreamSource } from './interfaces';
import { SystemProxyError, WpadNotFoundError } from './internal/errors';
import { UpstreamProbe } from './internal/upstream-probe';
import { assertUpstreamDoesNotLoop, describeUpstreamRoute, toUpstreamAuthority } from './internal/upstream';
import { toMacosUpstreamProxyConfig } from './macos/upstream';
import { toUpstreamProxyConfig } from './windows/system-proxy-upstream';
import { discoverWpadPacUrl } from './macos/discover-wpad';
import { MacosSystemProxyService } from './macos/entry';
import { MacosSystemProxyJournal, resolveMacosSystemProxyJournalPath } from './macos/journal';
import { WindowsSystemProxyService } from './windows/entry';
import { WindowsSystemProxyJournal, resolveWindowsSystemProxyJournalPath } from './windows/journal';

export class SystemProxyService {
  private readonly platformSystemProxyService: PlatformSystemProxyService;
  private activeOperation: { operation: Extract<PlatformOperation, `system-proxy.${string}`>; state: 'running' | 'uncertain' } | null = null;
  private operationCompleted: Promise<void> | null = null;
  private recoveryTask: Promise<SystemProxyRestoreResult> | null = null;
  private operationGeneration = 0;
  private lastCoreProcessState: CoreProcessState | null = null;
  private detectedUpstreamProxy: UpstreamProxyConfig | null = null;
  private activeUpstreamProxy: UpstreamProxyConfig | null = null;
  private upstreamSettings: UpstreamProxySettings = { mode: 'system' };
  private upstreamSettingsLoaded = false;
  private upstreamConfigured = false;
  private discoveringUpstream = false;
  private upstreamError: UpstreamSettingsSnapshot['error'] = null;
  private upstreamHealth: UpstreamSettingsSnapshot['health'] = 'unknown';
  private readonly requestCore: PlatformCapabilitiesOptions['requestCore'];
  private readonly getCoreProcessState: PlatformCapabilitiesOptions['getCoreProcessState'];
  private readonly diagnostics: DiagnosticsRecorder;
  private readonly onChanged: PlatformCapabilitiesOptions['onSystemProxyChanged'];
  private readonly onUpstreamSettingsChanged: PlatformCapabilitiesOptions['onUpstreamSettingsChanged'];
  private readonly upstreamProbe = new UpstreamProbe(
    UPSTREAM_PROBE_INTERVAL_MS, UPSTREAM_PROBE_TIMEOUT_MS,
    (reachable) => { void this.onUpstreamReachabilityChange(reachable); },
  );

  constructor(options: PlatformCapabilitiesOptions, private readonly helperService: HelperService) {
    this.requestCore = options.requestCore;
    this.getCoreProcessState = options.getCoreProcessState;
    this.diagnostics = options.diagnostics;
    this.onChanged = options.onSystemProxyChanged;
    this.onUpstreamSettingsChanged = options.onUpstreamSettingsChanged;
    const platform = options.platform ?? process.platform;
    switch (platform) {
      case 'win32':
        if (!options.localAppDataDirectory) throw new Error('LOCALAPPDATA is required for Windows system proxy recovery.');
        this.platformSystemProxyService = new WindowsSystemProxyService({
          platform, helperPath: path.join(options.nativeDirectory, 'system-proxy/wininet-proxy-helper.exe'),
          journal: new WindowsSystemProxyJournal(resolveWindowsSystemProxyJournalPath(options.localAppDataDirectory)),
        });
        break;
      case 'darwin':
        this.platformSystemProxyService = new MacosSystemProxyService({
          platform, macosHelperServiceClient: this.helperService.macosHelperServiceClient!,
          journal: new MacosSystemProxyJournal(resolveMacosSystemProxyJournalPath(os.homedir())),
        });
        break;
      default:
        throw new SystemProxyError(`System proxy is not supported on ${platform}.`);
    }
  }

  supported(): boolean {
    return this.platformSystemProxyService.supported();
  }

  async status(): Promise<DesktopSystemProxyStatus> {
    const generation = this.operationGeneration;
    const status = await this.platformSystemProxyService.status(() => generation === this.operationGeneration
      && this.activeOperation === null && this.recoveryTask === null);
    return this.withUpstreamProxy(status);
  }

  /** Read saved intent without initiating discovery or changing system proxy ownership. */
  async getUpstreamSettings(): Promise<UpstreamSettingsSnapshot> {
    if (this.activeOperation?.operation === 'system-proxy.configure-upstream') return this.upstreamSnapshot();
    if (this.getCoreProcessState() !== 'running' && this.upstreamSettingsLoaded) return this.upstreamSnapshot();
    const generation = this.operationGeneration;
    const result = await this.requestCore({ type: 'upstream.getSettings', payload: {} });
    if (generation === this.operationGeneration) {
      this.upstreamSettings = result.payload.settings;
      this.upstreamSettingsLoaded = true;
    }
    return this.upstreamSnapshot();
  }

  /** Commit one validated user intent through Core; failures leave the saved and active route unchanged. */
  async applyUpstreamSettings(value: unknown): Promise<UpstreamSettingsSnapshot> {
    const settings = parseUpstreamProxySettings(value);
    try {
      await this.runOperation('system-proxy.configure-upstream', async () => {
        this.upstreamError = null;
        this.onUpstreamSettingsChanged?.();
        try {
          if (this.getCoreProcessState() !== 'running') throw new SystemProxyError('Proxy Core is not running.');
          const status = await this.requestCore({ type: 'proxy.status', payload: {} });
          if (!status.payload.listening || !status.payload.port) throw new SystemProxyError('The Interceptor listener is not running.');
          const upstream = await this.resolveUpstreamSettings(settings, status.payload.port);
          assertUpstreamDoesNotLoop(upstream, status.payload.port);
          const result = await this.requestCore({
            type: 'upstream.applySettings', payload: { settings, upstream },
          });
          this.upstreamSettings = result.payload.settings;
          this.upstreamSettingsLoaded = true;
          this.detectedUpstreamProxy = upstream;
          this.activeUpstreamProxy = upstream;
          this.upstreamConfigured = true;
          this.upstreamHealth = upstream === null || describeUpstreamRoute(upstream).kind === 'pac' ? 'not-applicable' : 'reachable';
        } catch (error) {
          this.upstreamError = {
            kind: error instanceof WpadNotFoundError ? 'discovery' : 'connection',
            message: readErrorMessage(error),
          };
          this.diagnostics.warn('main.upstream.apply-failed', { outcome: 'failed', errorCode: readErrorName(error) });
          throw error;
        } finally {
          this.discoveringUpstream = false;
        }
      });
    } finally {
      this.onUpstreamSettingsChanged?.();
    }
    return this.upstreamSnapshot();
  }

  private async resolveUpstreamSettings(
    settings: UpstreamProxySettings, listenerPort: number, originalSource?: SystemProxyUpstreamSource,
  ): Promise<UpstreamProxyConfig | null> {
    switch (settings.mode) {
      case 'direct': return null;
      case 'manual': {
        const host = settings.host.includes(':') ? `[${settings.host}]` : settings.host;
        return { proxyUrl: `${settings.protocol}://${host}:${settings.port}` };
      }
      case 'pac': return { proxyUrl: `pac+${settings.url}` };
      case 'wpad': return { proxyUrl: `pac+${await this.discoverPacUrl()}` };
      case 'system': {
        const source = originalSource ?? await this.platformSystemProxyService.readUpstreamSource();
        if (source.platform === 'win32') {
          return toUpstreamProxyConfig(source.settings, `127.0.0.1:${listenerPort}`);
        }
        const original = source.settings;
        if (original.ProxyAutoDiscoveryEnable === 1 && original.ProxyAutoConfigEnable !== 1
          && original.HTTPEnable !== 1 && original.HTTPSEnable !== 1 && original.SOCKSEnable !== 1) {
          const pacUrl = await this.discoverPacUrl();
          return toMacosUpstreamProxyConfig({ ...original, ProxyAutoConfigEnable: 1, ProxyAutoConfigURLString: pacUrl }, listenerPort);
        }
        return toMacosUpstreamProxyConfig(original, listenerPort);
      }
    }
  }

  private async discoverPacUrl(): Promise<string> {
    const client = this.helperService.macosHelperServiceClient;
    if (!client) throw new SystemProxyError('WPAD discovery is not supported on this platform.');
    this.discoveringUpstream = true;
    this.onUpstreamSettingsChanged?.();
    return discoverWpadPacUrl(await client.readWpadDiscoveryInfo());
  }

  private upstreamSnapshot(): UpstreamSettingsSnapshot {
    return {
      settings: structuredClone(this.upstreamSettings),
      operation: this.activeOperation?.operation === 'system-proxy.configure-upstream'
        ? this.discoveringUpstream ? 'discovering' : 'applying' : 'idle',
      route: this.upstreamConfigured && this.getCoreProcessState() === 'running'
        ? describeUpstreamRoute(this.detectedUpstreamProxy) : { kind: 'unavailable' },
      health: this.upstreamHealth,
      error: this.upstreamError,
    };
  }

  async enable(): Promise<DesktopSystemProxyStatus> {
    return this.runOperation('system-proxy.enable', async () => {
      const result = await this.requestCore({ type: 'proxy.status', payload: {} });
      const { listening, host, port } = result.payload;
      if (!listening || !host || !port) throw new SystemProxyError('Start capture before enabling the system proxy.');
      this.upstreamError = null;
      try {
        const status = await this.platformSystemProxyService.enable(host, port, async source => {
          const upstream = await this.resolveUpstreamSettings(this.upstreamSettings, port, source);
          assertUpstreamDoesNotLoop(upstream, port);
          await this.finishChange(upstream);
        });
        const publicStatus = this.withUpstreamProxy(status);
        this.onChanged?.(publicStatus);
        return publicStatus;
      } catch (error) {
        this.upstreamError = {
          kind: error instanceof WpadNotFoundError ? 'discovery' : 'connection',
          message: readErrorMessage(error),
        };
        return await this.reconcileFailedChange(error);
      } finally {
        this.onUpstreamSettingsChanged?.();
      }
    });
  }

  async restore(): Promise<SystemProxyRestoreResult> {
    return this.runOperation('system-proxy.restore', () => this.restoreProxy());
  }

  private async restoreProxy(): Promise<SystemProxyRestoreResult> {
    try {
      const result = await this.platformSystemProxyService.restore();
      const status = this.withUpstreamProxy(result.status);
      this.onChanged?.(status);
      return { ...result, status };
    } catch (error) {
      return this.reconcileFailedChange(error);
    }
  }

  private async reconcileFailedChange(error: unknown): Promise<never> {
    if (SystemProxyService.hasUnconfirmedExecution(error)) throw error;
    try {
      const result = await this.platformSystemProxyService.recoverAfterCrash();
      this.onChanged?.(this.withUpstreamProxy(result.status));
    } catch (reconciliationError) {
      throw new AggregateError([error, reconciliationError], 'System proxy operation failed and its current ownership could not be verified.');
    }
    throw error;
  }

  private static hasUnconfirmedExecution(error: unknown): boolean {
    if (error instanceof AggregateError) return error.errors.some((cause) => SystemProxyService.hasUnconfirmedExecution(cause));
    return error instanceof MacosHelperServiceError && error.hasUnconfirmedMutation();
  }

  async recoverAfterCrash(): Promise<SystemProxyRestoreResult> {
    return this.runOperation('system-proxy.recover', async () => {
      const result = await this.platformSystemProxyService.recoverAfterCrash();
      const publicResult = { ...result, status: this.withUpstreamProxy(result.status) };
      this.recordRecovery('main.system-proxy.startup-recovery', publicResult);
      return publicResult;
    });
  }

  getActiveOperation(): { operation: PlatformOperation; state: 'running' | 'uncertain' } | null {
    if (this.activeOperation) return { ...this.activeOperation };
    return this.recoveryTask ? { operation: 'system-proxy.restore', state: 'running' } : null;
  }

  private async runOperation<Result>(
    operation: Extract<PlatformOperation, `system-proxy.${string}`>, perform: () => Promise<Result>,
    recovery = false,
  ): Promise<Result> {
    const active = this.getActiveOperation();
    if (this.activeOperation || (active && !recovery)) {
      throw new PlatformOperationInProgressError(active!.operation);
    }
    this.helperService.assertNotPreparing();
    this.activeOperation = { operation, state: 'running' };
    this.operationGeneration += 1;
    if (operation !== 'system-proxy.update-upstream') this.upstreamProbe.stop();
    let complete!: () => void;
    this.operationCompleted = new Promise<void>((resolve) => { complete = resolve; });
    try {
      return await perform();
    } catch (error) {
      if (SystemProxyService.hasUnconfirmedExecution(error)) {
        this.activeOperation = { operation, state: 'uncertain' };
      }
      throw error;
    } finally {
      if (this.activeOperation.state === 'running') this.activeOperation = null;
      this.discoveringUpstream = false;
      this.operationCompleted = null;
      complete();
      if (operation !== 'system-proxy.update-upstream' && !this.activeOperation && !this.recoveryTask
        && this.detectedUpstreamProxy && this.getCoreProcessState() === 'running') {
        this.upstreamProbe.start(this.detectedUpstreamProxy);
      }
    }
  }

  async restoreAfterFailure(): Promise<SystemProxyRestoreResult> {
    if (this.recoveryTask) return this.recoveryTask;
    this.upstreamProbe.stop();
    this.activeUpstreamProxy = null;
    this.upstreamConfigured = false;
    this.upstreamHealth = 'unknown';
    this.onUpstreamSettingsChanged?.();
    this.recoveryTask = this.restoreAfterOperation(this.operationCompleted);
    try {
      return await this.recoveryTask;
    } finally {
      this.recoveryTask = null;
    }
  }

  private async restoreAfterOperation(operationCompleted: Promise<void> | null): Promise<SystemProxyRestoreResult> {
    await operationCompleted;
    return this.runOperation('system-proxy.restore', async () => {
      const result = await this.restoreProxy();
      this.recordRecovery('main.system-proxy.core-failure', result);
      return result;
    }, true);
  }

  async synchronizeCore(): Promise<void> {
    await this.operationCompleted;
    await this.recoveryTask;
    await this.runOperation('system-proxy.update-upstream', async () => {
      this.upstreamProbe.stop();
      const saved = await this.requestCore({ type: 'upstream.getSettings', payload: {} });
      this.upstreamSettings = saved.payload.settings;
      this.upstreamSettingsLoaded = true;
      const status = await this.requestCore({ type: 'proxy.status', payload: {} });
      if (!status.payload.listening || !status.payload.port) {
        this.activeUpstreamProxy = null;
        this.upstreamConfigured = false;
        this.upstreamHealth = 'unknown';
        this.onUpstreamSettingsChanged?.();
        return;
      }
      const upstream = await this.resolveUpstreamSettings(this.upstreamSettings, status.payload.port);
      assertUpstreamDoesNotLoop(upstream, status.payload.port);
      await this.finishChange(upstream);
    });
    if (this.detectedUpstreamProxy) this.upstreamProbe.start(this.detectedUpstreamProxy);
  }

  async updateCoreProcessStatus(status: { readonly state: CoreProcessState }): Promise<void> {
    const previousState = this.lastCoreProcessState;
    this.lastCoreProcessState = status.state;
    if (previousState === 'running' && (status.state === 'unresponsive' || status.state === 'restarting')) {
      await this.restoreAfterFailure();
    }
    if (status.state === 'running' && previousState !== 'running') this.onUpstreamSettingsChanged?.();
  }

  private async finishChange(upstream: UpstreamProxyConfig | null): Promise<void> {
    await this.applyUpstreamProxy(upstream);
    this.detectedUpstreamProxy = upstream;
  }

  private async applyUpstreamProxy(upstream: UpstreamProxyConfig | null): Promise<void> {
    try {
      await this.requestCore({ type: 'proxy.setUpstream', payload: { upstream } });
      this.activeUpstreamProxy = upstream;
      this.upstreamConfigured = true;
      this.upstreamHealth = upstream === null || describeUpstreamRoute(upstream).kind === 'pac' ? 'not-applicable' : 'reachable';
      this.onUpstreamSettingsChanged?.();
    } catch (error) {
      this.diagnostics.warn('main.system-proxy.upstream-apply-failed', {
        outcome: 'failed', errorCode: readErrorName(error), attributes: { message: readErrorMessage(error) },
      });
      throw error;
    }
  }

  private withUpstreamProxy(status: SystemProxyStatus): DesktopSystemProxyStatus {
    return {
      ...status, upstreamProxy: toUpstreamAuthority(this.detectedUpstreamProxy),
      upstreamReachable: this.activeUpstreamProxy !== null && this.upstreamHealth !== 'unreachable',
    };
  }

  private async onUpstreamReachabilityChange(reachable: boolean): Promise<void> {
    const detected = this.detectedUpstreamProxy;
    if (!detected) return;
    try {
      await this.runOperation('system-proxy.update-upstream', async () => {
        this.diagnostics.warn('main.system-proxy.upstream-reachability', { attributes: { reachable } });
        this.upstreamHealth = reachable ? 'reachable' : 'unreachable';
        this.onUpstreamSettingsChanged?.();
        this.onChanged?.(await this.status());
      });
    } catch (error) {
      this.diagnostics.warn('main.system-proxy.upstream-apply-failed', {
        outcome: 'failed', errorCode: readErrorName(error), attributes: { message: readErrorMessage(error) },
      });
    }
  }

  async stop(): Promise<void> {
    try {
      const result = await this.restore();
      if (result.reason === 'externally-modified') {
        this.diagnostics.warn('main.system-proxy.ownership-lost', { outcome: 'failed' });
      }
    } catch (error) {
      this.diagnostics.error('main.system-proxy.restore-failed', {
        outcome: 'failed', errorCode: readErrorName(error), attributes: { message: readErrorMessage(error) },
      });
      throw error;
    } finally {
      this.upstreamProbe.stop();
    }
  }

  private recordRecovery(phase: string, result: SystemProxyRestoreResult): void {
    if (result.reason === 'externally-modified') {
      this.diagnostics.warn(`${phase}.ownership-lost`, { outcome: 'failed' });
    } else if (result.restored) {
      this.diagnostics.info(`${phase}.completed`, { outcome: 'success' });
    } else if (result.status.owned) {
      this.diagnostics.info(`${phase}.journal-loaded`, { outcome: 'success' });
    }
  }
}