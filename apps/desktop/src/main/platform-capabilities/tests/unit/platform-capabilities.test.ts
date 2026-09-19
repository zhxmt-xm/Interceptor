import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlatformCapabilitiesService } from '../../entry';
import { MacosSystemProxyService } from '../../macos/system-proxy/entry';
import { WindowsSystemProxyService } from '../../windows/system-proxy/entry';
import { MacosHelperDeploymentService } from '../../macos/installation/helper-deployment';
import { MacosHelperServiceClient } from '../../macos/helper-client';

describe('PlatformCapabilitiesService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prepares development from the workspace without an App identity and uses the development socket', async () => {
    const deployment = vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    const status = vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/workspace/Interceptor/apps/desktop/dist', userDataDirectory: '/profiles/development', userId: 501,
    });
    await platformCapabilitiesService.prepareNativeComponents();
    expect(deployment.mock.contexts[0]).toHaveProperty('options', {
      environment: 'development', userId: 501,
      helperPath: '/workspace/Interceptor/apps/desktop/dist/system-proxy/macos-proxy-helper',
    });
    expect(status.mock.contexts[0]).toHaveProperty('socketPath',
      '/Library/Application Support/Interceptor/PlatformHelper/development.sock');
  });

  it('prepares the macOS bundled helper before checking the real service write authority', async () => {
    const events: string[] = [];
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockImplementation(async () => { events.push('deployed'); });
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockImplementation(async () => {
      events.push('authorized');
      return { processId: 123, privileged: true, clientAuthorizedForWrites: true,
        capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'] };
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'darwin', nativeDirectory: '/Applications/Interceptor.app/Contents/Resources',
      applicationPath: '/Applications/Interceptor.app', userDataDirectory: '/profiles/test', userId: 501,
    });
    await platformCapabilitiesService.prepareNativeComponents();
    expect(events).toEqual(['deployed', 'authorized']);
  });

  it('never runs macOS deployment while preparing Windows capabilities', async () => {
    const deployment = vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'win32', nativeDirectory: 'C:\\resources', userDataDirectory: 'C:\\profiles', localAppDataDirectory: 'C:\\local',
    });
    await platformCapabilitiesService.prepareNativeComponents();
    expect(deployment).not.toHaveBeenCalled();
  });

  it('does not report ready when the service rejects the application write identity', async () => {
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    const status = vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: false,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'darwin', nativeDirectory: '/Applications/Interceptor.app/Contents/Resources',
      applicationPath: '/Applications/Interceptor.app', userDataDirectory: '/profiles/test', userId: 501,
    });
    await expect(platformCapabilitiesService.prepareNativeComponents()).rejects.toMatchObject({ code: 'unauthorized-client' });
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.contexts[0]).toHaveProperty('socketPath',
      '/Library/Application Support/Interceptor/PlatformHelper/service.sock');
  });

  it('composes the existing Windows capabilities without requiring native files to declare support', () => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'win32', nativeDirectory: 'C:\\Interceptor\\resources',
      userDataDirectory: 'C:\\profiles\\test', localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
    });

    expect(platformCapabilitiesService.systemProxyService).toBeInstanceOf(WindowsSystemProxyService);
    expect(platformCapabilitiesService.trustStoreService.supported()).toBe(true);
    expect(platformCapabilitiesService.appContainerService.supported()).toBe(true);
    expect(platformCapabilitiesService.getSupportedCapabilities()).toEqual([
      'system-proxy', 'certificate-trust', 'connection-owner', 'application-icon', 'app-container',
    ]);
  });

  it('reports the macOS implemented capabilities without fabricating Windows AppContainer support', async () => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      platform: 'darwin', nativeDirectory: '/application/resources', userDataDirectory: '/profiles/test',
    });

    expect(platformCapabilitiesService.systemProxyService).toBeInstanceOf(MacosSystemProxyService);
    expect(platformCapabilitiesService.trustStoreService.supported()).toBe(true);
    expect(platformCapabilitiesService.getSupportedCapabilities()).toEqual(['system-proxy', 'certificate-trust']);
    expect(await platformCapabilitiesService.appContainerService.list()).toEqual({
      supported: false, containers: [], exemptSids: [],
    });
    await expect(platformCapabilitiesService.appContainerService.enableAllLoopbackExemptions())
      .rejects.toThrow('not supported on darwin');
  });

  it('keeps the Windows shared-journal prerequisite explicit', () => {
    expect(() => new PlatformCapabilitiesService({
      platform: 'win32', nativeDirectory: 'C:\\resources', userDataDirectory: 'C:\\profile',
    })).toThrow('LOCALAPPDATA is required for Windows system proxy recovery.');
  });
});