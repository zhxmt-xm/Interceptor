import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformCapabilitiesService } from '../../entry';
import { toUpstreamAuthority } from '../../system-proxy/internal/upstream';
import { SystemProxyService } from '../../system-proxy/entry';
import { HelperService } from '../../helper/entry';
import { AppContainerService } from '../../app-container/entry';
import { MacosSystemProxyService } from '../../system-proxy/macos/entry';
import { WindowsSystemProxyService } from '../../system-proxy/windows/entry';
import { MacosHelperDeploymentService } from '../../helper/macos/installation/helper-deployment';
import { MacosHelperServiceClient } from '../../helper/macos/helper-client';
import { CertificateService } from '../../certificates/entry';
import { TrustStoreService } from '../../certificates/internal/trust-store-service';
import { CoreRuntime } from '../../../core/core-runtime';
import { MainDiagnostics } from '../../../diagnostics/main-diagnostics';
import * as clientAppHelper from '../../client-app/windows/client-app-helper';
import { MacosHelperServiceError } from '../../helper/macos/internal/errors';
import { commandRunner } from '../../internal/command-runners';

const secureStore = {
  isEncryptionAvailable: () => true,
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
};
const coreRuntime = new CoreRuntime();
const diagnostics = new MainDiagnostics(coreRuntime);

describe('PlatformCapabilitiesService', () => {
  beforeEach(() => {
    vi.spyOn(SystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({ restored: false, status: {
      supported: true, enabled: false, owned: false, ownershipLost: false,
      proxyServer: null, bypassList: null, pacUrl: null, autoDetect: false, upstreamProxy: null, upstreamReachable: false,
    } });
  });
  afterEach(() => vi.restoreAllMocks());

  it('generates through the public platform method and returns only the public certificate status', async () => {
    const status = {
      present: true, fingerprint: 'AA', subject: 'Interceptor CA',
      createdAt: '2026-09-21T00:00:00Z', expiresAt: '2029-09-20T00:00:00Z',
    };
    const regenerate = vi.spyOn(CertificateService.prototype, 'regenerate').mockResolvedValue(status);
    vi.spyOn(CertificateService.prototype, 'getStatus').mockResolvedValue(status);
    vi.spyOn(CertificateService.prototype, 'isTrusted').mockResolvedValue(false);
    vi.spyOn(CertificateService.prototype, 'getCertificatePath').mockReturnValue('/shared/root-cert.pem');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profiles/test',
    });
    await expect(platformCapabilitiesService.generateCertificate()).resolves.toEqual({
      ...status, trusted: false, supported: true, mitmEnabled: false, path: '/shared/root-cert.pem',
    });
    expect(regenerate).toHaveBeenCalledExactlyOnceWith();
  });

  it('propagates a certificate operation failure without scheduling another action', async () => {
    const failure = new Error('The certificate operation failed.');
    const install = vi.spyOn(CertificateService.prototype, 'install').mockRejectedValue(failure);
    const status = vi.spyOn(CertificateService.prototype, 'getStatus');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profiles/test',
    });

    await expect(platformCapabilitiesService.installCertificate()).rejects.toBe(failure);
    expect(install).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it.each(['completed', 'unknown'] as const)('keeps Quit consistent with a certificate import failure whose execution is %s', async (executionState) => {
    vi.spyOn(CertificateService.prototype, 'getStatus').mockResolvedValue({
      present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: null, expiresAt: null,
    });
    vi.spyOn(CertificateService.prototype, 'isTrusted').mockResolvedValue(false);
    vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({
      type: command.type, payload: { decrypting: false },
    }) as never);
    const failure = new MacosHelperServiceError('timeout', executionState, 'certificate.import');
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockRejectedValue(failure);
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test',
    });

    await expect(platformCapabilitiesService.installCertificate()).rejects.toBe(failure);

    if (executionState === 'completed') {
      expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    } else {
      expect(() => platformCapabilitiesService.assertCanQuit()).toThrow('operation_in_progress: certificate.install');
    }
    expect(install).toHaveBeenCalledOnce();
  });

  it('rejects quit and duplicate preparation while helper preparation is still running', async () => {
    let finishPreparation!: () => void;
    const preparation = new Promise<void>((resolve) => { finishPreparation = resolve; });
    const deploy = vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockReturnValue(preparation);
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const proxyStatus = {
      supported: true, enabled: false, owned: false, ownershipLost: false,
      proxyServer: null, bypassList: null, pacUrl: null, autoDetect: false,
    };
    vi.spyOn(MacosSystemProxyService.prototype, 'recoverAfterCrash').mockResolvedValue({ restored: false, status: proxyStatus });
    const restore = vi.spyOn(MacosSystemProxyService.prototype, 'restore').mockResolvedValue({ restored: false, status: proxyStatus });
    const prepareCertificate = vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test', userId: 501,
    });
    const running = platformCapabilitiesService.prepare();
    try {
      expect(() => platformCapabilitiesService.assertCanQuit()).toThrow('operation_in_progress: helper.prepare');
      await expect(platformCapabilitiesService.stop()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'helper.prepare',
      });
      await expect(platformCapabilitiesService.prepare()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'helper.prepare',
      });
      expect(restore).not.toHaveBeenCalled();
      expect(prepareCertificate).not.toHaveBeenCalled();
    } finally {
      finishPreparation();
      await running;
    }
    expect(deploy).toHaveBeenCalledOnce();
    expect(prepareCertificate).toHaveBeenCalledOnce();
    expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    expect(restore).not.toHaveBeenCalled();
  });

  it('shows a shared system upstream once and never exposes proxy credentials', () => {
    expect(toUpstreamAuthority({
      httpProxyUrl: 'http://user:secret@127.0.0.1:7890', httpsProxyUrl: 'http://user:secret@127.0.0.1:7890',
      exceptions: [], excludeSimpleHostnames: false,
    })).toBe('127.0.0.1:7890');
    expect(toUpstreamAuthority({ proxyUrl: 'http://user:secret@127.0.0.1:7890' })).toBe('127.0.0.1:7890');
  });

  it('owns client icon caching and deduplicates overlapping requests without exposing executable paths', async () => {
    vi.spyOn(clientAppHelper, 'resolveWindowsClientAppHelperPath').mockReturnValue('C:/helpers/client-app-helper.exe');
    let finishIcon!: (icon: string) => void;
    const icon = new Promise<string>((resolve) => { finishIcon = resolve; });
    const readIcon = vi.spyOn(clientAppHelper, 'readClientAppIcon').mockReturnValue(icon);
    const onClientAppIconsChanged = vi.fn();
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'win32', nativeDirectory: 'C:/resources',
      userDataDirectory: 'C:/profiles/test', localAppDataDirectory: 'C:/local', onClientAppIconsChanged,
    });
    const clientApps = [{ id: 'client-one', name: 'Client', path: 'C:/private/client.exe' }];
    const loading = platformCapabilitiesService.loadClientAppIcons(clientApps);
    try {
      await platformCapabilitiesService.loadClientAppIcons(clientApps);
      expect(readIcon).toHaveBeenCalledExactlyOnceWith('C:/helpers/client-app-helper.exe', 'C:/private/client.exe');
      expect(platformCapabilitiesService.getClientAppIcons()).toEqual([{ clientAppId: 'client-one', icon: null }]);
    } finally {
      finishIcon('data:image/png;base64,icon');
      await loading;
    }
    const icons = [{ clientAppId: 'client-one', icon: 'data:image/png;base64,icon' }];
    expect(onClientAppIconsChanged).toHaveBeenCalledExactlyOnceWith(icons);
    expect(platformCapabilitiesService.getClientAppIcons()).toEqual(icons);
    await platformCapabilitiesService.loadClientAppIcons(clientApps);
    expect(readIcon).toHaveBeenCalledOnce();
  });

  it('does not invoke a Windows icon helper on macOS', async () => {
    const resolveHelper = vi.spyOn(clientAppHelper, 'resolveWindowsClientAppHelperPath');
    const readIcon = vi.spyOn(clientAppHelper, 'readClientAppIcon');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/resources', userDataDirectory: '/profiles/test',
    });

    await platformCapabilitiesService.loadClientAppIcons([{ id: 'client-one', name: 'Client', path: '/private/client' }]);

    expect(resolveHelper).not.toHaveBeenCalled();
    expect(readIcon).not.toHaveBeenCalled();
    expect(platformCapabilitiesService.getClientAppIcons()).toEqual([]);
  });

  it('keeps different protocol destinations explicit in the public upstream summary', () => {
    expect(toUpstreamAuthority({
      httpProxyUrl: null, httpsProxyUrl: 'http://secure.example:8443',
      exceptions: [], excludeSimpleHostnames: false,
    })).toBe('http=direct;https=secure.example:8443');
  });

  it('prepares development from the workspace without an App identity and uses the development socket', async () => {
    vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const deployment = vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    const status = vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/workspace/Interceptor/apps/desktop/dist', userDataDirectory: '/profiles/development', userId: 501,
    });
    await platformCapabilitiesService.prepare();
    expect(deployment.mock.contexts[0]).toHaveProperty('options', {
      environment: 'development', userId: 501,
      helperPath: '/workspace/Interceptor/apps/desktop/dist/system-proxy/macos-proxy-helper',
    });
    expect(status.mock.contexts[0]).toHaveProperty('socketPath',
      '/Library/Application Support/Interceptor/PlatformHelper/development.sock');
  });

  it('prepares the macOS bundled helper before checking the real service write authority', async () => {
    vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const events: string[] = [];
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockImplementation(async () => { events.push('deployed'); });
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockImplementation(async () => {
      events.push('authorized');
      return { processId: 123, privileged: true, clientAuthorizedForWrites: true,
        capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'] };
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/Applications/Interceptor.app/Contents/Resources',
      applicationPath: '/Applications/Interceptor.app', userDataDirectory: '/profiles/test', userId: 501,
    });
    await platformCapabilitiesService.prepare();
    expect(events).toEqual(['deployed', 'authorized']);
  });

  it('never runs macOS deployment while preparing Windows capabilities', async () => {
    vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const deployment = vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'win32', nativeDirectory: 'C:\\resources', userDataDirectory: 'C:\\profiles', localAppDataDirectory: 'C:\\local',
    });
    await platformCapabilitiesService.prepare();
    expect(deployment).not.toHaveBeenCalled();
  });

  it('does not report ready when the service rejects the application write identity', async () => {
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    const status = vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: false,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/Applications/Interceptor.app/Contents/Resources',
      applicationPath: '/Applications/Interceptor.app', userDataDirectory: '/profiles/test', userId: 501,
    });
    await expect(platformCapabilitiesService.prepare()).rejects.toMatchObject({ code: 'unauthorized-client' });
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.contexts[0]).toHaveProperty('socketPath',
      '/Library/Application Support/Interceptor/PlatformHelper/service.sock');
  });

  it('allows an explicit preparation retry after a confirmed helper failure without retaining quit', async () => {
    const failure = new MacosHelperServiceError('unavailable', 'completed');
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    const status = vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockRejectedValueOnce(failure).mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test', userId: 501,
    });

    await expect(platformCapabilitiesService.prepare()).rejects.toBe(failure);

    expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    expect(status).toHaveBeenCalledOnce();
    await platformCapabilitiesService.prepare();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('does not retain mutation ownership after a read-only helper status timeout', async () => {
    const failure = new MacosHelperServiceError('timeout', 'unknown', 'status');
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockResolvedValue();
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockRejectedValue(failure);
    const prepareCertificate = vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test', userId: 501,
    });

    await expect(platformCapabilitiesService.prepare()).rejects.toBe(failure);

    expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    expect(prepareCertificate).not.toHaveBeenCalled();
  });

  it('allows Quit and an explicit retry after deployment inspection fails before any authorization', async () => {
    const run = vi.spyOn(commandRunner, 'run').mockResolvedValueOnce({
      code: 0, stdout: '{"state":"invalid"}', stderr: '',
    }).mockResolvedValue({ code: 0, stdout: '{"state":"ready"}', stderr: '' });
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    const prepareCertificate = vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test', userId: 501,
    });

    await expect(platformCapabilitiesService.prepare()).rejects.toMatchObject({ code: 'unavailable' });

    expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    expect(prepareCertificate).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
    await platformCapabilitiesService.prepare();
    expect(run.mock.calls.map(([, args]) => args[0])).toEqual([
      'development-deployment-status', 'development-deployment-status',
    ]);
    expect(prepareCertificate).toHaveBeenCalledOnce();
  });

  it.each(['certificate.install', 'app-container.enable-all'] as const)(
    'rejects a second native authorization while %s is active without blocking independent proxy work', async (operation) => {
      let finishAuthorization!: () => void;
      const authorization = new Promise<void>((resolve) => { finishAuthorization = resolve; });
      const actions: string[] = [];
      vi.spyOn(CertificateService.prototype, 'getStatus').mockResolvedValue({
        present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: null, expiresAt: null,
      });
      vi.spyOn(CertificateService.prototype, 'isTrusted').mockResolvedValue(false);
      vi.spyOn(TrustStoreService.prototype, 'install').mockImplementation(async () => {
        actions.push('certificate.install');
        if (operation === 'certificate.install') await authorization;
      });
      vi.spyOn(commandRunner, 'runElevated').mockImplementation(async () => {
        actions.push('app-container.enable-all');
        if (operation === 'app-container.enable-all') await authorization;
        return { code: 0, stdout: JSON.stringify({ containers: [], exemptSids: [] }), stderr: '' };
      });
      vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({
        type: command.type, payload: { listening: true, host: '127.0.0.1', port: 8888, decrypting: false },
      }) as never);
      const enableProxy = vi.spyOn(WindowsSystemProxyService.prototype, 'enable').mockResolvedValue({
        supported: true, enabled: true, owned: true, ownershipLost: false,
        proxyServer: '127.0.0.1:8888', bypassList: null, pacUrl: null, autoDetect: false,
      });
      const platformCapabilitiesService = new PlatformCapabilitiesService({
        secureStore, coreRuntime, diagnostics, platform: 'win32', nativeDirectory: 'C:/resources',
        userDataDirectory: 'C:/profiles/test', localAppDataDirectory: 'C:/local',
      });
      const running = operation === 'certificate.install'
        ? platformCapabilitiesService.installCertificate() : platformCapabilitiesService.enableAllAppContainers();
      try {
        await expect.poll(() => actions).toEqual([operation]);
        await expect(operation === 'certificate.install'
          ? platformCapabilitiesService.enableAllAppContainers() : platformCapabilitiesService.installCertificate())
          .rejects.toMatchObject({ code: 'operation_in_progress', operation });
        expect(actions).toEqual([operation]);
        await expect(platformCapabilitiesService.enableSystemProxy()).resolves.toMatchObject({ owned: true });
        expect(enableProxy).toHaveBeenCalledOnce();
        expect(vi.mocked(coreRuntime.request).mock.calls.some(([command]) => command.type === 'tls.useCertificate')).toBe(false);
      } finally {
        finishAuthorization();
        await running;
      }
      expect(actions).toEqual([operation]);
    },
  );

  it('rejects helper-dependent certificate and proxy work while native component preparation is in progress', async () => {
    let finishPreparation!: () => void;
    const preparation = new Promise<void>((resolve) => { finishPreparation = resolve; });
    vi.spyOn(MacosHelperDeploymentService.prototype, 'ensureInstalled').mockReturnValue(preparation);
    vi.spyOn(MacosHelperServiceClient.prototype, 'getStatus').mockResolvedValue({
      processId: 123, privileged: true, clientAuthorizedForWrites: true,
      capabilities: ['status', 'system-proxy.read', 'system-proxy.replace'],
    });
    vi.spyOn(CertificateService.prototype, 'prepare').mockResolvedValue();
    vi.spyOn(CertificateService.prototype, 'getStatus').mockResolvedValue({
      present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: null, expiresAt: null,
    });
    vi.spyOn(CertificateService.prototype, 'isTrusted').mockResolvedValue(false);
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockResolvedValue();
    vi.spyOn(coreRuntime, 'request').mockImplementation(async (command) => ({ type: command.type, payload: { decrypting: false } }) as never);
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', applicationEnvironment: 'development',
      nativeDirectory: '/resources', userDataDirectory: '/profiles/test', userId: 501,
    });
    const preparing = platformCapabilitiesService.prepare();
    try {
      await expect(platformCapabilitiesService.installCertificate()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'helper.prepare',
      });
      await expect(platformCapabilitiesService.enableSystemProxy()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'helper.prepare',
      });
      expect(install).not.toHaveBeenCalled();
      expect(coreRuntime.request).not.toHaveBeenCalled();
    } finally {
      finishPreparation();
      await preparing;
    }
  });

  it('composes the existing Windows capabilities without requiring native files to declare support', () => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'win32', nativeDirectory: 'C:\\Interceptor\\resources',
      userDataDirectory: 'C:\\profiles\\test', localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
    });

    expect(platformCapabilitiesService).toHaveProperty('systemProxyService.platformSystemProxyService', expect.any(WindowsSystemProxyService));
    expect(platformCapabilitiesService).toHaveProperty('certificateService', expect.any(CertificateService));
    expect(platformCapabilitiesService).toHaveProperty('appContainerService', expect.any(AppContainerService));
    expect(platformCapabilitiesService.getSupportedCapabilities()).toEqual([
      'system-proxy', 'certificates', 'client-app', 'app-container',
    ]);
  });

  it('reports the macOS implemented capabilities without fabricating Windows AppContainer support', async () => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/application/resources', userDataDirectory: '/profiles/test',
    });

    expect(platformCapabilitiesService).toHaveProperty('systemProxyService.platformSystemProxyService', expect.any(MacosSystemProxyService));
    expect(platformCapabilitiesService).toHaveProperty('certificateService', expect.any(CertificateService));
    expect(platformCapabilitiesService.getSupportedCapabilities()).toEqual(['system-proxy', 'certificates']);
    expect(await platformCapabilitiesService.listAppContainers()).toEqual({
      supported: false, containers: [],
    });
    await expect(platformCapabilitiesService.enableAllAppContainers())
      .rejects.toThrow('not supported on darwin');
  });

  it('keeps the Windows shared-journal prerequisite explicit', () => {
    expect(() => new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'win32', nativeDirectory: 'C:\\resources', userDataDirectory: 'C:\\profile',
    })).toThrow('LOCALAPPDATA is required for Windows system proxy recovery.');
  });

  it.each(['/profiles/first', '/profiles/second', '/Users/test/Library/Application Support/Interceptor'])('uses the macOS user-level journal independently of profile %s', (userDataDirectory) => {
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform: 'darwin', nativeDirectory: '/application/resources', userDataDirectory,
    });

    expect(platformCapabilitiesService).toHaveProperty('systemProxyService.platformSystemProxyService.journal.journalPath',
      '/Users/test/Library/Application Support/Interceptor Platform/system-proxy/journal.json');
  });

  it.each(['darwin', 'win32'] as const)('uses a shared certificate directory on %s', (platform) => {
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');
    for (const userDataDirectory of ['/profiles/first', '/profiles/second']) {
      const platformCapabilitiesService = new PlatformCapabilitiesService({
        secureStore, coreRuntime, diagnostics, platform, nativeDirectory: '/resources', userDataDirectory,
        localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
      });
      expect(platformCapabilitiesService.getCertificateDirectory()).toBe(platform === 'darwin'
        ? '/Users/test/Library/Application Support/Interceptor Platform/certificates'
        : 'C:\\Users\\test\\AppData\\Local\\Interceptor\\certificates');
    }
  });

  it.each([
    { platform: 'darwin', trusted: false }, { platform: 'darwin', trusted: true },
    { platform: 'win32', trusted: false }, { platform: 'win32', trusted: true },
  ] as const)('prepares certificate trust during startup on $platform with trusted=$trusted', async ({ platform, trusted }) => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform, nativeDirectory: '/resources', userDataDirectory: '/profiles/startup',
      localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
    });
    vi.spyOn(HelperService.prototype, 'prepare').mockResolvedValue();
    const certificateService = CertificateService.prototype;
    const events: string[] = [];
    const ensure = vi.spyOn(certificateService, 'ensure').mockImplementation(async () => {
      events.push('material');
      return { present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: '2026-09-21T00:00:00Z', expiresAt: '2029-09-20T00:00:00Z' };
    });
    const regenerate = vi.spyOn(certificateService, 'regenerate');
    vi.spyOn(certificateService, 'getThumbprints').mockResolvedValue({ sha256: 'AA', sha1: 'BB' });
    const isTrusted = vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockImplementation(async () => {
      events.push('query-trust');
      return trusted || events.includes('install');
    });
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockImplementation(async () => { events.push('install'); });

    await platformCapabilitiesService.prepare();

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
    expect(isTrusted).toHaveBeenCalledTimes(trusted ? 1 : 2);
    expect(isTrusted).toHaveBeenLastCalledWith('BB');
    expect(events).toEqual(trusted ? ['material', 'query-trust'] : ['material', 'query-trust', 'install', 'query-trust']);
    if (!trusted) expect(install).toHaveBeenCalledExactlyOnceWith(path.join(platformCapabilitiesService.getCertificateDirectory(), 'root-cert.pem'));
    else expect(install).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32'] as const)('does not request trust when shared certificate material fails on %s', async (platform) => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform, nativeDirectory: '/resources', userDataDirectory: '/profiles/startup',
      localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
    });
    vi.spyOn(HelperService.prototype, 'prepare').mockResolvedValue();
    const certificateService = CertificateService.prototype;
    const failure = new Error('Shared CA is incomplete.');
    vi.spyOn(certificateService, 'ensure').mockRejectedValue(failure);
    const isTrusted = vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockResolvedValue();

    await expect(platformCapabilitiesService.prepare()).rejects.toBe(failure);
    expect(isTrusted).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32'] as const)('releases startup ownership after certificate authorization is cancelled on %s without replaying it', async (platform) => {
    const stages: string[] = [];
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform, nativeDirectory: '/resources',
      userDataDirectory: '/profiles/startup', localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
      onStartupStageChanged: (stage) => stages.push(stage),
    });
    vi.spyOn(HelperService.prototype, 'prepare').mockResolvedValue();
    vi.spyOn(CertificateService.prototype, 'ensure').mockResolvedValue({
      present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: null, expiresAt: null,
    });
    vi.spyOn(CertificateService.prototype, 'getThumbprints').mockResolvedValue({ sha256: 'AA', sha1: 'BB' });
    const isTrusted = vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const regenerate = vi.spyOn(CertificateService.prototype, 'regenerate');
    let cancelInstallation!: (error: Error) => void;
    const authorization = new Promise<void>((_resolve, reject) => { cancelInstallation = reject; });
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockReturnValue(authorization);
    const cancellation = platform === 'darwin'
      ? new MacosHelperServiceError('authorization-cancelled', 'completed')
      : new Error('The user cancelled certificate authorization.');
    const preparing = platformCapabilitiesService.prepare().catch((error: unknown) => error);
    try {
      await expect.poll(() => install.mock.calls.length).toBe(1);
      expect(stages).toEqual(['platform', 'certificate']);
      expect(() => platformCapabilitiesService.assertCanQuit()).toThrow('operation_in_progress: certificate.prepare');
      await expect(platformCapabilitiesService.prepare()).rejects.toMatchObject({
        code: 'operation_in_progress', operation: 'certificate.prepare',
      });
    } finally {
      cancelInstallation(cancellation);
      expect(await preparing).toBe(cancellation);
    }
    expect(() => platformCapabilitiesService.assertCanQuit()).not.toThrow();
    expect(stages).toEqual(['platform', 'certificate']);
    expect(install).toHaveBeenCalledOnce();
    expect(isTrusted).toHaveBeenCalledOnce();
    expect(regenerate).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32'] as const)('rejects startup if the installed CA is still not trusted on %s', async (platform) => {
    const platformCapabilitiesService = new PlatformCapabilitiesService({
      secureStore, coreRuntime, diagnostics, platform, nativeDirectory: '/resources', userDataDirectory: '/profiles/startup',
      localAppDataDirectory: 'C:\\Users\\test\\AppData\\Local',
    });
    vi.spyOn(HelperService.prototype, 'prepare').mockResolvedValue();
    const certificateService = CertificateService.prototype;
    vi.spyOn(certificateService, 'ensure').mockResolvedValue({ present: true, fingerprint: 'AA', subject: 'Interceptor CA', createdAt: null, expiresAt: null });
    vi.spyOn(certificateService, 'getThumbprints').mockResolvedValue({ sha256: 'AA', sha1: 'BB' });
    vi.spyOn(TrustStoreService.prototype, 'isTrusted').mockResolvedValue(false);
    const install = vi.spyOn(TrustStoreService.prototype, 'install').mockResolvedValue();

    await expect(platformCapabilitiesService.prepare()).rejects.toThrow('not trusted');
    expect(install).toHaveBeenCalledTimes(1);
  });
});