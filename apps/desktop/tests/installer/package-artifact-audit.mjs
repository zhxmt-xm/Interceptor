import { execFile } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { extractFile, listPackage } from '@electron/asar';
import {
  FuseState,
  FuseV1Options,
  getCurrentFuseWire,
} from '@electron/fuses';

/** Release artifact audit for ASAR contents, extra resources, Fuses and signatures. */
class PackageArtifactAuditor {
  /** Desktop workspace containing the Forge output. */
  static desktopRoot = path.resolve(import.meta.dirname, '../..');
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
      access(path.join(resourcesPath, `system-proxy/${this.systemProxyHelperName()}`)),
      ...(process.platform === 'win32'
        ? [access(path.join(resourcesPath, 'app-container/app-container-helper.exe'))]
        : []),
    ]);

    await this.auditAsar(asarPath);
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
    const forbidden = listPackage(asarPath, { isPack: false })
      .filter((entry) => this.forbiddenPattern.test(entry));
    if (forbidden.length > 0) {
      throw new Error(`Forbidden ASAR entries:\n${forbidden.join('\n')}`);
    }
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