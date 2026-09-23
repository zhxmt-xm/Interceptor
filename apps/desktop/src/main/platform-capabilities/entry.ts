import os from 'node:os';
import path from 'node:path';
import { PlatformOperationInProgressError } from '@interceptor/tools';
import type { ClientAppIdentity } from '@interceptor/core-protocol';

import type { AppContainerAccessSnapshot, CertificateInfo, ClientAppIcon, CoreProcessStatus, SystemProxyStatus, SystemProxyRestoreResult } from '../../shared/desktop-api';
import type { PlatformCapabilitiesOptions, PlatformCapability } from './interfaces';
import { CertificateService } from './certificates/entry';
import { CertificateError } from './certificates/internal/errors';
import { HelperService } from './helper/entry';
import { SystemProxyService } from './system-proxy/entry';
import { AppContainerService } from './app-container/entry';
import type { AppContainerSnapshot } from './app-container/interfaces';
import { ClientAppService } from './client-app/entry';

export { resolveClientAppHelperPath } from './client-app/entry';

/** Creates the platform-owned capabilities without starting processes or changing the host. */
export class PlatformCapabilitiesService {
  private readonly helperService: HelperService;
  private readonly systemProxyService: SystemProxyService;
  private readonly certificateService: CertificateService;
  private readonly appContainerService: AppContainerService;
  private readonly clientAppService: ClientAppService;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly options: PlatformCapabilitiesOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperService = new HelperService(options);
    this.systemProxyService = new SystemProxyService(options, this.helperService);
    this.certificateService = new CertificateService({
      dataDir: this.getCertificateDirectory(), secureStore: options.secureStore,
      coreRuntime: options.coreRuntime, diagnostics: options.diagnostics,
      helperService: this.helperService,
      onChanged: options.onCertificateChanged,
      platform: this.platform, macosHelperServiceClient: this.helperService.macosHelperServiceClient ?? undefined,
    });
    this.appContainerService = new AppContainerService({
      platform: this.platform,
      helperPath: path.join(options.nativeDirectory, 'app-container/app-container-helper.exe'),
      helperService: this.helperService,
      onChanged: options.onAppContainersChanged,
    });
    this.clientAppService = new ClientAppService(options);
  }

  async getCertificateInfo(): Promise<CertificateInfo> {
    return this.certificateService.getInfo();
  }

  async prepare(): Promise<void> {
    this.assertCanQuit();
    this.options.onStartupStageChanged?.('platform');
    await this.helperService.prepare();
    try {
      await this.systemProxyService.recoverAfterCrash();
    } catch (error) {
      this.options.onError?.('system-proxy.recover', error);
    }
    this.options.onStartupStageChanged?.('certificate');
    await this.certificateService.prepare();
  }

  async synchronizeCore(): Promise<void> {
    await Promise.all([this.certificateService.synchronizeCore(), this.systemProxyService.synchronizeCore()]);
  }

  async updateCoreProcessStatus(status: CoreProcessStatus): Promise<void> {
    await this.systemProxyService.updateCoreProcessStatus(status);
  }

  async getSystemProxyStatus(): Promise<SystemProxyStatus> {
    return this.systemProxyService.status();
  }

  async enableSystemProxy(): Promise<SystemProxyStatus> {
    return this.systemProxyService.enable();
  }

  async restoreSystemProxy(): Promise<SystemProxyRestoreResult> {
    return this.systemProxyService.restore();
  }

  async stop(): Promise<void> {
    this.assertCanQuit();
    await this.systemProxyService.stop();
  }

  async enableHttpsDecryption(): Promise<CertificateInfo & { decrypting: boolean }> {
    return this.certificateService.enableHttpsDecryption();
  }

  async disableHttpsDecryption(): Promise<CertificateInfo & { decrypting: boolean }> {
    return this.certificateService.disableHttpsDecryption();
  }

  async generateCertificate(): Promise<CertificateInfo> {
    await this.certificateService.regenerate();
    return this.certificateService.getInfo();
  }

  async installCertificate(): Promise<CertificateInfo> {
    await this.certificateService.install();
    return this.certificateService.getInfo();
  }

  async uninstallCertificate(): Promise<CertificateInfo> {
    await this.certificateService.uninstall();
    return this.certificateService.getInfo();
  }

  async deleteCertificate(): Promise<CertificateInfo> {
    await this.certificateService.delete();
    return this.certificateService.getInfo();
  }

  async revealCertificate(showItemInFolder: (filePath: string) => void): Promise<void> {
    await this.certificateService.reveal(showItemInFolder);
  }

  async viewCertificate(openPath: (filePath: string) => Promise<string>): Promise<void> {
    await this.certificateService.view(openPath);
  }

  async openCertificateManager(): Promise<void> {
    await this.certificateService.openManager();
  }

  getClientAppIcons(): ClientAppIcon[] {
    return this.clientAppService.getIcons();
  }

  async loadClientAppIcons(clientApps: ClientAppIdentity[]): Promise<void> {
    await this.clientAppService.loadIcons(clientApps);
  }

  async listAppContainers(): Promise<AppContainerAccessSnapshot> {
    return PlatformCapabilitiesService.toAppContainerAccessSnapshot(await this.appContainerService.list());
  }

  async enableAppContainer(appContainerSid: string): Promise<AppContainerAccessSnapshot> {
    return PlatformCapabilitiesService.toAppContainerAccessSnapshot(await this.appContainerService.enableLoopbackExemption(appContainerSid));
  }

  async disableAppContainer(appContainerSid: string): Promise<AppContainerAccessSnapshot> {
    return PlatformCapabilitiesService.toAppContainerAccessSnapshot(await this.appContainerService.disableLoopbackExemption(appContainerSid));
  }

  async enableAllAppContainers(): Promise<AppContainerAccessSnapshot> {
    return PlatformCapabilitiesService.toAppContainerAccessSnapshot(await this.appContainerService.enableAllLoopbackExemptions());
  }

  async disableAllAppContainers(): Promise<AppContainerAccessSnapshot> {
    return PlatformCapabilitiesService.toAppContainerAccessSnapshot(await this.appContainerService.disableAllLoopbackExemptions());
  }

  private static toAppContainerAccessSnapshot(snapshot: AppContainerSnapshot): AppContainerAccessSnapshot {
    return {
      supported: snapshot.supported,
      containers: snapshot.containers.map((appContainer) => ({
        appContainerSid: appContainer.appContainerSid,
        packageFamilyName: appContainer.packageFamilyName,
        displayName: appContainer.displayName,
        description: appContainer.description,
        packageFullName: appContainer.packageFullName,
        exempt: appContainer.exempt,
      })),
    };
  }

  assertCanQuit(): void {
    const activeOperation = this.helperService.getActiveOperation()
      ?? this.certificateService.getActiveOperation() ?? this.systemProxyService.getActiveOperation()
      ?? this.appContainerService.getActiveOperation();
    if (activeOperation) throw new PlatformOperationInProgressError(activeOperation.operation);
  }

  getCertificateDirectory(): string {
    switch (this.platform) {
      case 'win32':
        return path.win32.join(this.options.localAppDataDirectory!, 'Interceptor', 'certificates');
      case 'darwin':
        return path.posix.join(os.homedir(), 'Library', 'Application Support', 'Interceptor Platform', 'certificates');
      default:
        throw new CertificateError(`Certificate storage is not supported on ${this.platform}.`);
    }
  }

  getSupportedCapabilities(): readonly PlatformCapability[] {
    switch (this.platform) {
      case 'win32':
        return ['system-proxy', 'certificates', 'client-app', 'app-container'];
      case 'darwin':
        return ['system-proxy', 'certificates'];
      default:
        return [];
    }
  }
}