import { spawn } from 'node:child_process';
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** macOS package, helper, nested signature, DMG/ZIP and notarization validation. */
class MacosReleaseSmoke {
  /** Repository root whose make command builds Core before Desktop. */
  static repoRoot = path.resolve(import.meta.dirname, '../../../..');
  /** Desktop workspace containing Forge output. */
  static desktopRoot = path.resolve(import.meta.dirname, '../..');
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
    await this.runCommand(
      'codesign',
      ['--verify', '--deep', '--strict', '--verbose=2', this.appPath],
    );

    const makeDirectory = path.join(this.desktopRoot, 'out/make');
    const dmgs = await this.findFiles(makeDirectory, '.dmg');
    const zips = await this.findFiles(makeDirectory, '.zip');
    if (dmgs.length !== 1 || zips.length !== 1) {
      throw new Error(
        `Expected one DMG and one ZIP, found ${dmgs.length} DMG / ${zips.length} ZIP.`,
      );
    }

    if (process.env.APPLE_SIGN_IDENTITY) {
      await this.runCommand(
        'spctl',
        ['--assess', '--type', 'execute', '--verbose=4', this.appPath],
      );
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
    }
    console.log('[macos-release-smoke] package, helper, signatures, DMG and ZIP passed');
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

await MacosReleaseSmoke.run();