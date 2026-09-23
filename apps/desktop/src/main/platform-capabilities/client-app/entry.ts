import type { ClientAppIdentity } from '@interceptor/core-protocol';
import type { ClientAppIcon } from '../../../shared/desktop-api';
import type { PlatformCapabilitiesOptions } from '../interfaces';
import { readClientAppIcon, resolveWindowsClientAppHelperPath } from './windows/client-app-helper';

export class ClientAppService {
  private readonly iconsByClientAppId = new Map<string, string | null>();

  constructor(private readonly options: PlatformCapabilitiesOptions) {}

  getIcons(): ClientAppIcon[] {
    return [...this.iconsByClientAppId].map(([clientAppId, icon]) => ({ clientAppId, icon }));
  }

  async loadIcons(clientApps: ClientAppIdentity[]): Promise<void> {
    const helperPath = resolveClientAppHelperPath(this.options.nativeDirectory, this.options.platform);
    if (!helperPath) return;
    const pending: Promise<void>[] = [];
    for (const clientApp of clientApps) {
      if (this.iconsByClientAppId.has(clientApp.id)) continue;
      this.iconsByClientAppId.set(clientApp.id, null);
      pending.push(this.loadIcon(helperPath, clientApp));
    }
    await Promise.all(pending);
  }

  private async loadIcon(helperPath: string, clientApp: ClientAppIdentity): Promise<void> {
    let icon: string | null = null;
    try {
      if (clientApp.path.length > 0) icon = await readClientAppIcon(helperPath, clientApp.path);
    } catch (error) {
      this.options.diagnostics.warn('main.client-app.icon-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
    }
    this.iconsByClientAppId.set(clientApp.id, icon);
    this.options.onClientAppIconsChanged?.([{ clientAppId: clientApp.id, icon }]);
  }
}

export function resolveClientAppHelperPath(
  nativeDirectory: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  switch (platform) {
    case 'win32':
      return resolveWindowsClientAppHelperPath(nativeDirectory);
    default:
      return null;
  }
}