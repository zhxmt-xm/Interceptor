import os from 'node:os';
import path from 'node:path';
import { PlatformOperationInProgressError, type PlatformOperation } from '@interceptor/tools';
import type { CoreProcessState, DiagnosticsRecorder, UpstreamProxyConfig } from '@interceptor/core-protocol';
import { MacosHelperServiceError } from '../helper/macos/internal/errors';

import type { SystemProxyStatus as DesktopSystemProxyStatus, SystemProxyRestoreResult } from './interfaces/public';
import { UPSTREAM_PROBE_INTERVAL_MS, UPSTREAM_PROBE_TIMEOUT_MS } from './internal/constants';
import { readErrorMessage, readErrorName } from '../utils';
import type { PlatformCapabilitiesOptions } from '../interfaces';
import type { HelperService } from '../helper/entry';
import type { SystemProxyService as PlatformSystemProxyService, SystemProxyStatus } from './interfaces';
import { SystemProxyError } from './internal/errors';
import { UpstreamProbe } from './internal/upstream-probe';
import { toUpstreamAuthority } from './internal/upstream';
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
  private readonly requestCore: PlatformCapabilitiesOptions['requestCore'];
  private readonly getCoreProcessState: PlatformCapabilitiesOptions['getCoreProcessState'];
  private readonly diagnostics: DiagnosticsRecorder;
  private readonly onChanged: PlatformCapabilitiesOptions['onSystemProxyChanged'];
  private readonly upstreamProbe = new UpstreamProbe(
    UPSTREAM_PROBE_INTERVAL_MS, UPSTREAM_PROBE_TIMEOUT_MS,
    (reachable) => { void this.onUpstreamReachabilityChange(reachable); },
  );

  constructor(options: PlatformCapabilitiesOptions, private readonly helperService: HelperService) {
    this.requestCore = options.requestCore;
    this.getCoreProcessState = options.getCoreProcessState;
    this.diagnostics = options.diagnostics;
    this.onChanged = options.onSystemProxyChanged;
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

  async enable(): Promise<DesktopSystemProxyStatus> {
    return this.runOperation('system-proxy.enable', async () => {
      const result = await this.requestCore({ type: 'proxy.status', payload: {} });
      const { listening, host, port } = result.payload;
      if (!listening || !host || !port) throw new SystemProxyError('Start capture before enabling the system proxy.');
      try {
        const status = await this.platformSystemProxyService.enable(host, port);
        await this.finishChange(this.platformSystemProxyService.detectedUpstream());
        const publicStatus = this.withUpstreamProxy(status);
        this.onChanged?.(publicStatus);
        return publicStatus;
      } catch (error) {
        return this.reconcileFailedChange(error);
      }
    });
  }

  async restore(): Promise<SystemProxyRestoreResult> {
    return this.runOperation('system-proxy.restore', () => this.restoreProxy());
  }

  private async restoreProxy(): Promise<SystemProxyRestoreResult> {
    try {
      const result = await this.platformSystemProxyService.restore();
      await this.finishChange(null);
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
      await this.finishChange(this.platformSystemProxyService.detectedUpstream());
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
      this.detectedUpstreamProxy = this.platformSystemProxyService.detectedUpstream();
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
      this.detectedUpstreamProxy = this.platformSystemProxyService.detectedUpstream();
      await this.applyUpstreamProxy(this.detectedUpstreamProxy);
    });
    if (this.detectedUpstreamProxy) this.upstreamProbe.start(this.detectedUpstreamProxy);
  }

  async updateCoreProcessStatus(status: { readonly state: CoreProcessState }): Promise<void> {
    const previousState = this.lastCoreProcessState;
    this.lastCoreProcessState = status.state;
    if (previousState === 'running' && (status.state === 'unresponsive' || status.state === 'restarting')) {
      await this.restoreAfterFailure();
    }
  }

  private async finishChange(upstream: UpstreamProxyConfig | null): Promise<void> {
    this.detectedUpstreamProxy = upstream;
    if (this.getCoreProcessState() === 'running') await this.applyUpstreamProxy(upstream);
    else this.activeUpstreamProxy = null;
  }

  private async applyUpstreamProxy(upstream: UpstreamProxyConfig | null): Promise<void> {
    try {
      await this.requestCore({ type: 'proxy.setUpstream', payload: { upstream } });
      this.activeUpstreamProxy = upstream;
    } catch (error) {
      this.diagnostics.warn('main.system-proxy.upstream-apply-failed', {
        outcome: 'failed', errorCode: readErrorName(error), attributes: { message: readErrorMessage(error) },
      });
    }
  }

  private withUpstreamProxy(status: SystemProxyStatus): DesktopSystemProxyStatus {
    return {
      ...status, upstreamProxy: toUpstreamAuthority(this.detectedUpstreamProxy),
      upstreamReachable: this.activeUpstreamProxy !== null,
    };
  }

  private async onUpstreamReachabilityChange(reachable: boolean): Promise<void> {
    const detected = this.detectedUpstreamProxy;
    if (!detected) return;
    try {
      await this.runOperation('system-proxy.update-upstream', async () => {
        this.diagnostics.warn('main.system-proxy.upstream-reachability', { attributes: { reachable } });
        await this.applyUpstreamProxy(reachable ? detected : null);
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