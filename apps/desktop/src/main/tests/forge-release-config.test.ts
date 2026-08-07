import { describe, expect, it } from 'vitest';

import forgeConfig from '../../../forge.config';

interface MakerConfig {
  readonly name: string;
  readonly platforms?: readonly string[];
  readonly config?: Record<string, unknown>;
}

describe('Forge release configuration', () => {
  it('builds a stable per-user Windows MSI without auto-update coupling', () => {
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

  it('publishes both DMG and ZIP artifacts for macOS', () => {
    const dmg = findMaker('@electron-forge/maker-dmg');
    const zip = findMaker('@electron-forge/maker-zip');

    expect(dmg.platforms).toEqual(['darwin']);
    expect(dmg.config).toMatchObject({ format: 'ULFO' });
    expect(zip.platforms).toEqual(['darwin']);
  });

  it('does not enable Windows signing when no certificate path is present', () => {
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