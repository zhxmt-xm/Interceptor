import path from 'node:path';

import type { PlatformCapabilitiesOptions, PlatformCapability, SystemProxyService } from './interfaces';
import { MacosHelperServiceError, SystemProxyError } from './internal/errors';
import { TrustStoreService } from './internal/trust-store-service';
import { MacosSystemProxyService } from './macos/system-proxy/entry';
import { MacosSystemProxyJournal } from './macos/system-proxy/journal';
import { MacosHelperServiceClient } from './macos/helper-client';
import { MacosHelperDeploymentService } from './macos/installation/helper-deployment';
import { AppContainerService } from './windows/app-container/app-container-service';
import { WindowsSystemProxyService } from './windows/system-proxy/entry';
import { resolveWindowsSystemProxyJournalPath, WindowsSystemProxyJournal } from './windows/system-proxy/journal';

export { readClientAppIcon } from './windows/client-app/client-app-helper';
export { resolveClientAppHelperPath } from './internal/client-app';
export type { TrustStoreService } from './internal/trust-store-service';
export type { AppContainerService } from './windows/app-container/app-container-service';
export { SystemProxyOperationQueue } from './internal/operation-queue';
export { UpstreamProbe } from './internal/upstream-probe';
export { toUpstreamAuthority } from './internal/upstream';

/** Creates the platform-owned capabilities without starting processes or changing the host. */
export class PlatformCapabilitiesService {
  readonly systemProxyService: SystemProxyService;
  readonly trustStoreService: TrustStoreService;
  readonly appContainerService: AppContainerService;
  private readonly platform: NodeJS.Platform;
  private readonly macosHelperServiceClient: MacosHelperServiceClient | null;

  constructor(private readonly options: PlatformCapabilitiesOptions) {
    this.platform = options.platform ?? process.platform;
    this.macosHelperServiceClient = this.platform === 'darwin' ? new MacosHelperServiceClient(
      options.applicationEnvironment === 'development'
        ? '/Library/Application Support/Interceptor/PlatformHelper/development.sock'
        : undefined,
    ) : null;
    this.systemProxyService = this.createSystemProxyService(options);
    this.trustStoreService = new TrustStoreService({
      platform: this.platform, macosHelperServiceClient: this.macosHelperServiceClient ?? undefined,
    });
    this.appContainerService = new AppContainerService({
      platform: this.platform,
      helperPath: path.join(options.nativeDirectory, 'app-container/app-container-helper.exe'),
    });
  }

  async prepareNativeComponents(): Promise<void> {
    try {
      if (this.platform === 'darwin') await this.prepareMacosNativeComponents();
    } catch (error) {
      const code = error instanceof MacosHelperServiceError ? error.code : 'operation-failed';
      process.stderr.write(`[platform-capabilities] native preparation failed: ${code}\n`);
      throw error;
    }
  }

  private async prepareMacosNativeComponents(): Promise<void> {
    const deploymentOptions = {
      helperPath: path.join(this.options.nativeDirectory, 'system-proxy/macos-proxy-helper'),
      userId: this.options.userId ?? process.getuid!(),
    };
    let macosHelperDeploymentService: MacosHelperDeploymentService;
    if (this.options.applicationEnvironment === 'development') {
      macosHelperDeploymentService = new MacosHelperDeploymentService({ ...deploymentOptions, environment: 'development' });
    } else {
      if (!this.options.applicationPath) throw new MacosHelperServiceError('unauthorized-client');
      macosHelperDeploymentService = new MacosHelperDeploymentService({
        ...deploymentOptions, environment: 'production', applicationPath: this.options.applicationPath,
      });
    }
    await macosHelperDeploymentService.ensureInstalled();
    process.stderr.write('[platform-capabilities] bundled helper deployment verified\n');
    const status = await this.macosHelperServiceClient!.getStatus();
    process.stderr.write(`[platform-capabilities] helper privileged=${status.privileged} client-authorized=${status.clientAuthorizedForWrites}\n`);
    if (!status.privileged || !status.clientAuthorizedForWrites) throw new MacosHelperServiceError('unauthorized-client');
  }

  private createSystemProxyService(options: PlatformCapabilitiesOptions): SystemProxyService {
    switch (this.platform) {
      case 'win32':
        return this.createWindowsSystemProxyService(options);
      case 'darwin':
        return this.createMacosSystemProxyService(options);
      default:
        throw new SystemProxyError(`System proxy is not supported on ${this.platform}.`);
    }
  }

  private createWindowsSystemProxyService(options: PlatformCapabilitiesOptions): WindowsSystemProxyService {
    if (!options.localAppDataDirectory) {
      throw new Error('LOCALAPPDATA is required for Windows system proxy recovery.');
    }
    return new WindowsSystemProxyService({
      platform: this.platform,
      helperPath: path.join(options.nativeDirectory, 'system-proxy/wininet-proxy-helper.exe'),
      journal: new WindowsSystemProxyJournal(resolveWindowsSystemProxyJournalPath(options.localAppDataDirectory)),
    });
  }

  private createMacosSystemProxyService(options: PlatformCapabilitiesOptions): MacosSystemProxyService {
    return new MacosSystemProxyService({
      platform: this.platform,
      macosHelperServiceClient: this.macosHelperServiceClient!,
      journal: new MacosSystemProxyJournal(path.join(options.userDataDirectory, 'system-proxy/journal.json')),
    });
  }

  getSupportedCapabilities(): readonly PlatformCapability[] {
    switch (this.platform) {
      case 'win32':
        return ['system-proxy', 'certificate-trust', 'connection-owner', 'application-icon', 'app-container'];
      case 'darwin':
        return ['system-proxy', 'certificate-trust'];
      default:
        return [];
    }
  }
}