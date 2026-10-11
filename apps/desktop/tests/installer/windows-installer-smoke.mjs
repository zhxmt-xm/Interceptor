import { execFile, spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual, promisify } from 'node:util';

import { chromium, expect } from '@playwright/test';
import { AUTOMATION_IDS } from '../../src/shared/automation-ids.ts';
import { WorkflowHostSafetyGuard } from '../e2e-workflow-tests/fixtures/safety/workflow-host-safety-guard.ts';
import { WindowsWorkflowHostSafetyOperations } from '../e2e-workflow-tests/fixtures/safety/windows-workflow-host-safety-operations.ts';
import { dismissWindowsFileDialogs } from '../e2e-workflow-tests/fixtures/ui/windows-file-dialog.ts';
import { getByAutomationId } from '../e2e-workflow-tests/fixtures/ui/automation.ts';

const execFileAsync = promisify(execFile);

/** End-to-end per-user MSI install, major upgrade, launch and uninstall validation. */
class WindowsInstallerSmoke {
  /** Repository root shared by build subprocesses. */
  static repoRoot = path.resolve(import.meta.dirname, '../../../..');
  /** Desktop workspace root containing Forge output. */
  static desktopRoot = path.resolve(import.meta.dirname, '../..');
  /** Test artifacts retained for diagnosing Windows Installer failures. */
  static resultsDirectory = path.join(
    this.desktopRoot,
    'test-results/windows-installer-smoke',
  );
  /** Temporary root containing only the isolated install and profile. */
  static temporaryRoot = path.join(
    os.tmpdir(),
    'interceptor-windows-installer-smoke',
  );
  /** Isolated per-user application installation directory. */
  static installDirectory = path.join(this.temporaryRoot, 'app');
  /** Isolated Chromium/Electron profile used by the installed executable. */
  static userDataDirectory = path.join(this.temporaryRoot, 'user-data');
  /** MSI versions used to prove stable UpgradeCode major upgrades. */
  static versions = ['0.0.1', '0.0.2'];
  /** npm CLI JavaScript path inherited from the invoking npm lifecycle. */
  static npmCliPath = process.env.npm_execpath;
  /** Prevent removing an installed app while host recovery is unresolved. */
  static hostRestored = true;

  /** Execute the complete installer lifecycle on Windows hosts. */
  static async run() {
    if (process.platform !== 'win32') {
      console.log('[windows-installer-smoke] skipped on non-Windows platform');
      return;
    }
    await this.assertWixAvailable();
    await this.assertSharedCertificateReady();
    await this.cleanupStaleInstall();
    await rm(this.temporaryRoot, { recursive: true, force: true });
    await rm(this.resultsDirectory, { recursive: true, force: true });
    await mkdir(this.resultsDirectory, { recursive: true });

    const installers = [];
    let completed = false;
    const errors = [];
    try {
      await this.runNpm(['run', 'build:core'], {
        cwd: this.repoRoot,
      });
      for (const version of this.versions) {
        installers.push(await this.buildInstaller(version));
      }

      await this.install(installers[0], 'install-old');
      await this.assertInstalledVersion(this.versions[0]);
      await this.launchInstalledApplication(this.versions[0]);

      await this.install(installers[1], 'upgrade-new');
      const upgraded = await this.assertInstalledVersion(this.versions[1]);
      if (await this.exists(path.join(this.installDirectory, `app-${this.versions[0]}`))) {
        throw new Error('MSI major upgrade left the old application version behind.');
      }
      await this.launchInstalledApplication(this.versions[1]);

      await this.uninstall(upgraded.productCode, 'uninstall-new');
      await this.waitFor(
        async () => !await this.exists(this.installDirectory),
        10_000,
        'MSI uninstall left the application directory behind.',
      );
      completed = true;
    } catch (error) {
      errors.push(error);
    } finally {
      try {
        if (this.hostRestored && await this.exists(this.installDirectory)) {
          await this.cleanupStaleInstall();
        }
        if (completed) {
          await rm(this.temporaryRoot, { recursive: true, force: true });
        } else {
          console.error(`[windows-installer-smoke] failed; retained recovery profile at ${this.userDataDirectory}`);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Windows installer lifecycle and cleanup failed.');
    console.log('[windows-installer-smoke] install, upgrade, launch and uninstall passed');
  }

  /** Build one isolated MSI with a release-only semantic version override. */
  static async buildInstaller(version) {
    const identifier = `installer-smoke-${version}`;
    const outputDirectory = path.join(this.desktopRoot, 'out', identifier);
    await rm(outputDirectory, { recursive: true, force: true });
    await this.runNpm(
      ['run', 'make', '--workspace', '@interceptor/desktop'],
      {
        cwd: this.repoRoot,
        env: {
          INTERCEPTOR_BUILD_IDENTIFIER: identifier,
          INTERCEPTOR_BUILD_VERSION: version,
        },
      },
    );
    const installers = await this.findFiles(outputDirectory, '.msi');
    if (installers.length !== 1) {
      throw new Error(
        `Expected one MSI for ${version}, found ${installers.length}.`,
      );
    }
    return installers[0];
  }

  /** Run npm through the current Node executable instead of a Windows cmd shim. */
  static async runNpm(args, options = {}) {
    if (!this.npmCliPath) {
      throw new Error('npm_execpath is unavailable for installer smoke.');
    }
    await this.runCommand(
      process.execPath,
      [this.npmCliPath, ...args],
      options,
    );
  }

  /** Install or upgrade one MSI into the isolated per-user directory. */
  static async install(installerPath, logName) {
    await this.runMsi(
      [
        '/i',
        installerPath,
        '/qn',
        '/norestart',
        `APPLICATIONROOTDIRECTORY=${this.installDirectory}`,
      ],
      logName,
    );
  }

  /** Uninstall one MSI package without prompting or rebooting. */
  static async uninstall(productCode, logName) {
    await this.runMsi([
      '/x',
      `{${productCode.replace(/^\{|\}$/g, '')}}`,
      '/qn',
      '/norestart',
    ], logName);
  }

  /** Invoke Windows Installer and retain a verbose lifecycle log. */
  static async runMsi(args, logName) {
    const logPath = path.join(this.resultsDirectory, `${logName}.log`);
    await this.runCommand('msiexec.exe', [...args, '/l*v', logPath], {
      cwd: this.resultsDirectory,
      allowedExitCodes: [0, 1641, 3010],
    });
  }

  /** Verify the maker's install metadata reflects the expected upgraded version. */
  static async assertInstalledVersion(expectedVersion) {
    const infoPath = path.join(this.installDirectory, '.installInfo.json');
    const info = JSON.parse(await readFile(infoPath, 'utf8'));
    if (info.installVersion !== expectedVersion) {
      throw new Error(
        `Expected installed version ${expectedVersion}, received ${String(info.installVersion)}.`,
      );
    }
    if (info.arch !== 'x64') {
      throw new Error(`Expected x64 MSI metadata, received ${String(info.arch)}.`);
    }
    return info;
  }

  /** Launch the installed executable through CDP and close it cleanly. */
  static async launchInstalledApplication(version) {
    const executablePath = path.join(
      this.installDirectory,
      `app-${version}`,
      'Interceptor.exe',
    );
    const rootsBefore = await this.readRootCertificates();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(new WindowsWorkflowHostSafetyOperations({
      desktopDirectory: this.desktopRoot,
      helperPath: path.join(this.installDirectory, `app-${version}`, 'resources/system-proxy/wininet-proxy-helper.exe'),
      localAppDataDirectory: process.env.LOCALAPPDATA,
      dismissDialogs: dismissWindowsFileDialogs,
    }));
    await workflowHostSafetyGuard.captureBaseline();
    this.hostRestored = false;
    const debuggingPort = await this.reservePort();
    const child = spawn(
      executablePath,
      [
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${this.userDataDirectory}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '';
    const append = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-8_000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    let browser;
    let page;
    let corePid;
    let closedThroughProductUi = false;
    let workflowError;
    const cleanupErrors = [];
    try {
      if (!child.pid) throw new Error('Installed application did not expose its Main PID.');
      workflowHostSafetyGuard.registerProcessIdentity(await this.readProcessIdentity(child.pid));
      workflowHostSafetyGuard.registerApplication(child.pid, this.userDataDirectory);
      await this.waitFor(async () => {
        if (child.exitCode !== null) {
          throw new Error(`Installed application exited early.\n${output}`);
        }
        try {
          const response = await fetch(
            `http://127.0.0.1:${debuggingPort}/json/version`,
          );
          return response.ok;
        } catch {
          return false;
        }
      }, 15_000, 'Installed application CDP endpoint did not start.');

      browser = await chromium.connectOverCDP(
        `http://127.0.0.1:${debuggingPort}`,
      );
      await this.waitFor(
        () => Promise.resolve(
          (browser.contexts()[0]?.pages().length ?? 0) > 0,
        ),
        10_000,
        'Installed application did not create a Renderer page.',
      );
      page = browser.contexts()[0]?.pages()[0];
      if (!page) {
        throw new Error('Installed application did not create a Renderer page.');
      }
      page.setDefaultTimeout(15_000);
      await page.context().tracing.start({ screenshots: true, snapshots: true, title: `Installed Interceptor ${version}` });
      await page.waitForLoadState('domcontentloaded');
      const title = await page.title();
      if (title !== 'Interceptor') {
        throw new Error(`Unexpected installed application title: ${title}`);
      }
      await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toBeVisible({ timeout: 120_000 });
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.boot.screen)).toBeHidden({ timeout: 120_000 });
      const coreStatus = page.locator('[title*=" · PID "]');
      await expect(coreStatus).toHaveAttribute('title', / · PID \d+$/, { timeout: 20_000 });
      corePid = Number((await coreStatus.getAttribute('title')).match(/PID (\d+)/)[1]);
      workflowHostSafetyGuard.registerProcessIdentity(await this.readProcessIdentity(corePid));
      await workflowHostSafetyGuard.registerCaptureListenerProcess();
      await workflowHostSafetyGuard.captureProcessTrees();
      await page.screenshot({ path: path.join(this.resultsDirectory, `${version}-ready.png`) });
      await page.context().tracing.stop({ path: path.join(this.resultsDirectory, `${version}-trace.zip`) });
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).click();
      await this.waitFor(
        () => Promise.resolve(child.exitCode !== null),
        8_000,
        'Installed application did not exit cleanly.',
      );
      closedThroughProductUi = true;
    } catch (error) {
      workflowError = error;
    } finally {
      if (child.exitCode === null && page && !page.isClosed()) {
        try {
          await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).last().click();
          await this.waitFor(() => Promise.resolve(child.exitCode !== null), 30_000, 'Installed app cleanup did not finish.');
        } catch (error) { cleanupErrors.push(error); }
      }
      try { await browser?.close(); } catch (error) { cleanupErrors.push(error); }
      try { await workflowHostSafetyGuard.verifyRestored(); } catch (error) { cleanupErrors.push(error); }
      try {
        if (!isDeepStrictEqual(await this.readRootCertificates(), rootsBefore)) {
          throw new Error('Installed application changed the shared CA trust baseline.');
        }
      } catch (error) { cleanupErrors.push(error); }
      this.hostRestored = cleanupErrors.length === 0;
      await writeFile(path.join(this.resultsDirectory, `${version}-main.log`), output, 'utf8');
      await writeFile(path.join(this.resultsDirectory, `${version}-metadata.json`), JSON.stringify({
        version, mainPid: child.pid, corePid, closedThroughProductUi,
        hostRestored: this.hostRestored,
        gracefulDestroyVerified: closedThroughProductUi && this.hostRestored,
      }, null, 2), 'utf8');
    }
    const errors = [workflowError, ...cleanupErrors].filter(error => error !== undefined);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Installed application and recovery checks failed.');
  }

  /** Read one exact process generation before registering it with the host guard. */
  static async readProcessIdentity(processId) {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$process=Get-Process -Id ${processId} -ErrorAction Stop; [pscustomobject]@{processId=$process.Id;processStartedAt=$process.StartTime.ToUniversalTime().ToString('O',[Globalization.CultureInfo]::InvariantCulture)} | ConvertTo-Json -Compress`,
    ], { encoding: 'utf8', windowsHide: true });
    return JSON.parse(stdout);
  }

  /** Preserve every machine Root certificate across each installed application generation. */
  static async readRootCertificates() {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'ConvertTo-Json -InputObject @(Get-ChildItem Cert:\\LocalMachine\\Root | Select-Object -ExpandProperty Thumbprint | Sort-Object) -Compress',
    ], { encoding: 'utf8', windowsHide: true });
    return JSON.parse(stdout);
  }

  /** Require normal product CA initialization before the installer can launch an application. */
  static async assertSharedCertificateReady() {
    if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is required for installer host protection.');
    const directory = path.join(process.env.LOCALAPPDATA, 'Interceptor', 'certificates');
    await Promise.all(['root-cert.pem', 'root-key.pem', 'ca-meta.json'].map(name => stat(path.join(directory, name))));
    const certificate = new X509Certificate(await readFile(path.join(directory, 'root-cert.pem'), 'utf8'));
    await execFileAsync('certutil.exe', ['-verifystore', 'Root', certificate.fingerprint.replaceAll(':', '')], {
      encoding: 'utf8', windowsHide: true,
    });
  }

  /** Uninstall a prior interrupted test product before deleting its install tree. */
  static async cleanupStaleInstall() {
    await this.terminateInstalledProcesses();
    const infoPath = path.join(this.installDirectory, '.installInfo.json');
    if (!await this.exists(infoPath)) {
      return;
    }
    const info = JSON.parse(await readFile(infoPath, 'utf8'));
    if (typeof info.productCode !== 'string' || info.productCode.length === 0) {
      throw new Error('Stale MSI install metadata has no ProductCode.');
    }
    await mkdir(this.resultsDirectory, { recursive: true });
    await this.uninstall(info.productCode, 'cleanup-stale');
    await this.waitFor(
      async () => !await this.exists(this.installDirectory),
      10_000,
      'Stale MSI uninstall did not release the install directory.',
    );
  }

  /** Stop only processes whose executable lives below the isolated test install root. */
  static async terminateInstalledProcesses() {
    await this.runCommand(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$root=[IO.Path]::GetFullPath($env:INTERCEPTOR_INSTALL_ROOT); ' +
          'Get-CimInstance Win32_Process | ' +
          'Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) } | ' +
          'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
      ],
      {
        env: { INTERCEPTOR_INSTALL_ROOT: this.installDirectory },
      },
    );
  }

  /** Ensure the WiX v3 compiler and linker are both discoverable on PATH. */
  static async assertWixAvailable() {
    await this.runCommand('candle.exe', ['-?']);
    await this.runCommand('light.exe', ['-?']);
  }

  /** Reserve and release one loopback port for Electron CDP. */
  static async reservePort() {
    const server = createServer();
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Unable to reserve a CDP port.'));
          return;
        }
        server.close((error) => error ? reject(error) : resolve(address.port));
      });
    });
  }

  /** Poll one asynchronous predicate until it succeeds or the deadline expires. */
  static async waitFor(predicate, timeoutMs, timeoutMessage) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(timeoutMessage);
  }

  /** Recursively find generated files with one extension. */
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

  /** Check whether one generated path currently exists. */
  static async exists(filePath) {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Spawn one non-interactive process with inherited diagnostics. */
  static async runCommand(command, args, options = {}) {
    const environment = { ...process.env, ...options.env };
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd ?? this.repoRoot,
        env: environment,
        stdio: 'inherit',
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        const allowedExitCodes = options.allowedExitCodes ?? [0];
        if (code !== null && allowedExitCodes.includes(code)) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
        }
      });
    });
  }
}

await WindowsInstallerSmoke.run();