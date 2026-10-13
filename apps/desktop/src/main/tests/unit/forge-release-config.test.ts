import { afterEach, describe, expect, it, vi } from 'vitest';

import forgeConfig from '../../../../forge.config';

interface MakerConfig {
  readonly name: string;
  readonly platforms?: readonly string[];
  readonly config?: Record<string, unknown>;
}

describe('Forge release configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.runIf(process.platform === 'win32')('builds a stable per-user Windows MSI without auto-update coupling', () => {
    const maker = findMaker('@electron-forge/maker-wix');

    expect(maker.platforms).toEqual(['win32']);
    expect(maker.config).toMatchObject({
      manufacturer: 'zhxmt-xm',
      exe: 'Interceptor.exe',
      arch: 'x64',
      upgradeCode: '29d9f14a-359a-4e75-9b75-0bd5b0b69aac',
      defaultInstallMode: 'perUser',
      features: false,
    });
  });

  it.runIf(process.platform === 'darwin')('publishes both DMG and ZIP artifacts for macOS', () => {
    const dmg = findMaker('@electron-forge/maker-dmg');
    const zip = findMaker('@electron-forge/maker-zip');

    expect(dmg.platforms).toEqual(['darwin']);
    expect(dmg.config).toMatchObject({ format: 'ULFO' });
    expect(zip.platforms).toEqual(['darwin', 'win32']);
  });

  it('declares complete ZIP packages for both supported desktop platforms', () => {
    expect(findMaker('@electron-forge/maker-zip').platforms)
      .toEqual(['darwin', 'win32']);
  });

  it.each(['0.1.1-alpha.0', '0.2.0'])('passes the requested release version %s to Packager', async (version) => {
    vi.stubEnv('INTERCEPTOR_BUILD_VERSION', version);
    vi.resetModules();
    const { default: releaseConfig } = await import('../../../../forge.config');

    expect(releaseConfig.packagerConfig?.appVersion).toBe(version);
  });

  it('lets Packager infer the source version without a release override', async () => {
    vi.stubEnv('INTERCEPTOR_BUILD_VERSION', undefined);
    vi.resetModules();
    const { default: localConfig } = await import('../../../../forge.config');

    expect(localConfig.packagerConfig?.appVersion).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('does not enable Windows signing when no certificate path is present', () => {
    if (process.env.WINDOWS_CERTIFICATE_FILE) {
      return;
    }
    expect(forgeConfig.packagerConfig?.windowsSign).toBeUndefined();
    expect(findMaker('@electron-forge/maker-wix').config?.windowsSign)
      .toBeUndefined();
  });

  it('ships the AppContainer helper only in Windows package resources', () => {
    const resources = forgeConfig.packagerConfig?.extraResource;
    const paths = Array.isArray(resources) ? resources : [resources];

    if (process.platform === 'win32') {
      expect(paths).toEqual(expect.arrayContaining([
        expect.stringMatching(/[\\/]dist[\\/]app-container$/),
      ]));
    } else {
      expect(paths).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/[\\/]dist[\\/]app-container$/),
      ]));
    }
  });

  it.runIf(process.platform === 'darwin')('hardens ad-hoc apps without requiring a Developer ID team or injectable entitlements', async () => {
    vi.stubEnv('APPLE_SIGN_IDENTITY', undefined);
    vi.resetModules();
    const { default: localConfig } = await import('../../../../forge.config');
    const signing = localConfig.packagerConfig?.osxSign;
    if (!signing || typeof signing !== 'object') throw new Error('Missing macOS signing configuration.');

    expect(signing.identity).toBe('-');
    expect(signing.optionsForFile?.('Interceptor.app', { platform: 'darwin' })).toMatchObject({
      hardenedRuntime: true,
      entitlements: expect.stringMatching(/[\\/]assets[\\/]macos-local-app-entitlements\.plist$/),
    });
    expect(signing.optionsForFile?.('Interceptor.app/Contents/Frameworks/Interceptor Helper.app', { platform: 'darwin' })).toMatchObject({
      hardenedRuntime: true,
      entitlements: expect.stringMatching(/[\\/]assets[\\/]macos-local-app-entitlements\.plist$/),
    });
    expect(signing.optionsForFile?.('macos-proxy-helper', { platform: 'darwin' })).toEqual({
      hardenedRuntime: true,
      entitlements: expect.stringMatching(/[\\/]assets[\\/]macos-native-helper-entitlements\.plist$/),
      additionalArguments: ['--identifier', 'com.zhxmt.interceptor.platform-capabilities'],
      timestamp: 'none',
    });
    expect(localConfig.packagerConfig?.osxNotarize).toBeUndefined();
  });

  it.runIf(process.platform === 'darwin')('retains hardened runtime for Developer ID signing', async () => {
    vi.stubEnv('APPLE_SIGN_IDENTITY', 'Developer ID Application: Release Fixture (TESTTEAMID)');
    vi.resetModules();
    const { default: releaseConfig } = await import('../../../../forge.config');
    const signing = releaseConfig.packagerConfig?.osxSign;
    if (!signing || typeof signing !== 'object') throw new Error('Missing macOS signing configuration.');

    expect(signing.identityValidation).toBe(true);
    expect(signing.optionsForFile?.('Interceptor.app', { platform: 'darwin' })).toEqual({ hardenedRuntime: true });
    expect(signing.optionsForFile?.('Interceptor.app/Contents/Resources/system-proxy/macos-proxy-helper', { platform: 'darwin' })).toEqual({
      hardenedRuntime: true,
      entitlements: expect.stringMatching(/[\\/]assets[\\/]macos-native-helper-entitlements\.plist$/),
      additionalArguments: ['--identifier', 'com.zhxmt.interceptor.platform-capabilities'],
    });
  });
});

/** Find one declared maker and expose its serializable release configuration. */
function findMaker(name: string): MakerConfig {
  const maker = forgeConfig.makers?.find((candidate) =>
    typeof candidate === 'object' &&
    candidate !== null &&
    'name' in candidate &&
    candidate.name === name,
  );
  if (!maker || typeof maker !== 'object' || !('name' in maker)) {
    throw new Error(`Missing Forge maker: ${name}`);
  }
  return maker as MakerConfig;
}