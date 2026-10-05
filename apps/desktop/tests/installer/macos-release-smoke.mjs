import { spawn } from 'node:child_process';
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** macOS package, helper, nested signature, DMG/ZIP and notarization validation. */
export class MacosReleaseSmoke {
  /** Repository root whose make command builds Core before Desktop. */
  static repoRoot = path.resolve(
    process.env.INTERCEPTOR_RELEASE_SOURCE_ROOT ?? path.join(import.meta.dirname, '../../../..'),
  );
  /** Desktop workspace containing Forge output. */
  static desktopRoot = path.join(this.repoRoot, 'apps/desktop');
  /** Packaged app expected from the host architecture. */
  static appPath = path.join(
    this.desktopRoot,
    'out',
    `Interceptor-darwin-${process.arch}`,
    'Interceptor.app',
  );

  /** Execute all validations available with the current signing credentials. */
  static async run() {
    if (process.platform !== 'darwin') {
      console.log('[macos-release-smoke] skipped on non-macOS platform');
      return;
    }

    await this.runCommand('npm', ['run', 'make'], { cwd: this.repoRoot });
    const makeDirectory = path.join(this.desktopRoot, 'out/make');
    const artifacts = [
      ...await this.findFiles(makeDirectory, '.dmg'),
      ...await this.findFiles(makeDirectory, '.zip'),
    ];
    await this.verifyArtifacts(artifacts, ['dmg', 'zip']);
  }

  /** Verify the selected artifacts and native architecture without rebuilding the app. */
  static async verifyArtifacts(artifacts, packageTypes) {
    await access(this.appPath);
    const helperPath = path.join(
      this.appPath,
      'Contents/Resources/system-proxy/macos-proxy-helper',
    );
    const helperMode = (await stat(helperPath)).mode;
    if ((helperMode & 0o111) === 0) {
      throw new Error('Packaged macOS system-proxy helper is not executable.');
    }
    await this.runCommand(helperPath, ['get']);
    const architecture = process.arch === 'x64' ? 'x86_64' : process.arch;
    for (const executable of [
      path.join(this.appPath, 'Contents/MacOS/Interceptor'),
      helperPath,
    ]) {
      await this.runCommand('lipo', [executable, '-verify_arch', architecture]);
    }
    await this.runCommand(
      'codesign',
      ['--verify', '--deep', '--strict', '--verbose=2', this.appPath],
    );

    if (artifacts.length !== packageTypes.length ||
        packageTypes.some((type) => artifacts.filter((file) => path.extname(file) === `.${type}`).length !== 1)) {
      throw new Error(
        `Expected one artifact for each selected package type: ${packageTypes.join(', ')}.`,
      );
    }

    if (process.env.APPLE_SIGN_IDENTITY) {
      await this.runCommand(
        'spctl',
        ['--assess', '--type', 'execute', '--verbose=4', this.appPath],
      );
    } else {
      console.log('[macos-release-smoke] ad-hoc signature integrity verified; Developer ID assessment not applicable');
    }
    if (
      process.env.APPLE_ID &&
      process.env.APPLE_ID_PASSWORD &&
      process.env.APPLE_TEAM_ID
    ) {
      await this.runCommand(
        'xcrun',
        ['stapler', 'validate', '-v', this.appPath],
      );
    } else {
      console.log('[macos-release-smoke] Apple notarization not configured; browser-download Gatekeeper acceptance remains manual');
    }
    console.log(`[macos-release-smoke] package, helper, native architecture, signatures and ${packageTypes.join('/')} passed`);
  }

  /** Recursively discover release artifacts with one extension. */
  static async findFiles(directory, extension) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.findFiles(entryPath, extension));
      } else if (entry.name.toLowerCase().endsWith(extension)) {
        files.push(entryPath);
      }
    }
    return files;
  }

  /** Run one non-interactive release command with inherited diagnostics. */
  static async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd ?? this.desktopRoot,
        env: process.env,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
        }
      });
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await MacosReleaseSmoke.run();
}