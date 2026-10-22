import { once } from 'node:events';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

import {
  _electron as electron,
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Browser,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';
import extract from 'extract-zip';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { resolveMacosSystemProxyJournalPath } from '@interceptor/platform-capabilities/system-proxy/macos/journal';
import { getByAutomationId } from '../ui/automation';
import { registerTlsCompatibilityDismissal, requireSharedCertificateReady } from '../ui/https-capture';
import { waitForMacosStartupCertificateAuthorization } from '../ui/macos-certificate-authorization';
import {
  TrafficLab,
  type HttpTrafficRunner,
  type TlsTrafficRunner,
  type WebSocketTrafficRunner,
} from '../../../../../playground/server/scenarios/traffic-lab';
import { OpenAiCompatibleLab } from '../agent/openai-compatible-lab';
import { PlaygroundServer } from './playground-server';
import {
  dismissWindowsFileDialogs,
  type WindowsFileDialogOwner,
} from '../ui/windows-file-dialog';
import {
  WorkflowHostSafetyGuard,
  type WorkflowProcessIdentity,
} from '../safety/workflow-host-safety-guard';
import { WindowsWorkflowHostSafetyOperations } from '../safety/windows-workflow-host-safety-operations';
import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import { shouldPreserveWorkflowProfile } from './workflow-profile-retention';
import { finishStepScreenshots, recordScreenshotExample, recordScreenshotHostRestoration, startStepScreenshots, useScreenshotDriver } from './step-screenshots';

const DEFAULT_CAPTURE_PORT = 8888;
const E2E_DESKTOP_DIRECTORY_ENV = 'INTERCEPTOR_E2E_DESKTOP_DIRECTORY';
const execFileAsync = promisify(execFile);
const workflowHostSafetyGuardByTestInfo = new WeakMap<TestInfo, WorkflowHostSafetyGuard>();
const dismissTlsCompatibilityByTestInfo = new WeakMap<TestInfo, boolean>();

interface LocalWorkflowFixtures {
  /** Capture explicit user-operation steps without changing the tested behavior. */
  stepScreenshots: boolean;
  /** Finalize screenshot evidence after the remaining test fixtures have finished. */
  stepScreenshotEvidence: void;
  allowSharedCertificateInitialization: boolean;
  dismissTlsCompatibilityDialogs: boolean;
  waitForStartupReady: boolean;
  /** Existing test-owned profile for an interactive workflow's next phase. */
  desktopAppUserDataDirectory: string | undefined;
  /** Retain a successfully prepared profile while the external Host is configured. */
  preserveDesktopAppUserData: boolean;
  /** Test-owned unpackaged Electron application and its real Renderer page. */
  desktopApp: LocalElectronApplicationDriver;
  trafficLab: TrafficLab;
  /** Random-port HTTP origin and explicit-proxy client owned by this test. */
  httpTrafficRunner: HttpTrafficRunner;
  /** Random-port WebSocket origin and explicit-proxy clients owned by this test. */
  webSocketTrafficRunner: WebSocketTrafficRunner;
  /** Random-port OpenAI-compatible endpoint owned by Agent workflows. */
  openAiCompatibleLab: OpenAiCompatibleLab;
  /** Random-port self-signed TLS origin owned by Composer workflows. */
  tlsTrafficRunner: TlsTrafficRunner;
  /** Real Browser Playground process owned by this workflow. */
  playgroundServer: PlaygroundServer;
}

interface DesktopWindowState {
  minimized: boolean;
  maximized: boolean;
  visible: boolean;
}

interface LocalElectronLaunchOptions {
  /** Existing profile reused by a later application generation. */
  userDataDirectory?: string;
  /** Prefix that keeps evidence from multiple generations distinct. */
  evidencePrefix?: string;
}

/** Owns one isolated unpackaged Electron run, its evidence and deterministic cleanup. */
export class LocalElectronApplicationDriver {
  /** Electron application controlled through Playwright's native Electron protocol. */
  readonly application: ElectronApplication | null;
  private readonly macosApplication: { browser: Browser; process: ChildProcess; outputPath: string; owner: WorkflowProcessIdentity } | null;

  /** Browser context shared by every BrowserWindow in this Electron application. */
  readonly context: BrowserContext;

  /** Primary Interceptor Renderer page used by workflow selectors. */
  readonly page: Page;

  /** Temporary Electron userData directory unique to this test. */
  readonly userDataDirectory: string;

  /** Desktop application directory whose production bundle is under test. */
  readonly desktopDirectory: string;

  /** Main-process PID captured before Electron can close. */
  private readonly mainPid: number | null;

  /** Exact Windows Main process generation used by native Dialog workflows. */
  private readonly windowsMainOwner: WindowsFileDialogOwner | null;

  /** Main-process output retained as bounded diagnostic evidence. */
  private mainOutput = '';

  /** Renderer console and page errors retained as bounded diagnostic evidence. */
  private rendererOutput = '';

  /** Sensitive test values checked against every process-log chunk before truncation. */
  private readonly sensitiveEvidenceTexts = new Set<string>();

  /** Whether any registered sensitive value appeared in process-log evidence. */
  private sensitiveTextFoundInProcessOutput = false;

  /** Core PID observed while the application is running. */
  private corePid: number | null = null;

  /** Capture listener port observed while the application is running. */
  private listenerPort: number | null = null;

  /** Whether the BrowserContext trace is still recording. */
  private traceActive = true;

  /** Final trace archives available after each stopTrace segment completes. */
  private readonly tracePaths: string[] = [];

  /** Final screenshot retained until sensitive evidence auditing succeeds. */
  private finalScreenshotPath: string | null = null;

  /** Whether Electron has emitted its terminal close event. */
  private applicationClosed = false;

  /** Whether Main/Core/listener cleanup assertions all completed successfully. */
  private gracefulDestroyVerified = false;

  /** Whether an intentional abrupt exit released the known process resources. */
  private abruptDestroyVerified = false;

  /** Whether a failed workflow must retain its profile for privileged recovery. */
  private preserveUserDataAfterFailure = false;

  /** Distinguishes product Close from an intentional crash boundary. */
  private shutdownKind: 'running' | 'graceful' | 'abrupt' = 'running';

  /** Optional filename and attachment prefix for a later application generation. */
  private readonly evidencePrefix: string;

  /** Outer host-state guard shared by every application generation in this workflow. */
  private readonly workflowHostSafetyGuard: WorkflowHostSafetyGuard | null;

  /** Create one driver after Electron, its first window and evidence capture are ready. */
  private constructor(
    application: ElectronApplication | null,
    page: Page,
    desktopDirectory: string,
    userDataDirectory: string,
    mainProcessId: number,
    windowsMainOwner: WindowsFileDialogOwner | null,
    evidencePrefix: string,
    workflowHostSafetyGuard: WorkflowHostSafetyGuard | null,
    macosApplication: { browser: Browser; process: ChildProcess; outputPath: string; owner: WorkflowProcessIdentity } | null = null,
  ) {
    this.application = application;
    this.macosApplication = macosApplication;
    this.context = application?.context() ?? macosApplication!.browser.contexts()[0]!;
    this.page = page;
    this.desktopDirectory = desktopDirectory;
    this.userDataDirectory = userDataDirectory;
    this.evidencePrefix = evidencePrefix;
    this.workflowHostSafetyGuard = workflowHostSafetyGuard;
    this.mainPid = mainProcessId;
    this.windowsMainOwner = windowsMainOwner;
    (application ?? macosApplication!.process).once('close', () => {
      this.applicationClosed = true;
    });
    this.captureProcessOutput();
    this.captureRendererOutput();
  }

  /** Launch a fresh unpackaged production bundle and wait for its primary window. */
  static async launch(
    testInfo: TestInfo,
    options: LocalElectronLaunchOptions = {},
  ): Promise<LocalElectronApplicationDriver> {
    if (process.platform === 'darwin') return this.launchMacosApplication(testInfo, options);
    const desktopDirectory = resolveDesktopDirectory();
    const userDataDirectory = options.userDataDirectory
      ?? await LocalElectronApplicationDriver.createUserDataDirectory();
    let application: ElectronApplication | null = null;

    try {
      application = await electron.launch({
        args: [
          desktopDirectory,
          `--user-data-dir=${userDataDirectory}`,
          ...(testInfo.project.use.locale ? [`--lang=${testInfo.project.use.locale}`] : []),
        ],
        cwd: desktopDirectory,
        env: this.createLaunchEnvironment(),
        artifactsDir: testInfo.outputDir,
        tracesDir: testInfo.outputDir,
        timeout: 30_000,
      });
      const workflowHostSafetyGuard = workflowHostSafetyGuardByTestInfo.get(testInfo) ?? null;
      const mainProcessId = await application.evaluate(() => process.pid);
      const launchProcessId = application.process().pid;
      const windowsMainOwner = process.platform === 'win32'
        ? await this.readProcessIdentity(mainProcessId)
        : null;
      if (workflowHostSafetyGuard) {
        const rootProcessIds = [...new Set([
          launchProcessId,
          mainProcessId,
        ].filter((processId): processId is number => processId !== undefined))];
        for (const rootProcessId of rootProcessIds) {
          const processIdentity = rootProcessId === mainProcessId && windowsMainOwner
            ? windowsMainOwner
            : await this.readProcessIdentity(rootProcessId);
          workflowHostSafetyGuard.registerProcessIdentity(processIdentity);
          workflowHostSafetyGuard.registerApplication(rootProcessId, userDataDirectory);
        }
        await workflowHostSafetyGuard.captureProcessTrees();
      }
      const context = application.context();
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
        title: options.evidencePrefix
          ? `${testInfo.title} · ${options.evidencePrefix}`
          : testInfo.title,
      });
      const page = await application.firstWindow({ timeout: 120_000 });
      if (dismissTlsCompatibilityByTestInfo.get(testInfo) !== false) {
        await registerTlsCompatibilityDismissal(page);
      }
      const driver = new LocalElectronApplicationDriver(
        application,
        page,
        desktopDirectory,
        userDataDirectory,
        mainProcessId,
        windowsMainOwner,
        options.evidencePrefix ?? '',
        workflowHostSafetyGuard,
      );
      useScreenshotDriver(testInfo, driver);
      return driver;
    } catch (error) {
      testInfo.annotations.push({
        type: 'preserved-user-data',
        description: userDataDirectory,
      });
      try {
        await application?.close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Electron launch and cleanup failed; the profile was retained.');
      }
      throw error;
    }
  }

  private static async launchMacosApplication(
    testInfo: TestInfo, options: LocalElectronLaunchOptions,
  ): Promise<LocalElectronApplicationDriver> {
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    const desktopDirectory = resolveDesktopDirectory();
    const applicationPath = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH ? resolveMacosApplicationPath() : null;
    const executablePath = applicationPath
      ? path.join(applicationPath, 'Contents/MacOS/Interceptor')
      : createRequire(path.join(desktopDirectory, 'package.json'))('electron') as string;
    const userDataDirectory = options.userDataDirectory ?? await this.createUserDataDirectory();
    const workflowHostSafetyGuard = workflowHostSafetyGuardByTestInfo.get(testInfo) ?? null;
    const outputPath = path.join(userDataDirectory, `.workflow-main-${randomUUID()}.log`);
    const outputFile = await open(outputPath, 'wx', 0o600);
    const child = spawn(executablePath, [
      ...(applicationPath ? [] : [desktopDirectory]),
      '--remote-debugging-port=0', `--user-data-dir=${userDataDirectory}`,
      ...(testInfo.project.use.locale ? [
        `--lang=${testInfo.project.use.locale}`,
        '-AppleLanguages', `(${JSON.stringify(testInfo.project.use.locale)})`,
        '-AppleLocale', testInfo.project.use.locale.replaceAll('-', '_'),
      ] : []),
    ], { cwd: applicationPath ?? desktopDirectory, env: this.createLaunchEnvironment(), stdio: ['ignore', outputFile.fd, outputFile.fd] });
    let output = '';
    let browser: Browser | null = null;
    try {
      await once(child, 'spawn');
      const mainProcessId = child.pid!;
      const owner = await this.readProcessIdentity(mainProcessId);
      if (workflowHostSafetyGuard) {
        workflowHostSafetyGuard.registerProcessIdentity(owner);
        workflowHostSafetyGuard.registerApplication(mainProcessId, userDataDirectory);
        await workflowHostSafetyGuard.captureProcessTrees();
      }
      let endpoint = '';
      await expect.poll(async () => {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`macOS App exited before CDP (${child.exitCode ?? child.signalCode}).`);
        }
        output = (await readFile(outputPath, 'utf8')).slice(-128_000);
        endpoint = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.exec(output)?.[1] ?? '';
        return endpoint;
      }, { message: 'macOS App did not expose Renderer CDP.', timeout: 30_000 }).not.toBe('');
      browser = await chromium.connectOverCDP(endpoint);
      const context = browser.contexts()[0]!;
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true, title: testInfo.title });
      const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 120_000 });
      if (dismissTlsCompatibilityByTestInfo.get(testInfo) !== false) {
        await registerTlsCompatibilityDismissal(page);
      }
      if (testInfo.project.use.viewport) {
        await this.resizeMacosWorkflowWindow(page, owner, testInfo.project.use.viewport);
      }
      const driver = new LocalElectronApplicationDriver(null, page, desktopDirectory, userDataDirectory,
        mainProcessId, null, options.evidencePrefix ?? '', workflowHostSafetyGuard, { browser, process: child, outputPath, owner });
      driver.mainOutput = output;
      useScreenshotDriver(testInfo, driver);
      return driver;
    } catch (error) {
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(testInfo.outputPath(`${options.evidencePrefix ?? ''}launch-main.log`), output, 'utf8');
      testInfo.annotations.push({ type: 'preserved-user-data', description: userDataDirectory });
      if (workflowHostSafetyGuard) {
        try { await workflowHostSafetyGuard.cleanupRegisteredApplications(); }
        catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'macOS startup failed; application and profile retained because proxy restoration is unresolved.');
        }
      }
      else if (child.exitCode === null && child.signalCode === null) {
        throw new AggregateError([error], 'macOS startup failed without a host guard; application and profile retained for recovery.');
      }
      await browser?.close().catch(() => undefined);
      throw error;
    } finally {
      await outputFile.close();
    }
  }

  private static async resizeMacosWorkflowWindow(
    page: Page,
    owner: WorkflowProcessIdentity,
    size: { width: number; height: number },
  ): Promise<void> {
    await expect.poll(async () => {
      const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
      if (current.processStartedAt !== owner.processStartedAt) throw new Error('Workflow Main process generation changed.');
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${owner.processId}
    return count of windows
  end tell
end tell
`], { encoding: 'utf8' });
      return Number(stdout.trim());
    }, { message: 'Native macOS workflow window was not exposed by System Events' }).toBeGreaterThan(0);
    const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
    if (current.processStartedAt !== owner.processStartedAt) throw new Error('Workflow Main process generation changed.');
    await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${owner.processId}
    set size of window 1 to {${size.width}, ${size.height}}
  end tell
end tell
`], { encoding: 'utf8' });
    await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })), {
      message: 'Native macOS workflow window did not reach the configured size',
    }).toEqual(size);
  }

  /** Return the exact Windows Main generation accepted by native Dialog drivers. */
  windowsMainProcessOwner(): WindowsFileDialogOwner {
    if (!this.windowsMainOwner) {
      throw new Error('Windows Main process identity is unavailable on this platform.');
    }
    return this.windowsMainOwner;
  }

  nativeFileDialogOwner(): WorkflowProcessIdentity {
    return this.macosApplication?.owner ?? this.windowsMainProcessOwner();
  }

  /** Read and register the exact Core generation currently exposed by public UI state. */
  async currentCoreProcessIdentity(): Promise<WorkflowProcessIdentity> {
    if (!this.workflowHostSafetyGuard) {
      throw new Error('Exact Core process identity requires the platform host guard.');
    }
    const processId = await this.readCoreProcessId();
    const processIdentity = await LocalElectronApplicationDriver
      .readProcessIdentity(processId);
    this.workflowHostSafetyGuard.registerProcessIdentity(processIdentity);
    this.corePid = processId;
    return processIdentity;
  }

  /** Terminate one registered Core generation without stopping Electron Main. */
  terminateCoreProcessGeneration(
    processIdentity: WorkflowProcessIdentity,
  ): Promise<void> {
    if (!this.workflowHostSafetyGuard) {
      throw new Error('Core process termination requires the platform host guard.');
    }
    return this.workflowHostSafetyGuard.terminateProcessGeneration(processIdentity);
  }

  async terminateCoreAndVerifyProxyRestoration(
    processIdentity: WorkflowProcessIdentity,
    originalSnapshot: unknown,
    journalModifiedAtNanoseconds: bigint,
  ): Promise<void> {
    switch (process.platform) {
      case 'darwin':
        return this.terminateMacosCoreAndVerifyProxyRestoration(processIdentity, originalSnapshot, journalModifiedAtNanoseconds);
      case 'win32':
        return this.terminateWindowsCoreAndVerifyProxyRestoration(processIdentity, originalSnapshot);
      default: throw new Error('Core recovery evidence requires a supported system proxy platform.');
    }
  }

  private async terminateWindowsCoreAndVerifyProxyRestoration(
    processIdentity: WorkflowProcessIdentity, originalSnapshot: unknown,
  ): Promise<void> {
    await this.terminateCoreProcessGeneration(processIdentity);
    expect((await this.listLiveRegisteredProcessIds()).includes(processIdentity.processId)).toBe(false);
    await expect.poll(() => this.readSystemProxyJournalModificationTime(), {
      message: 'Core recovery did not remove the first crash journal.',
    }).toBeNull();
    await expect.poll(async () => JSON.stringify(await this.readSystemProxySettings()), {
      message: 'Core recovery did not restore original WinINet before restart.',
    }).toBe(JSON.stringify(originalSnapshot));
  }

  private async terminateMacosCoreAndVerifyProxyRestoration(
    processIdentity: WorkflowProcessIdentity, originalSnapshot: unknown, journalModifiedAtNanoseconds: bigint,
  ): Promise<void> {
    const restoration = Promise.all([
      expect.poll(async () => isDeepStrictEqual(await this.readSystemProxySettings(), originalSnapshot), {
        message: 'Core recovery did not restore the complete macOS original snapshot.', timeout: 45_000,
      }).toBe(true),
      expect.poll(async () => await this.readSystemProxyJournalModificationTime() === journalModifiedAtNanoseconds, {
        message: 'Core recovery did not retire the original journal generation.', timeout: 45_000,
      }).toBe(false),
    ]);
    void restoration.catch(() => undefined);
    await this.terminateCoreProcessGeneration(processIdentity);
    await expect.poll(async () => (await this.listLiveRegisteredProcessIds()).includes(processIdentity.processId), {
      message: 'The terminated Core generation did not exit.',
    }).toBe(false);
    await restoration;
  }

  private async readSystemProxyJournalModificationTime(): Promise<bigint | null> {
    try {
      return (await stat(this.systemProxyJournalPath(), { bigint: true })).mtimeNs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async relaunchAfterCrash(testInfo: TestInfo, evidencePrefix: string): Promise<LocalElectronApplicationDriver> {
    switch (process.platform) {
      case 'darwin': return this.relaunchMacosAfterCrash(testInfo, evidencePrefix);
      case 'win32': return this.relaunchWindowsAfterCrash(testInfo, evidencePrefix);
      default: throw new Error('Crash recovery evidence requires a supported system proxy platform.');
    }
  }

  private async relaunchWindowsAfterCrash(testInfo: TestInfo, evidencePrefix: string): Promise<LocalElectronApplicationDriver> {
    const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix });
    expect(restartedApp.userDataDirectory).not.toBe(this.userDataDirectory);
    return restartedApp;
  }

  private async relaunchMacosAfterCrash(testInfo: TestInfo, evidencePrefix: string): Promise<LocalElectronApplicationDriver> {
    const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix });
    expect(restartedApp.userDataDirectory).not.toBe(this.userDataDirectory);
    return restartedApp;
  }

  configureWorkflowTimeout(testInfo: TestInfo, timeout: number): void {
    testInfo.setTimeout(process.platform === 'darwin' ? Math.max(timeout, 300_000) : timeout);
  }

  /** List every workflow-owned process generation still alive. */
  listLiveRegisteredProcessIds(): Promise<readonly number[]> {
    if (!this.workflowHostSafetyGuard) {
      throw new Error('Live process inspection requires the platform host guard.');
    }
    return this.workflowHostSafetyGuard.listLiveRegisteredProcessIds();
  }

  readSystemProxySettings(): Promise<unknown> {
    if (!this.workflowHostSafetyGuard) throw new Error('System proxy evidence requires the platform host guard.');
    return this.workflowHostSafetyGuard.readSystemProxySettings();
  }

  isSystemProxyJournalReady(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    switch (process.platform) {
      case 'win32': return this.isWindowsSystemProxyJournalReady(value);
      case 'darwin': return this.isMacosSystemProxyJournalReady(value);
      default: throw new Error('Journal evidence requires a supported platform.');
    }
  }

  private isWindowsSystemProxyJournalReady(value: object): boolean {
    return 'version' in value && value.version === 1;
  }

  private isMacosSystemProxyJournalReady(value: object): boolean {
    return 'original' in value && 'owned' in value && 'effectiveProxies' in value
      && typeof value.effectiveProxies === 'object' && value.effectiveProxies !== null
      && !Array.isArray(value.effectiveProxies);
  }

  assertSystemProxyJournalFields(value: object): void {
    switch (process.platform) {
      case 'win32':
        expect(Object.keys(value).sort()).toEqual(['original', 'owned', 'version']);
        return;
      case 'darwin':
        expect(Object.keys(value).sort()).toEqual(['effectiveProxies', 'original', 'owned']);
        expect(this.systemProxyJournalPath(), 'The macOS crash journal must survive a profile change')
          .not.toBe(path.join(this.userDataDirectory, 'system-proxy/journal.json'));
        return;
      default: throw new Error('Journal evidence requires a supported platform.');
    }
  }

  matchesSystemProxyEvidence(actual: unknown, expected: unknown): boolean {
    switch (process.platform) {
      case 'win32': return this.matchesWindowsSystemProxyEvidence(actual, expected);
      case 'darwin': return this.matchesMacosSystemProxyEvidence(actual, expected);
      default: throw new Error('System proxy evidence requires a supported platform.');
    }
  }

  private matchesWindowsSystemProxyEvidence(actual: unknown, expected: unknown): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  private matchesMacosSystemProxyEvidence(actual: unknown, expected: unknown): boolean {
    return isDeepStrictEqual(actual, expected);
  }

  systemProxyJournalPath(): string {
    switch (process.platform) {
      case 'darwin': return this.macosSystemProxyJournalPath();
      case 'win32': return this.windowsSystemProxyJournalPath();
      default: throw new Error('System proxy evidence requires a supported platform.');
    }
  }

  private macosSystemProxyJournalPath(): string {
    return resolveMacosSystemProxyJournalPath(os.homedir());
  }

  private windowsSystemProxyJournalPath(): string {
    const localAppDataDirectory = process.env.LOCALAPPDATA;
    if (!localAppDataDirectory) throw new Error('LOCALAPPDATA is required for system proxy recovery evidence.');
    return path.join(localAppDataDirectory, 'Interceptor', 'system-proxy', 'journal.json');
  }

  /** Wait for a new Core PID and register its process tree and capture listener. */
  async waitForRestartedCoreProcess(
    previousProcessId: number,
  ): Promise<WorkflowProcessIdentity> {
    await expect.poll(
      () => this.readCoreProcessId(),
      { message: 'Core did not restart with a new PID', timeout: 20_000 },
    ).not.toBe(previousProcessId);
    await expect.poll(
      () => LocalElectronApplicationDriver.canConnectPort(DEFAULT_CAPTURE_PORT),
      { message: 'Restarted Core listener did not start on 8888', timeout: 20_000 },
    ).toBe(true);
    const processIdentity = await this.currentCoreProcessIdentity();
    await this.workflowHostSafetyGuard?.captureProcessTrees();
    await this.workflowHostSafetyGuard?.registerCaptureListenerProcess();
    return processIdentity;
  }

  /** Wait until Renderer, Core and Capture bootstrap reach a stable workflow state. */
  async waitUntilReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    if (process.platform === 'darwin') {
      await waitForMacosStartupCertificateAuthorization(this.page, this.nativeFileDialogOwner());
    }
    await expect(getByAutomationId(this.page, AUTOMATION_IDS.app.root)).toBeVisible({ timeout: 120_000 });
    if (process.platform === 'darwin') {
      const applicationPath = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH ? resolveMacosApplicationPath() : null;
      const helperPath = applicationPath
        ? path.join(applicationPath, 'Contents/Resources/system-proxy/macos-proxy-helper')
        : path.join(this.desktopDirectory, '../../packages/platform-capabilities/dist/system-proxy/macos-proxy-helper');
      const { stdout } = await execFileAsync(helperPath, applicationPath
        ? ['deployment-status', applicationPath, String(process.getuid!())]
        : ['development-deployment-status', String(process.getuid!())], { encoding: 'utf8' });
      expect(JSON.parse(stdout).state, 'Main must deploy its bundled helper before exposing the App').toBe('ready');
    }

    const coreStatus = this.page.locator('[title*=" · PID "]');
    await expect(coreStatus).toHaveAttribute(
      'title',
      / · PID \d+$/,
      { timeout: 20_000 },
    );
    const coreTitle = await coreStatus.getAttribute('title');
    const corePid = coreTitle?.match(/PID (\d+)/)?.[1];
    this.corePid = corePid ? Number(corePid) : null;
    if (
      this.corePid !== null
      && this.workflowHostSafetyGuard
    ) {
      this.workflowHostSafetyGuard.registerProcessIdentity(
        await LocalElectronApplicationDriver.readProcessIdentity(
          this.corePid,
        ),
      );
    }

    this.listenerPort = DEFAULT_CAPTURE_PORT;
    await expect.poll(
      () => LocalElectronApplicationDriver.canConnectPort(DEFAULT_CAPTURE_PORT),
      { message: 'Capture listener did not start on 8888', timeout: 20_000 },
    ).toBe(true);

    await this.workflowHostSafetyGuard?.registerCaptureListenerProcess();
    await this.workflowHostSafetyGuard?.captureProcessTrees();

    if (process.platform === 'darwin') {
      await expect.poll(async () => {
        const bootScreen = getByAutomationId(this.page, AUTOMATION_IDS.shell.boot.screen);
        const phase = await bootScreen.evaluateAll((elements) => elements[0]?.getAttribute('data-phase') ?? null);
        if (phase === 'error') throw new Error('App reported a startup failure; inspect the Main log and startup trace.');
        return !await bootScreen.isVisible();
      }, { message: 'App startup did not finish', timeout: 120_000 }).toBe(true);
    }
    await this.dismissProxyReadiness();
  }

  /** Return the Capture listener port after waitUntilReady has verified it. */
  capturePort(): number {
    if (this.listenerPort === null) {
      throw new Error('Capture listener port is unavailable before application readiness.');
    }
    return this.listenerPort;
  }

  /** Keep this profile only when the workflow fails, so privileged cleanup remains possible. */
  preserveUserDataOnFailure(): void {
    this.preserveUserDataAfterFailure = true;
  }

  /** Report whether a failed workflow requested profile retention. */
  shouldPreserveUserDataOnFailure(): boolean {
    return this.preserveUserDataAfterFailure;
  }

  /** Allow normal profile deletion after a privileged cleanup completed successfully. */
  releasePreservedUserData(): void {
    this.preserveUserDataAfterFailure = false;
  }

  /** Return uncaught Renderer errors collected from the real page. */
  rendererPageErrors(): readonly string[] {
    return this.rendererOutput
      .split('\n')
      .filter((line) => line.startsWith('[renderer:pageerror]'));
  }

  /** Register one runtime-generated sensitive value before it enters the application. */
  registerSensitiveTextForEvidenceAudit(sensitiveText: string): void {
    this.sensitiveEvidenceTexts.add(sensitiveText);
    if (this.mainOutput.includes(sensitiveText) || this.rendererOutput.includes(sensitiveText)) {
      this.sensitiveTextFoundInProcessOutput = true;
    }
  }

  /** Read the owned primary window through the driver's native platform boundary. */
  async windowState(): Promise<DesktopWindowState> {
    if (!this.application) {
      const available = await this.page.evaluate(() => ({ width: screen.availWidth, height: screen.availHeight }));
      const output = await this.runMacosWindowScript(`
const size = window.size();
JSON.stringify({
  minimized: attribute(window, "AXMinimized") === true,
  maximized: size[0] === ${available.width} && size[1] === ${available.height},
  visible: owned.visible() && attribute(window, "AXMinimized") !== true
});
`);
      const state: unknown = JSON.parse(output);
      if (typeof state !== 'object' || state === null
        || !('minimized' in state) || typeof state.minimized !== 'boolean'
        || !('maximized' in state) || typeof state.maximized !== 'boolean'
        || !('visible' in state) || typeof state.visible !== 'boolean') {
        throw new Error('The owned macOS window returned invalid state.');
      }
      return { minimized: state.minimized, maximized: state.maximized, visible: state.visible };
    }
    return this.application.evaluate(({ BrowserWindow }) => {
      const [mainWindow] = BrowserWindow.getAllWindows();
      return {
        minimized: mainWindow?.isMinimized() ?? false,
        maximized: mainWindow?.isMaximized() ?? false,
        visible: mainWindow?.isVisible() ?? false,
      };
    });
  }

  /** Restore and focus the primary BrowserWindow after a minimize assertion. */
  async restoreWindow(): Promise<void> {
    if (!this.application) {
      await this.runMacosWindowScript(`
const minimized = window.attributes.whose({ name: "AXMinimized" })()[0];
if (!minimized) throw new Error("The owned window omitted AXMinimized");
minimized.value = false;
owned.frontmost = true;
`);
      return;
    }
    await this.application.evaluate(({ BrowserWindow }) => {
      const [mainWindow] = BrowserWindow.getAllWindows();
      mainWindow?.restore();
      mainWindow?.show();
      mainWindow?.focus();
    });
    await this.page.bringToFront();
  }

  /** Restrict native window assertions and restoration to this exact workflow Main. */
  private async runMacosWindowScript(operation: string): Promise<string> {
    const owner = this.nativeFileDialogOwner();
    const identity = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
    if (identity.processStartedAt !== owner.processStartedAt) {
      throw new Error('The workflow window owner changed generation.');
    }
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const matches = Application("System Events").applicationProcesses.whose({ unixId: ${owner.processId} })();
if (matches.length !== 1) throw new Error("The workflow-owned App is unavailable");
const owned = matches[0];
function attribute(element, name) {
  const values = element.attributes.whose({ name })();
  return values.length ? values[0].value() : null;
}
const windows = owned.windows().filter(window => !["save-panel", "open-panel"].includes(attribute(window, "AXIdentifier")));
if (windows.length !== 1) throw new Error("Expected one workflow-owned main window");
const window = windows[0];
${operation}
`], { encoding: 'utf8', timeout: 10_000 });
    return stdout;
  }

  /** Click the product Close control and wait for Electron's terminal close event. */
  async closeFromWindowButton(): Promise<void> {
    if (this.applicationClosed || this.page.isClosed()) {
      return;
    }
    const closePromise = this.waitForApplicationClose();
    void closePromise.catch(() => undefined);
    this.shutdownKind = 'graceful';
    await this.page.keyboard.press('Escape').catch(() => undefined);
    await this.page
      .locator(`[data-automation-id="${AUTOMATION_IDS.shell.window.close}"]`)
      .last()
      .click();
    await closePromise;
  }

  private async waitForApplicationClose(): Promise<void> {
    if (this.application) {
      await this.application.waitForEvent('close', { timeout: 15_000 });
      return;
    }
    const child = this.macosApplication!.process;
    if (child.exitCode !== null || child.signalCode !== null) return;
    let timeout: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        once(child, 'close'),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('macOS App did not exit after product Close.')), 120_000); }),
      ]);
    } finally { clearTimeout(timeout!); }
  }

  async closeFromNativeShortcut(): Promise<void> {
    switch (process.platform) {
      case 'win32': return this.closeWindowsFromNativeShortcut();
      case 'darwin': return this.closeMacosFromNativeShortcut();
      default: throw new Error('Native window shortcut requires Windows or macOS.');
    }
  }

  private async closeWindowsFromNativeShortcut(): Promise<void> {
    if (this.applicationClosed || this.page.isClosed()) return;
    await this.page.bringToFront();
    const encodedOwner = Buffer.from(JSON.stringify(this.windowsMainProcessOwner()), 'utf8').toString('base64');
    const closed = this.application!.waitForEvent('close', { timeout: 15_000 });
    void closed.catch(() => undefined);
    this.shutdownKind = 'graceful';
    await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TestWindowIdentity {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);
}
'@
$owner = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedOwner}')) | ConvertFrom-Json
$ownerProcess = Get-Process -Id $owner.processId
$expectedStart = [DateTimeOffset]::Parse($owner.processStartedAt).UtcDateTime
if ($ownerProcess.StartTime.ToUniversalTime() -ne $expectedStart) { throw 'Test Main process generation changed.' }
$windowHandle = [TestWindowIdentity]::GetForegroundWindow()
[uint32]$foregroundProcessId = 0
[void][TestWindowIdentity]::GetWindowThreadProcessId($windowHandle, [ref]$foregroundProcessId)
if ($windowHandle -eq [IntPtr]::Zero -or $foregroundProcessId -ne $owner.processId -or $windowHandle -ne $ownerProcess.MainWindowHandle) {
  throw 'Test Main window is not the foreground window; no keys were sent.'
}
[System.Windows.Forms.SendKeys]::SendWait('%{F4}')
`], { encoding: 'utf8', windowsHide: true });
    await closed;
  }

  private async closeMacosFromNativeShortcut(): Promise<void> {
    if (this.applicationClosed || this.page.isClosed()) return;
    const owner = this.macosApplication!.owner;
    const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
    if (current.processStartedAt !== owner.processStartedAt) throw new Error('Test Main process generation changed.');
    const closed = this.waitForApplicationClose();
    void closed.catch(() => undefined);
    this.shutdownKind = 'graceful';
    await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application("System Events");
const owners = events.applicationProcesses.whose({ unixId: ${owner.processId} })();
if (owners.length !== 1 || owners[0].windows().length !== 1) throw new Error("Test Main window is unavailable");
const ownedApp = owners[0];
ownedApp.frontmost = true;
if (!ownedApp.frontmost()) throw new Error("Test Main window is not in the foreground; no keys were sent");
events.keyCode(12, { using: ["command down"] });
`], { encoding: 'utf8', timeout: 15_000 });
    await closed;
  }

  /** Stop evidence, terminate the owned process tree without product shutdown and prove release. */
  async crashAbruptly(testInfo: TestInfo): Promise<void> {
    if (this.applicationClosed) {
      return;
    }
    await this.stopTrace(testInfo);
    this.shutdownKind = 'abrupt';
    if (this.mainPid === null) {
      throw new Error('Electron Main PID is unavailable for abrupt termination.');
    }
    if (this.workflowHostSafetyGuard) {
      await this.workflowHostSafetyGuard.terminateRegisteredApplications();
    } else if (!(this.application?.process() ?? this.macosApplication!.process).kill('SIGKILL')) {
      throw new Error('Electron Main rejected the intentional abrupt termination.');
    }
    await this.verifyProcessesAndListenerReleased();
    this.applicationClosed = true;
    this.abruptDestroyVerified = true;
    if (this.macosApplication) await this.writeEvidence(testInfo);
  }

  /** Capture the final visible Renderer state for attachment after evidence auditing. */
  async captureFinalScreenshot(testInfo: TestInfo): Promise<void> {
    if (this.page.isClosed()) {
      return;
    }
    const visibleText = await this.page.locator('body').innerText();
    const visibleInputValues = await this.page.locator('input:visible, textarea:visible')
      .evaluateAll((elements) => elements.map((element) => (
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : ''
      )));
    const visibleEvidence = `${visibleText}\n${visibleInputValues.join('\n')}`;
    if ([...this.sensitiveEvidenceTexts].some((text) => visibleEvidence.includes(text))) {
      throw new Error('Sensitive text was found in the final visible Renderer state.');
    }
    const screenshotPath = testInfo.outputPath(this.evidenceName('final.png'));
    await this.page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
    });
    this.finalScreenshotPath = screenshotPath;
  }

  /** Resume BrowserContext tracing after a deliberate sensitive-input interval. */
  async startTrace(testInfo: TestInfo): Promise<void> {
    if (this.traceActive) {
      throw new Error('BrowserContext trace is already active.');
    }
    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
      title: this.evidencePrefix
        ? `${testInfo.title} · ${this.evidencePrefix}`
        : testInfo.title,
    });
    this.traceActive = true;
  }

  /** Stop and retain the BrowserContext trace until evidence auditing succeeds. */
  async stopTrace(testInfo: TestInfo): Promise<void> {
    if (!this.traceActive) {
      return;
    }
    this.traceActive = false;
    const segment = this.tracePaths.length + 1;
    const tracePath = testInfo.outputPath(this.evidenceName(
      segment === 1 ? 'trace.zip' : `trace-${segment}.zip`,
    ));
    await this.context.tracing.stop({ path: tracePath });
    this.tracePaths.push(tracePath);
  }

  /** Prove that one sensitive value is absent from trace and process-log evidence. */
  async assertSensitiveTextAbsentFromEvidence(sensitiveText: string): Promise<void> {
    await this.assertSensitiveTextsAbsentFromEvidence([sensitiveText]);
  }

  /** Prove that registered sensitive values are absent before any raw evidence is attached. */
  private async assertSensitiveTextsAbsentFromEvidence(
    sensitiveTexts: readonly string[],
  ): Promise<void> {
    await this.collectMacosProcessOutput(sensitiveTexts);
    if (sensitiveTexts.length === 0) return;
    if (this.tracePaths.length === 0) {
      throw new Error('Trace must be stopped before sensitive evidence is audited.');
    }
    if (this.sensitiveTextFoundInProcessOutput
      || sensitiveTexts.some((text) => (
        this.mainOutput.includes(text) || this.rendererOutput.includes(text)
      ))) {
      throw new Error('Sensitive text was found in process-log evidence.');
    }

    const extractionDirectory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-trace-audit-'));
    try {
      const sensitiveBytes = sensitiveTexts.map((text) => Buffer.from(text, 'utf8'));
      for (const [index, tracePath] of this.tracePaths.entries()) {
        const segmentDirectory = path.join(extractionDirectory, String(index));
        await mkdir(segmentDirectory);
        await extract(tracePath, { dir: segmentDirectory });
        const entries = await readdir(segmentDirectory, {
          recursive: true,
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const bytes = await readFile(path.join(entry.parentPath, entry.name));
          if (sensitiveBytes.some((value) => bytes.includes(value))) {
            throw new Error('Sensitive text was found in Playwright trace evidence.');
          }
        }
      }
    } finally {
      await rm(extractionDirectory, { force: true, recursive: true });
    }
  }

  /** Request normal application shutdown and prove Main, Core and listener cleanup. */
  async closeGracefully(): Promise<void> {
    if (!this.applicationClosed && !this.page.isClosed()) {
      await this.closeFromWindowButton();
    }

    await this.verifyProcessesAndListenerReleased();
    if (this.shutdownKind === 'graceful') {
      this.gracefulDestroyVerified = true;
    }
  }

  /** Persist process logs and metadata after the workflow and destroy assertions finish. */
  async writeEvidence(testInfo: TestInfo): Promise<void> {
    await this.assertSensitiveTextsAbsentFromEvidence([...this.sensitiveEvidenceTexts]);
    const mainLogPath = testInfo.outputPath(this.evidenceName('main-process.log'));
    const rendererLogPath = testInfo.outputPath(this.evidenceName('renderer-console.log'));
    const metadataPath = testInfo.outputPath(this.evidenceName('metadata.json'));
    await Promise.all([
      writeFile(mainLogPath, this.mainOutput, 'utf8'),
      writeFile(rendererLogPath, this.rendererOutput, 'utf8'),
      writeFile(
        metadataPath,
        JSON.stringify({
          target: this.macosApplication && process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
            ? 'macos-signed-app' : 'local-electron',
          platform: process.platform,
          architecture: process.arch,
          workflow: testInfo.annotations.find(
            (annotation) => annotation.type === 'renderer-workflow',
          )?.description ?? null,
          mainPid: this.mainPid,
          corePid: this.corePid,
          listenerPort: this.listenerPort,
          gracefulDestroyVerified: this.gracefulDestroyVerified,
          abruptDestroyVerified: this.abruptDestroyVerified,
          generation: this.evidencePrefix || 'initial',
          playwrightVersion: require('@playwright/test/package.json').version,
          electronVersion: require('electron/package.json').version,
        }, null, 2),
        'utf8',
      ),
    ]);
    await Promise.all([
      ...(this.finalScreenshotPath === null ? [] : [testInfo.attach(
        this.evidenceName('final-state'),
        {
          path: this.finalScreenshotPath,
          contentType: 'image/png',
        },
      )]),
      ...this.tracePaths.map((tracePath, index) => testInfo.attach(this.evidenceName(
        index === 0 ? 'playwright-trace' : `playwright-trace-${index + 1}`,
      ), {
        path: tracePath,
        contentType: 'application/zip',
      })),
      testInfo.attach(this.evidenceName('main-process-log'), {
        path: mainLogPath,
        contentType: 'text/plain',
      }),
      testInfo.attach(this.evidenceName('renderer-console-log'), {
        path: rendererLogPath,
        contentType: 'text/plain',
      }),
      testInfo.attach(this.evidenceName('workflow-metadata'), {
        path: metadataPath,
        contentType: 'application/json',
      }),
    ]);
  }

  /** Force only this test's known Electron/Core processes to stop after cleanup failure. */
  async forceCleanup(): Promise<void> {
    if (this.macosApplication) {
      try {
        if (!this.workflowHostSafetyGuard) throw new Error('macOS forced cleanup requires a captured host baseline.');
        await this.workflowHostSafetyGuard.cleanupRegisteredApplications();
      } catch (error) {
        this.preserveUserDataAfterFailure = true;
        throw error;
      }
      await this.macosApplication.browser.close().catch(() => undefined);
      return;
    }
    if (!this.applicationClosed) {
      await this.application?.close().catch(() => undefined);
    }
    if (this.workflowHostSafetyGuard) {
      await this.workflowHostSafetyGuard.terminateRegisteredApplications()
        .catch(() => undefined);
    } else if (
      this.corePid !== null
      && LocalElectronApplicationDriver.isProcessAlive(this.corePid)
    ) {
      process.kill(this.corePid);
    }
  }

  /** Delete the isolated profile after all application file handles are closed. */
  async removeUserData(): Promise<void> {
    await rm(this.userDataDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }

  /** Collect bounded stdout/stderr and Electron Main console output. */
  private captureProcessOutput(): void {
    if (this.macosApplication) return;
    const append = (value: string): void => {
      const output = `${this.mainOutput}${value}`;
      this.recordSensitiveTextMatch(output);
      this.mainOutput = output.slice(-128_000);
    };
    const child = this.application?.process() ?? this.macosApplication!.process;
    child.stdout?.on('data', (chunk: Buffer | string) => {
      append(chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      append(chunk.toString());
    });
    this.application?.on('console', (message) => {
      append(`[main:${message.type()}] ${message.text()}\n`);
    });
  }

  private async collectMacosProcessOutput(sensitiveTexts: readonly string[]): Promise<void> {
    if (!this.macosApplication) return;
    this.mainOutput = '';
    for await (const chunk of createReadStream(this.macosApplication.outputPath, { encoding: 'utf8' })) {
      const output = this.mainOutput + chunk;
      this.recordSensitiveTextMatch(output);
      if (sensitiveTexts.some((text) => output.includes(text))) this.sensitiveTextFoundInProcessOutput = true;
      this.mainOutput = output.slice(-128_000);
    }
  }

  /** Collect bounded Renderer console output and uncaught page errors. */
  private captureRendererOutput(): void {
    const append = (value: string): void => {
      const output = `${this.rendererOutput}${value}`;
      this.recordSensitiveTextMatch(output);
      this.rendererOutput = output.slice(-128_000);
    };
    this.page.on('console', (message) => {
      append(`[renderer:${message.type()}] ${message.text()}\n`);
    });
    this.page.on('pageerror', (error) => {
      append(`[renderer:pageerror] ${error.stack ?? error.message}\n`);
    });
  }

  /** Record a sensitive match before bounded evidence drops older output. */
  private recordSensitiveTextMatch(output: string): void {
    if ([...this.sensitiveEvidenceTexts].some((sensitiveText) => output.includes(sensitiveText))) {
      this.sensitiveTextFoundInProcessOutput = true;
    }
  }

  /** Prefix one evidence filename or attachment without changing initial-run names. */
  private evidenceName(name: string): string {
    return this.evidencePrefix ? `${this.evidencePrefix}-${name}` : name;
  }

  /** Prove the known Main/Core processes exited and the listener can be rebound. */
  private async verifyProcessesAndListenerReleased(): Promise<void> {
    if (this.workflowHostSafetyGuard) {
      await expect.poll(
        () => this.workflowHostSafetyGuard!.listLiveRegisteredProcessIds(),
        { message: 'Tracked Electron process generations did not exit', timeout: 10_000 },
      ).toEqual([]);
    } else if (this.mainPid !== null) {
      const mainPid = this.mainPid;
      await expect.poll(
        () => LocalElectronApplicationDriver.isProcessAlive(mainPid),
        { message: `Electron Main PID ${mainPid} did not exit`, timeout: 10_000 },
      ).toBe(false);
    }
    if (
      !this.workflowHostSafetyGuard
      && this.corePid !== null
    ) {
      const corePid = this.corePid;
      await expect.poll(
        () => LocalElectronApplicationDriver.isProcessAlive(corePid),
        { message: `Proxy Core PID ${corePid} did not exit`, timeout: 10_000 },
      ).toBe(false);
    }
    if (this.listenerPort !== null) {
      const listenerPort = this.listenerPort;
      await expect.poll(
        () => LocalElectronApplicationDriver.canBindPort(listenerPort),
        { message: `Capture port ${listenerPort} was not released`, timeout: 10_000 },
      ).toBe(true);
    }
  }

  /** Dismiss the expected fresh-profile proxy readiness modal without changing OS settings. */
  private async dismissProxyReadiness(): Promise<void> {
    const cancel = getByAutomationId(
      this.page,
      AUTOMATION_IDS.capture.readiness.cancel,
    );
    const recording = getByAutomationId(
      this.page,
      AUTOMATION_IDS.capture.recordingToggle,
    );
    await expect.poll(async () => {
      if (await cancel.isVisible().catch(() => false)) {
        return 'prompt';
      }
      if (await recording.getAttribute('aria-pressed') === 'true') {
        return 'recording';
      }
      return 'pending';
    }, {
      message: 'Proxy readiness did not settle',
      timeout: 20_000,
    }).not.toBe('pending');

    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
  }

  /** Create an isolated userData directory outside the repository. */
  private static async createUserDataDirectory(): Promise<string> {
    const root = path.join(os.tmpdir(), 'interceptor-e2e-workflow');
    await mkdir(root, { recursive: true });
    return await import('node:fs/promises').then(({ mkdtemp }) =>
      mkdtemp(path.join(root, `${process.pid}-`)),
    );
  }

  /** Keep fixture locale configuration out of the App environment and omit undefined values. */
  private static createLaunchEnvironment(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== E2E_DESKTOP_DIRECTORY_ENV
          && entry[0] !== 'INTERCEPTOR_E2E_LOCALE'
          && entry[1] !== undefined,
      ),
    );
  }

  /** Report whether one known process identifier still belongs to a live process. */
  private static isProcessAlive(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  /** Probe whether a released loopback listener port can be rebound. */
  private static async canBindPort(port: number): Promise<boolean> {
    const server = net.createServer();
    server.unref();
    try {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
      return true;
    } catch {
      return false;
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  }

  /** Probe whether the real loopback listener accepts a TCP connection. */
  private static async canConnectPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.unref();
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /** Resolve one test process generation through its native operating-system query. */
  private static async readProcessIdentity(
    processId: number,
  ): Promise<WindowsFileDialogOwner> {
    if (process.platform === 'darwin') {
      return MacosWorkflowHostSafetyOperations.readProcessIdentity(processId);
    }
    const script = [
      `$process = Get-Process -Id ${processId} -ErrorAction Stop;`,
      '[pscustomobject]@{',
      'processId = [int]$process.Id;',
      "processStartedAt = $process.StartTime.ToUniversalTime().ToString('O', [Globalization.CultureInfo]::InvariantCulture)",
      '} | ConvertTo-Json -Compress',
    ].join(' ');
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true },
    );
    const value = JSON.parse(stdout) as {
      readonly processId?: unknown;
      readonly processStartedAt?: unknown;
    };
    if (value.processId !== processId || typeof value.processStartedAt !== 'string') {
      throw new Error('PowerShell could not identify the Electron process generation.');
    }
    return { processId, processStartedAt: value.processStartedAt };
  }

  /** Read the current Core PID from the same public status title visible to users. */
  private async readCoreProcessId(): Promise<number> {
    const title = await this.page.locator('[title*=" · PID "]').getAttribute('title');
    const processId = Number(title?.match(/PID (\d+)$/)?.[1]);
    if (!Number.isInteger(processId) || processId <= 0) {
      throw new Error('Current Core PID is unavailable from public UI state.');
    }
    return processId;
  }
}

export const test = base.extend<LocalWorkflowFixtures>({
  stepScreenshots: [false, { option: true }],
  stepScreenshotEvidence: [async ({ stepScreenshots }, use, testInfo) => {
    startStepScreenshots(testInfo, stepScreenshots);
    try { await use(); }
    finally { await finishStepScreenshots(testInfo); }
  }, { auto: true }],
  allowSharedCertificateInitialization: [false, { option: true }],
  dismissTlsCompatibilityDialogs: [true, { option: true }],
  waitForStartupReady: [true, { option: true }],
  desktopAppUserDataDirectory: [undefined, { option: true }],
  preserveDesktopAppUserData: [false, { option: true }],
  desktopApp: [async ({
    allowSharedCertificateInitialization, dismissTlsCompatibilityDialogs, waitForStartupReady,
    desktopAppUserDataDirectory, preserveDesktopAppUserData,
  }, use, testInfo) => {
    let userDataDirectory: string | undefined;
    if (desktopAppUserDataDirectory !== undefined) {
      const root = await realpath(path.join(os.tmpdir(), 'interceptor-e2e-workflow'));
      userDataDirectory = await realpath(desktopAppUserDataDirectory);
      if (path.dirname(userDataDirectory) !== root || !(await stat(userDataDirectory)).isDirectory()) {
        throw new Error('An interactive workflow can only resume an existing profile directly inside the E2E temporary root.');
      }
    }
    if (!allowSharedCertificateInitialization) await requireSharedCertificateReady();
    const workflowHostSafetyGuard = await createWorkflowHostSafetyGuard();
    if (workflowHostSafetyGuard) {
      await workflowHostSafetyGuard.captureBaseline();
      workflowHostSafetyGuardByTestInfo.set(testInfo, workflowHostSafetyGuard);
    }
    let driver: LocalElectronApplicationDriver | null = null;
    let workflowError: unknown;
    let cleanupError: unknown;
    let hostSafetyError: unknown;
    dismissTlsCompatibilityByTestInfo.set(testInfo, dismissTlsCompatibilityDialogs);
    try {
      driver = await LocalElectronApplicationDriver.launch(testInfo, {
        ...(userDataDirectory === undefined ? {} : { userDataDirectory }),
      });
      if (waitForStartupReady) await driver.waitUntilReady();
      await use(driver);
      if (process.platform !== 'darwin' || testInfo.status !== 'timedOut') {
        await driver.captureFinalScreenshot(testInfo);
      }
    } catch (error) {
      workflowError = error;
    } finally {
      if (driver) {
        try {
          if (process.platform === 'darwin' && testInfo.status === 'timedOut') {
            await driver.closeGracefully();
            testInfo.annotations.push({
              type: 'trace-unavailable',
              description: 'The timed-out macOS application was quit before Renderer trace collection to restore the host proxy.',
            });
          } else {
            await driver.stopTrace(testInfo);
            await driver.closeGracefully();
          }
        } catch (error) {
          cleanupError = error;
        }
        try {
          await driver.writeEvidence(testInfo);
        } catch (error) {
          cleanupError = cleanupError === undefined ? error
            : new AggregateError([cleanupError, error], 'Application cleanup and evidence writing both failed.');
        }
        try { await driver.forceCleanup(); }
        catch (error) {
          cleanupError = cleanupError === undefined ? error
            : new AggregateError([cleanupError, error], 'Application cleanup could not safely finish.');
        }
      }
      if (workflowHostSafetyGuard) {
        try {
          await workflowHostSafetyGuard.verifyRestored();
        } catch (error) {
          hostSafetyError = error;
        } finally {
          workflowHostSafetyGuardByTestInfo.delete(testInfo);
        }
      }
      if (driver) {
        const preserveUserData = preserveDesktopAppUserData || shouldPreserveWorkflowProfile({
          testStatus: testInfo.status,
          preserveOnFailure: driver.shouldPreserveUserDataOnFailure(),
          workflowError,
          cleanupError,
          hostSafetyError,
        });
        if (!preserveUserData) {
          await driver.removeUserData();
        } else {
          testInfo.annotations.push({
            type: 'preserved-user-data',
            description: driver.userDataDirectory,
          });
        }
      }
      dismissTlsCompatibilityByTestInfo.delete(testInfo);
    }
    const errors: unknown[] = [workflowError, cleanupError, hostSafetyError]
      .filter((error) => error !== undefined);
    recordScreenshotHostRestoration(testInfo, hostSafetyError === undefined && workflowHostSafetyGuard !== null);
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Workflow and host cleanup both failed.');
    }
  }, { timeout: process.platform === 'darwin' ? 600_000 : undefined }],
  trafficLab: async ({}, use) => {
    const trafficLab = await TrafficLab.start();
    try {
      recordScreenshotExample('http-origin', trafficLab.httpTrafficRunner.url('/'));
      await use(trafficLab);
    } finally {
      await trafficLab.close();
    }
  },
  httpTrafficRunner: async ({ trafficLab }, use) => {
    await use(trafficLab.httpTrafficRunner);
  },
  webSocketTrafficRunner: async ({ trafficLab }, use) => {
    await use(trafficLab.webSocketTrafficRunner);
  },
  openAiCompatibleLab: async ({}, use) => {
    const openAiCompatibleLab = await OpenAiCompatibleLab.start();
    try {
      recordScreenshotExample('model-origin', openAiCompatibleLab.baseUrl('keyed'));
      await use(openAiCompatibleLab);
    } finally {
      await openAiCompatibleLab.close();
    }
  },
  tlsTrafficRunner: async ({ trafficLab }, use) => {
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    recordScreenshotExample('tls-origin', `https://localhost:${tlsTrafficRunner.port}/`);
    await use(tlsTrafficRunner);
  },
  playgroundServer: async ({}, use, testInfo) => {
    const playgroundServer = await PlaygroundServer.start();
    let cleanupError: unknown;
    try {
      await use(playgroundServer);
    } finally {
      try {
        await playgroundServer.close();
      } catch (error) {
        cleanupError = error;
      }
      await playgroundServer.writeEvidence(testInfo).catch(() => undefined);
    }
    if (cleanupError) throw cleanupError;
  },
});

/** Resolve the unpackaged desktop bundle shared by launch and host-safety operations. */
function resolveDesktopDirectory(): string {
  return process.env[E2E_DESKTOP_DIRECTORY_ENV]
    ? path.resolve(process.env[E2E_DESKTOP_DIRECTORY_ENV])
    : path.resolve(__dirname, '../../../..');
}

export function resolveMacosApplicationPath(): string {
  return process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
    ? path.resolve(process.env.INTERCEPTOR_E2E_MACOS_APP_PATH)
    : path.resolve(__dirname, '../../../../out', `Interceptor-darwin-${process.arch}`, 'Interceptor.app');
}

/** Create the platform host guard before any real Electron process starts. */
async function createWorkflowHostSafetyGuard(): Promise<WorkflowHostSafetyGuard | null> {
  if (process.platform === 'darwin') {
    return new WorkflowHostSafetyGuard(
      new MacosWorkflowHostSafetyOperations(resolveDesktopDirectory(),
        process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
          ? path.join(resolveMacosApplicationPath(), 'Contents/Resources/system-proxy/macos-proxy-helper')
          : undefined),
      'macOS',
    );
  }
  if (process.platform !== 'win32') {
    return null;
  }
  const localAppDataDirectory = process.env.LOCALAPPDATA;
  if (!localAppDataDirectory) {
    throw new Error('LOCALAPPDATA is required for Windows workflow host protection.');
  }
  return new WorkflowHostSafetyGuard(new WindowsWorkflowHostSafetyOperations({
    desktopDirectory: resolveDesktopDirectory(),
    localAppDataDirectory,
    dismissDialogs: dismissWindowsFileDialogs,
  }));
}

export { expect };
