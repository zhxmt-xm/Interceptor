import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  _electron as electron,
  expect,
  test as base,
  type BrowserContext,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';
import extract from 'extract-zip';

import { AUTOMATION_IDS } from '../../../src/shared/automation-ids';
import { getByAutomationId } from './automation';
import { LoopbackLab } from './loopback-lab';
import { OpenAiCompatibleLab } from './openai-compatible-lab';
import { PlaygroundServer } from './playground-server';
import { WebSocketLab } from './websocket-lab';
import {
  dismissWindowsFileDialogs,
  type WindowsFileDialogOwner,
} from './windows-file-dialog';
import {
  WorkflowHostSafetyGuard,
  type WorkflowProcessIdentity,
} from './workflow-host-safety-guard';
import { WindowsWorkflowHostSafetyOperations } from './windows-workflow-host-safety-operations';

const DEFAULT_CAPTURE_PORT = 8888;
const E2E_DESKTOP_DIRECTORY_ENV = 'INTERCEPTOR_E2E_DESKTOP_DIRECTORY';
const execFileAsync = promisify(execFile);
const workflowHostSafetyGuardByTestInfo = new WeakMap<TestInfo, WorkflowHostSafetyGuard>();

interface LocalWorkflowFixtures {
  /** Test-owned unpackaged Electron application and its real Renderer page. */
  desktopApp: LocalElectronApplicationDriver;
  /** Random-port HTTP origin and explicit-proxy client owned by this test. */
  loopbackLab: LoopbackLab;
  /** Random-port WebSocket origin and explicit-proxy clients owned by this test. */
  webSocketLab: WebSocketLab;
  /** Random-port OpenAI-compatible endpoint owned by Agent workflows. */
  openAiCompatibleLab: OpenAiCompatibleLab;
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
  readonly application: ElectronApplication;

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
    application: ElectronApplication,
    page: Page,
    desktopDirectory: string,
    userDataDirectory: string,
    mainProcessId: number,
    windowsMainOwner: WindowsFileDialogOwner | null,
    evidencePrefix: string,
    workflowHostSafetyGuard: WorkflowHostSafetyGuard | null,
  ) {
    this.application = application;
    this.context = application.context();
    this.page = page;
    this.desktopDirectory = desktopDirectory;
    this.userDataDirectory = userDataDirectory;
    this.evidencePrefix = evidencePrefix;
    this.workflowHostSafetyGuard = workflowHostSafetyGuard;
    this.mainPid = mainProcessId;
    this.windowsMainOwner = windowsMainOwner;
    application.once('close', () => {
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
    const desktopDirectory = resolveDesktopDirectory();
    const ownsUserDataDirectory = options.userDataDirectory === undefined;
    const userDataDirectory = options.userDataDirectory
      ?? await LocalElectronApplicationDriver.createUserDataDirectory();
    let application: ElectronApplication | null = null;

    try {
      application = await electron.launch({
        args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
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
        ? await this.readWindowsProcessIdentity(mainProcessId)
        : null;
      if (workflowHostSafetyGuard) {
        const rootProcessIds = [...new Set([
          launchProcessId,
          mainProcessId,
        ].filter((processId): processId is number => processId !== undefined))];
        for (const rootProcessId of rootProcessIds) {
          const processIdentity = rootProcessId === mainProcessId && windowsMainOwner
            ? windowsMainOwner
            : await this.readWindowsProcessIdentity(rootProcessId);
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
      const page = await application.firstWindow({ timeout: 20_000 });
      return new LocalElectronApplicationDriver(
        application,
        page,
        desktopDirectory,
        userDataDirectory,
        mainProcessId,
        windowsMainOwner,
        options.evidencePrefix ?? '',
        workflowHostSafetyGuard,
      );
    } catch (error) {
      await application?.close().catch(() => undefined);
      if (ownsUserDataDirectory) {
        await rm(userDataDirectory, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /** Return the exact Windows Main generation accepted by native Dialog drivers. */
  windowsMainProcessOwner(): WindowsFileDialogOwner {
    if (!this.windowsMainOwner) {
      throw new Error('Windows Main process identity is unavailable on this platform.');
    }
    return this.windowsMainOwner;
  }

  /** Read and register the exact Core generation currently exposed by public UI state. */
  async currentCoreProcessIdentity(): Promise<WorkflowProcessIdentity> {
    if (process.platform !== 'win32' || !this.workflowHostSafetyGuard) {
      throw new Error('Exact Core process identity requires the Windows host guard.');
    }
    const processId = await this.readCoreProcessId();
    const processIdentity = await LocalElectronApplicationDriver
      .readWindowsProcessIdentity(processId);
    this.workflowHostSafetyGuard.registerProcessIdentity(processIdentity);
    this.corePid = processId;
    return processIdentity;
  }

  /** Terminate one registered Core generation without stopping Electron Main. */
  terminateCoreProcessGeneration(
    processIdentity: WorkflowProcessIdentity,
  ): Promise<void> {
    if (!this.workflowHostSafetyGuard) {
      throw new Error('Core process termination requires the Windows host guard.');
    }
    return this.workflowHostSafetyGuard.terminateProcessGeneration(processIdentity);
  }

  /** List every workflow-owned process generation still alive. */
  listLiveRegisteredProcessIds(): Promise<readonly number[]> {
    if (!this.workflowHostSafetyGuard) {
      throw new Error('Live process inspection requires the Windows host guard.');
    }
    return this.workflowHostSafetyGuard.listLiveRegisteredProcessIds();
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
    await expect(getByAutomationId(this.page, AUTOMATION_IDS.app.root)).toBeVisible();

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
      process.platform === 'win32'
      && this.corePid !== null
      && this.workflowHostSafetyGuard
    ) {
      this.workflowHostSafetyGuard.registerProcessIdentity(
        await LocalElectronApplicationDriver.readWindowsProcessIdentity(
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

  /** Read the primary BrowserWindow state from Electron Main for UI assertions. */
  async windowState(): Promise<DesktopWindowState> {
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
    await this.application.evaluate(({ BrowserWindow }) => {
      const [mainWindow] = BrowserWindow.getAllWindows();
      mainWindow?.restore();
      mainWindow?.show();
      mainWindow?.focus();
    });
    await this.page.bringToFront();
  }

  /** Click the product Close control and wait for Electron's terminal close event. */
  async closeFromWindowButton(): Promise<void> {
    if (this.applicationClosed || this.page.isClosed()) {
      return;
    }
    const closePromise = this.application.waitForEvent('close', {
      timeout: 15_000,
    });
    this.shutdownKind = 'graceful';
    await this.page.keyboard.press('Escape').catch(() => undefined);
    await this.page
      .locator(`[data-automation-id="${AUTOMATION_IDS.shell.window.close}"]`)
      .last()
      .click();
    await closePromise;
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
    if (process.platform === 'win32') {
      if (!this.workflowHostSafetyGuard) {
        throw new Error('Windows abrupt termination requires the workflow host guard.');
      }
      await this.workflowHostSafetyGuard.terminateRegisteredApplications();
    } else if (!this.application.process().kill('SIGKILL')) {
      throw new Error('Electron Main rejected the intentional abrupt termination.');
    }
    await this.verifyProcessesAndListenerReleased();
    this.applicationClosed = true;
    this.abruptDestroyVerified = true;
  }

  /** Capture the final visible Renderer state before trace and process teardown. */
  async captureFinalScreenshot(testInfo: TestInfo): Promise<void> {
    if (this.page.isClosed()) {
      return;
    }
    const screenshotPath = testInfo.outputPath(this.evidenceName('final.png'));
    await this.page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
    });
    await testInfo.attach(this.evidenceName('final-state'), {
      path: screenshotPath,
      contentType: 'image/png',
    });
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

  /** Stop and attach the always-retained BrowserContext trace for this workflow. */
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
    await testInfo.attach(this.evidenceName(
      segment === 1 ? 'playwright-trace' : `playwright-trace-${segment}`,
    ), {
      path: tracePath,
      contentType: 'application/zip',
    });
  }

  /** Prove that one sensitive value is absent from trace and process-log evidence. */
  async assertSensitiveTextAbsentFromEvidence(sensitiveText: string): Promise<void> {
    if (this.tracePaths.length === 0) {
      throw new Error('Trace must be stopped before sensitive evidence is audited.');
    }
    if (this.sensitiveTextFoundInProcessOutput
      || this.mainOutput.includes(sensitiveText)
      || this.rendererOutput.includes(sensitiveText)) {
      throw new Error('Sensitive text was found in process-log evidence.');
    }

    const extractionDirectory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-trace-audit-'));
    try {
      const sensitiveBytes = Buffer.from(sensitiveText, 'utf8');
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
          if (bytes.includes(sensitiveBytes)) {
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
    const mainLogPath = testInfo.outputPath(this.evidenceName('main-process.log'));
    const rendererLogPath = testInfo.outputPath(this.evidenceName('renderer-console.log'));
    const metadataPath = testInfo.outputPath(this.evidenceName('metadata.json'));
    await Promise.all([
      writeFile(mainLogPath, this.mainOutput, 'utf8'),
      writeFile(rendererLogPath, this.rendererOutput, 'utf8'),
      writeFile(
        metadataPath,
        JSON.stringify({
          target: 'local-electron',
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
    if (!this.applicationClosed) {
      await this.application.close().catch(() => undefined);
    }
    if (process.platform === 'win32' && this.workflowHostSafetyGuard) {
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
    const append = (value: string): void => {
      const output = `${this.mainOutput}${value}`;
      this.recordSensitiveTextMatch(output);
      this.mainOutput = output.slice(-128_000);
    };
    this.application.process().stdout?.on('data', (chunk: Buffer | string) => {
      append(chunk.toString());
    });
    this.application.process().stderr?.on('data', (chunk: Buffer | string) => {
      append(chunk.toString());
    });
    this.application.on('console', (message) => {
      append(`[main:${message.type()}] ${message.text()}\n`);
    });
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
    if (process.platform === 'win32' && this.workflowHostSafetyGuard) {
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
      (process.platform !== 'win32' || !this.workflowHostSafetyGuard)
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

  /** Remove undefined process variables because Electron launch requires string values. */
  private static createLaunchEnvironment(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== E2E_DESKTOP_DIRECTORY_ENV && entry[1] !== undefined,
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

  /** Resolve one test process generation through a test-owned PowerShell query. */
  private static async readWindowsProcessIdentity(
    processId: number,
  ): Promise<WindowsFileDialogOwner> {
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
  desktopApp: async ({}, use, testInfo) => {
    const workflowHostSafetyGuard = await createWorkflowHostSafetyGuard();
    if (workflowHostSafetyGuard) {
      await workflowHostSafetyGuard.captureBaseline();
      workflowHostSafetyGuardByTestInfo.set(testInfo, workflowHostSafetyGuard);
    }
    let driver: LocalElectronApplicationDriver | null = null;
    let workflowError: unknown;
    let cleanupError: unknown;
    let hostSafetyError: unknown;
    try {
      driver = await LocalElectronApplicationDriver.launch(testInfo);
      await driver.waitUntilReady();
      await use(driver);
      await driver.captureFinalScreenshot(testInfo);
    } catch (error) {
      workflowError = error;
    } finally {
      if (driver) {
        try {
          await driver.stopTrace(testInfo);
          await driver.closeGracefully();
        } catch (error) {
          cleanupError = error;
        }
        await driver.writeEvidence(testInfo).catch(() => undefined);
        await driver.forceCleanup();
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
        const preserveUserData = cleanupError !== undefined
          || hostSafetyError !== undefined
          || (workflowError !== undefined && driver.shouldPreserveUserDataOnFailure());
        if (!preserveUserData) {
          await driver.removeUserData();
        } else {
          testInfo.annotations.push({
            type: 'preserved-user-data',
            description: driver.userDataDirectory,
          });
        }
      }
    }
    const errors = [workflowError, cleanupError, hostSafetyError]
      .filter((error) => error !== undefined);
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Workflow and host cleanup both failed.');
    }
  },
  loopbackLab: async ({}, use) => {
    const loopbackLab = await LoopbackLab.start();
    try {
      await use(loopbackLab);
    } finally {
      await loopbackLab.close();
    }
  },
  webSocketLab: async ({}, use) => {
    const webSocketLab = await WebSocketLab.start();
    try {
      await use(webSocketLab);
    } finally {
      await webSocketLab.close();
    }
  },
  openAiCompatibleLab: async ({}, use) => {
    const openAiCompatibleLab = await OpenAiCompatibleLab.start();
    try {
      await use(openAiCompatibleLab);
    } finally {
      await openAiCompatibleLab.close();
    }
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
    : path.resolve(__dirname, '../../..');
}

/** Create the Windows-only outer guard before any real Electron process starts. */
async function createWorkflowHostSafetyGuard(): Promise<WorkflowHostSafetyGuard | null> {
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
