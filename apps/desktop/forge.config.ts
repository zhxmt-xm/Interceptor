import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  flipFuses,
  FuseV1Options,
  FuseVersion,
} from '@electron/fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import type { PackagerWindowsSignOptions } from '@electron/packager';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const electronChecksums = require('electron/checksums.json') as Record<
  string,
  string
>;
const proxyCoreDirectory = path.resolve(
  desktopDirectory,
  '../proxy-core/dist/proxy-core',
);
const appIconPng = path.join(desktopDirectory, 'assets/interceptor-icon.png');
const appIconIco = path.join(desktopDirectory, 'assets/interceptor-icon.ico');
const appIconIcns = path.join(desktopDirectory, 'assets/interceptor-icon.icns');
const systemProxyResources = path.join(
  desktopDirectory,
  '../../packages/platform-capabilities/dist/system-proxy',
);
const appContainerResources = path.join(
  desktopDirectory,
  '../../packages/platform-capabilities/dist/app-container',
);
const clientAppResources = path.join(
  desktopDirectory,
  '../../packages/platform-capabilities/dist/client-app',
);
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
const windowsSign: PackagerWindowsSignOptions | undefined = windowsCertificateFile
  ? {
      certificateFile: windowsCertificateFile,
      ...(windowsCertificatePassword
        ? { certificatePassword: windowsCertificatePassword }
        : {}),
      description: 'Interceptor desktop network debugging proxy',
      website: 'https://github.com/zhxmt-xm/Interceptor',
      timestampServer: 'http://timestamp.digicert.com',
    }
  : undefined;
const appleSignIdentity = process.env.APPLE_SIGN_IDENTITY;
const appleId = process.env.APPLE_ID;
const appleIdPassword = process.env.APPLE_ID_PASSWORD;
const appleTeamId = process.env.APPLE_TEAM_ID;
const releaseVersion = process.env.INTERCEPTOR_BUILD_VERSION;
const packageIcon =
  process.platform === 'win32'
    ? appIconIco
    : process.platform === 'darwin'
      ? appIconIcns
      : undefined;

/** Release-only packaging operations shared by Forge hooks. */
class ReleasePackaging {
  /** Resolve Electron's executable before Packager signs the app bundle. */
  static electronExecutablePath(
    buildPath: string,
    platform: string,
  ): string {
    const packageRoot = path.resolve(buildPath, '../..');
    if (platform === 'darwin' || platform === 'mas') {
      return path.join(
        packageRoot,
        'MacOS/Electron',
      );
    }
    return path.join(
      packageRoot,
      platform === 'win32' ? 'electron.exe' : 'electron',
    );
  }

  /** Lock every Electron fuse before platform code signing runs. */
  static async lockFuses(buildPath: string, platform: string): Promise<void> {
    await flipFuses(this.electronExecutablePath(buildPath, platform), {
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: true,
    });
  }
}

const config: ForgeConfig = {
  buildIdentifier: process.env.INTERCEPTOR_BUILD_IDENTIFIER,
  hooks: {
    readPackageJson: async (_forgeConfig, packageJson) =>
      releaseVersion ? { ...packageJson, version: releaseVersion } : packageJson,
    packageAfterCopy: async (_forgeConfig, buildPath, _version, platform) => {
      await ReleasePackaging.lockFuses(buildPath, platform);
    },
  },
  packagerConfig: {
    appVersion: releaseVersion,
    appBundleId: 'com.zhxmt.interceptor',
    appCategoryType: 'public.app-category.developer-tools',
    asar: true,
    download: {
      checksums: electronChecksums,
    },
    extraResource: [
      path.resolve(desktopDirectory, '../../LICENSE'),
      path.resolve(desktopDirectory, '../../NOTICE'),
      proxyCoreDirectory,
      appIconPng,
      ...(process.platform === 'win32' || process.platform === 'darwin'
        ? [systemProxyResources]
        : []),
      ...(process.platform === 'win32'
        ? [appContainerResources, clientAppResources]
        : []),
    ],
    executableName: 'Interceptor',
    icon: packageIcon,
    win32metadata: {
      CompanyName: 'zhxmt-xm',
      FileDescription: 'Interceptor desktop network debugging proxy',
      ProductName: 'Interceptor',
      InternalName: 'Interceptor',
      OriginalFilename: 'Interceptor.exe',
      'requested-execution-level': 'asInvoker',
    },
    ...(process.platform === 'win32' && windowsSign ? { windowsSign } : {}),
    ...(process.platform === 'darwin'
      ? {
          osxSign: {
            identity: appleSignIdentity ?? '-',
            identityValidation: appleSignIdentity !== undefined,
            optionsForFile: (filePath) => ({
              hardenedRuntime: true,
              ...(path.basename(filePath) === 'macos-proxy-helper'
                ? {
                    entitlements: path.join(desktopDirectory, '../../packages/platform-capabilities/assets/macos-native-helper-entitlements.plist'),
                    additionalArguments: ['--identifier', 'com.zhxmt.interceptor.platform-capabilities'],
                    ...(appleSignIdentity === undefined ? { timestamp: 'none' } : {}),
                  }
                : {}),
              ...(appleSignIdentity === undefined && filePath.endsWith('.app')
                ? { entitlements: path.join(desktopDirectory, 'assets/macos-local-app-entitlements.plist') }
                : {}),
            }),
          },
          ...(appleSignIdentity && appleId && appleIdPassword && appleTeamId
            ? {
                osxNotarize: {
                  appleId,
                  appleIdPassword,
                  teamId: appleTeamId,
                },
              }
            : {}),
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-wix',
      platforms: ['win32'],
      config: {
        language: 1033,
        appUserModelId: 'com.zhxmt.interceptor',
        arch: 'x64',
        manufacturer: 'zhxmt-xm',
        description: 'Interceptor desktop network debugging proxy',
        exe: 'Interceptor.exe',
        icon: appIconIco,
        shortName: 'Interceptor',
        shortcutName: 'Interceptor',
        programFilesFolderName: 'Interceptor',
        upgradeCode: '29d9f14a-359a-4e75-9b75-0bd5b0b69aac',
        defaultInstallMode: 'perUser',
        ui: { chooseDirectory: true },
        features: false,
        ...(windowsSign ? { windowsSign } : {}),
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO',
        icon: appIconIcns,
        'background-color': '#f8f8f6',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;