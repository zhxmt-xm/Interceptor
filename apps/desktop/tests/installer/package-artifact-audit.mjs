import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const desktopDirectory = process.env.INTERCEPTOR_RELEASE_SOURCE_ROOT
  ? path.join(path.resolve(process.env.INTERCEPTOR_RELEASE_SOURCE_ROOT), 'apps/desktop')
  : path.resolve(import.meta.dirname, '../..');
const sourceRequire = createRequire(path.join(desktopDirectory, 'package.json'));
const { extractFile, listPackage } = await import(pathToFileURL(sourceRequire.resolve('@electron/asar')).href);
const {
  FuseState,
  FuseV1Options,
  getCurrentFuseWire,
} = await import(pathToFileURL(sourceRequire.resolve('@electron/fuses')).href);

/** Release artifact audit for ASAR contents, extra resources, Fuses and signatures. */
class PackageArtifactAuditor {
  /** Desktop workspace containing the Forge output. */
  static desktopRoot = desktopDirectory;
  /** Package root for the current platform and architecture. */
  static packageRoot = path.join(
    this.desktopRoot,
    'out',
    `Interceptor-${process.platform}-${process.arch}`,
  );
  /** Source and diagnostic artifacts forbidden from shipped resources. */
  static forbiddenPattern = /(?:^|[\\/])(?:tests?|\.env(?:\.|$))|\.(?:map|ts|tsx|cs|swift)$/i;

  /** Run every platform-independent and current-platform release assertion. */
  static async run() {
    const executablePath = this.executablePath();
    const resourcesPath = this.resourcesPath();
    const asarPath = path.join(resourcesPath, 'app.asar');
    await Promise.all([
      access(executablePath),
      access(asarPath),
      access(path.join(resourcesPath, 'proxy-core/entry.cjs')),
      access(path.join(resourcesPath, 'proxy-core/archive/worker/entry.cjs')),
      access(path.join(resourcesPath, 'proxy-core/diagnostics/worker/entry.cjs')),
      access(path.join(resourcesPath, 'android/Interceptor-Android.apk')),
      access(path.join(resourcesPath, 'android/manifest.json')),
      access(path.join(resourcesPath, `system-proxy/${this.systemProxyHelperName()}`)),
      ...(process.platform === 'win32'
        ? [access(path.join(resourcesPath, 'app-container/app-container-helper.exe'))]
        : []),
    ]);

    await this.auditAsar(asarPath);
    await this.auditLicenses(resourcesPath);
    await this.auditAndroidRuntime(resourcesPath);
    const packageFiles = await this.collectFiles(this.packageRoot);
    const packageBytes = packageFiles.reduce((total, file) => total + file.size, 0);

    const shippedResources = packageFiles.filter((file) =>
      file.path.startsWith(resourcesPath) &&
      file.path !== asarPath &&
      this.forbiddenPattern.test(file.path));
    if (shippedResources.length > 0) {
      throw new Error(
        `Forbidden release resources:\n${shippedResources.map((file) => file.path).join('\n')}`,
      );
    }

    await this.auditFuses(executablePath);
    if (process.platform === 'darwin') {
      await this.verifyMacosCode(path.resolve(path.dirname(executablePath), '../..'));
    }
    if (process.platform === 'win32') {
      await this.auditWindowsSignatures(packageFiles);
    }
    console.log(
      `[package-artifact-audit] ${packageFiles.length} files, ${packageBytes} bytes, all checks passed`,
    );
  }

  /** Verify app metadata and forbidden paths inside the ASAR archive. */
  static async auditAsar(asarPath) {
    const packageJson = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
    const expectedPackage = JSON.parse(await readFile(
      path.join(this.desktopRoot, 'package.json'),
      'utf8',
    ));
    const expectedVersion = process.env.INTERCEPTOR_BUILD_VERSION ??
      expectedPackage.version;
    if (packageJson.version !== expectedVersion) {
      throw new Error(`Unexpected packaged version: ${String(packageJson.version)}.`);
    }
    if (packageJson.license !== 'Apache-2.0') {
      throw new Error(`Unexpected packaged license: ${String(packageJson.license)}.`);
    }
    const forbidden = listPackage(asarPath, { isPack: false })
      .filter((entry) => this.forbiddenPattern.test(entry));
    if (forbidden.length > 0) {
      throw new Error(`Forbidden ASAR entries:\n${forbidden.join('\n')}`);
    }
    for (const licensePath of [
      '.vite/build/main-licenses.txt',
      '.vite/build/preload-licenses.txt',
      '.vite/renderer/main_window/renderer-licenses.txt',
    ]) {
      if (!extractFile(asarPath, path.normalize(licensePath)).toString('utf8').trim()) {
        throw new Error(`Empty bundled dependency license file: ${licensePath}.`);
      }
    }
  }

  /** Verify the Apache license and attribution are unchanged and dependency notices are present. */
  static async auditLicenses(resourcesPath) {
    for (const name of ['LICENSE', 'NOTICE']) {
      const expected = await readFile(path.join(this.desktopRoot, '../..', name));
      const packaged = await readFile(path.join(resourcesPath, name));
      if (!packaged.equals(expected)) {
        throw new Error(`Packaged ${name} differs from the repository license.`);
      }
    }
    const coreLicenses = await readFile(
      path.join(resourcesPath, 'proxy-core/THIRD-PARTY-LICENSES.txt'),
      'utf8',
    );
    if (!coreLicenses.includes('mockttp@') || !coreLicenses.includes('tls-impersonate@')) {
      throw new Error('Core dependency license notices are incomplete.');
    }
  }

  /** Verify every staged Android runtime byte against the package manifest. */
  static async auditAndroidRuntime(resourcesPath) {
    const androidDirectory = path.join(resourcesPath, 'android');
    const manifest = JSON.parse(await readFile(path.join(androidDirectory, 'manifest.json'), 'utf8'));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.applicationId !== 'com.zhxmt.interceptor.android' ||
      !Number.isSafeInteger(manifest.versionCode) ||
      manifest.versionCode < 1 ||
      typeof manifest.versionName !== 'string' ||
      manifest.versionName.length === 0 ||
      manifest.apkFile !== 'Interceptor-Android.apk' ||
      typeof manifest.signerSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(manifest.signerSha256) ||
      manifest.platformTools?.revision !== '37.0.1' ||
      !Array.isArray(manifest.platformTools.files)
    ) {
      throw new Error('Invalid packaged Android runtime manifest.');
    }
    const files = [
      { path: manifest.apkFile, sha256: manifest.apkSha256 },
      ...manifest.platformTools.files,
    ];
    const signedPlatformTools = new Set(process.platform === 'win32'
      ? [
          'platform-tools/adb.exe',
          'platform-tools/AdbWinApi.dll',
          'platform-tools/AdbWinUsbApi.dll',
        ]
      : ['platform-tools/adb']);
    const expectedAdb = process.platform === 'win32' ? 'platform-tools/adb.exe' : 'platform-tools/adb';
    for (const file of files) {
      if (
        typeof file.path !== 'string' ||
        path.isAbsolute(file.path) ||
        file.path.split(/[\\/]/).includes('..') ||
        typeof file.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(file.sha256)
      ) {
        throw new Error('Invalid Android runtime file manifest entry.');
      }
      const bytes = await readFile(path.join(androidDirectory, file.path));
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== file.sha256) {
        if (
          signedPlatformTools.has(file.path) &&
          process.platform === 'win32' &&
          process.env.WINDOWS_CERTIFICATE_FILE
        ) {
          if (await this.authenticodeStatus(path.join(androidDirectory, file.path)) !== 'Valid') {
            throw new Error('Packaged Android ADB Authenticode signature is invalid.');
          }
        } else {
          throw new Error(`Packaged Android runtime checksum mismatch: ${file.path}.`);
        }
      }
    }
    if (!files.some(file => file.path === expectedAdb) ||
        !files.some(file => file.path === 'platform-tools/NOTICE.txt')) {
      throw new Error('Packaged Android platform-tools files are incomplete.');
    }
  }

  /** Verify the complete macOS bundle after Packager has signed nested executables. */
  static async verifyMacosCode(applicationPath) {
    await new Promise((resolve, reject) => {
      execFile(
        '/usr/bin/codesign',
        ['--verify', '--deep', '--strict', '--all-architectures', applicationPath],
        { windowsHide: true },
        (error, _stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve();
        },
      );
    });
  }

  /** Require the exact nine-fuse security policy configured by Forge. */
  static async auditFuses(executablePath) {
    const fuses = await getCurrentFuseWire(executablePath);
    const expected = new Map([
      [FuseV1Options.RunAsNode, FuseState.DISABLE],
      [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
      [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
      [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
      [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
      [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
    ]);
    for (const [option, state] of expected) {
      if (fuses[option] !== state) {
        throw new Error(`Unexpected Fuse ${FuseV1Options[option]} state.`);
      }
    }
  }

  /** Require valid Authenticode on every shipped executable when signing is configured. */
  static async auditWindowsSignatures(packageFiles) {
    const signable = packageFiles.filter((file) =>
      /\.(?:exe|dll|node)$/i.test(file.path));
    const invalid = [];
    for (const file of signable) {
      const status = await this.authenticodeStatus(file.path);
      if (process.env.WINDOWS_CERTIFICATE_FILE && status !== 'Valid') {
        invalid.push(`${status}: ${file.path}`);
      }
    }
    if (invalid.length > 0) {
      throw new Error(`Invalid Authenticode signatures:\n${invalid.join('\n')}`);
    }
    if (!process.env.WINDOWS_CERTIFICATE_FILE) {
      console.log(
        `[package-artifact-audit] unsigned artifact accepted: no WINDOWS_CERTIFICATE_FILE (${signable.length} signable files)`,
      );
    }
  }

  /** Read one Windows Authenticode status without invoking a shell. */
  static async authenticodeStatus(filePath) {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-AuthenticodeSignature -LiteralPath $env:INTERCEPTOR_AUDIT_FILE).Status.ToString()',
        ],
        {
          windowsHide: true,
          env: { ...process.env, INTERCEPTOR_AUDIT_FILE: filePath },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(String(stdout).trim());
          }
        },
      );
    });
  }

  /** Recursively collect file paths and sizes below one package directory. */
  static async collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.collectFiles(entryPath));
      } else if (entry.isFile()) {
        files.push({ path: entryPath, size: (await stat(entryPath)).size });
      }
    }
    return files;
  }

  /** Resolve the packaged Electron executable for the current platform. */
  static executablePath() {
    if (process.platform === 'darwin') {
      return path.join(this.packageRoot, 'Interceptor.app/Contents/MacOS/Interceptor');
    }
    return path.join(
      this.packageRoot,
      process.platform === 'win32' ? 'Interceptor.exe' : 'Interceptor',
    );
  }

  /** Resolve the packaged Resources directory for the current platform. */
  static resourcesPath() {
    return process.platform === 'darwin'
      ? path.join(this.packageRoot, 'Interceptor.app/Contents/Resources')
      : path.join(this.packageRoot, 'resources');
  }

  /** Return the native explicit-proxy helper name for the current platform. */
  static systemProxyHelperName() {
    return process.platform === 'darwin'
      ? 'macos-proxy-helper'
      : 'wininet-proxy-helper.exe';
  }
}

await PackageArtifactAuditor.run();