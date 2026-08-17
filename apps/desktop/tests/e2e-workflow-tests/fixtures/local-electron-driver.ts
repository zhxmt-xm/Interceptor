import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  expect,
  test as base,
  type BrowserContext,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { AUTOMATION_IDS } from '../../../src/shared/automation-ids';
import { getByAutomationId } from './automation';
import { LoopbackLab } from './loopback-lab';
import { WebSocketLab } from './websocket-lab';

const DEFAULT_CAPTURE_PORT = 8888;

interface LocalWorkflowFixtures {
  /** Test-owned unpackaged Electron application and its real Renderer page. */
  desktopApp: LocalElectronApplicationDriver;
  /** Random-port HTTP origin and explicit-proxy client owned by this test. */
  loopbackLab: LoopbackLab;
  /** Random-port WebSocket origin and explicit-proxy clients owned by this test. */
  webSocketLab: WebSocketLab;
}

interface DesktopWindowState {
  minimized: boolean;
  maximized: boolean;
  visible: boolean;
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

  /** Main-process PID captured before Electron can close. */
  private readonly mainPid: number | null;

  /** Main-process output retained as bounded diagnostic evidence. */
  private mainOutput = '';

  /** Renderer console and page errors retained as bounded diagnostic evidence. */
  private rendererOutput = '';

  /** Core PID observed while the application is running. */
  private corePid: number | null = null;

  /** Capture listener port observed while the application is running. */
  private listenerPort: number | null = null;

  /** Whether the BrowserContext trace is still recording. */
  private traceActive = true;

  /** Whether Electron has emitted its terminal close event. */
  private applicationClosed = false;

  /** Whether Main/Core/listener cleanup assertions all completed successfully. */
  private gracefulDestroyVerified = false;

  /** Create one driver after Electron, its first window and evidence capture are ready. */
  private constructor(
    application: ElectronApplication,
    page: Page,
    userDataDirectory: string,
  ) {
    this.application = application;
    this.context = application.context();
    this.page = page;
    this.userDataDirectory = userDataDirectory;
    this.mainPid = application.process().pid ?? null;
    application.once('close', () => {
      this.applicationClosed = true;
    });
    this.captureProcessOutput();
    this.captureRendererOutput();
  }

  /** Launch a fresh unpackaged production bundle and wait for its primary window. */
  static async launch(testInfo: TestInfo): Promise<LocalElectronApplicationDriver> {
    const desktopDirectory = path.resolve(__dirname, '../../..');
    const userDataDirectory = await LocalElectronApplicationDriver.createUserDataDirectory();
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
      const context = application.context();
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
        title: testInfo.title,
      });
      const page = await application.firstWindow({ timeout: 20_000 });
      return new LocalElectronApplicationDriver(
        application,
        page,
        userDataDirectory,
      );
    } catch (error) {
      await application?.close().catch(() => undefined);
      await rm(userDataDirectory, { recursive: true, force: true });
      throw error;
    }
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

    this.listenerPort = DEFAULT_CAPTURE_PORT;
    await expect.poll(
      () => LocalElectronApplicationDriver.canConnectPort(DEFAULT_CAPTURE_PORT),
      { message: 'Capture listener did not start on 8888', timeout: 20_000 },
    ).toBe(true);

    await this.dismissProxyReadiness();
  }

  /** Return the Capture listener port after waitUntilReady has verified it. */
  capturePort(): number {
    if (this.listenerPort === null) {
      throw new Error('Capture listener port is unavailable before application readiness.');
    }
    return this.listenerPort;
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
    await this.page
      .locator(`[data-automation-id="${AUTOMATION_IDS.shell.window.close}"]`)
      .click();
    await closePromise;
  }

  /** Capture the final visible Renderer state before trace and process teardown. */
  async captureFinalScreenshot(testInfo: TestInfo): Promise<void> {
    if (this.page.isClosed()) {
      return;
    }
    const screenshotPath = testInfo.outputPath('final.png');
    await this.page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
    });
    await testInfo.attach('final-state', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }

  /** Stop and attach the always-retained BrowserContext trace for this workflow. */
  async stopTrace(testInfo: TestInfo): Promise<void> {
    if (!this.traceActive) {
      return;
    }
    this.traceActive = false;
    const tracePath = testInfo.outputPath('trace.zip');
    await this.context.tracing.stop({ path: tracePath });
    await testInfo.attach('playwright-trace', {
      path: tracePath,
      contentType: 'application/zip',
    });
  }

  /** Request normal application shutdown and prove Main, Core and listener cleanup. */
  async closeGracefully(): Promise<void> {
    if (!this.applicationClosed && !this.page.isClosed()) {
      await this.closeFromWindowButton();
    }

    if (this.mainPid !== null) {
      const mainPid = this.mainPid;
      await expect.poll(
        () => LocalElectronApplicationDriver.isProcessAlive(mainPid),
        { message: `Electron Main PID ${mainPid} did not exit`, timeout: 10_000 },
      ).toBe(false);
    }
    if (this.corePid !== null) {
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
    this.gracefulDestroyVerified = true;
  }

  /** Persist process logs and metadata after the workflow and destroy assertions finish. */
  async writeEvidence(testInfo: TestInfo): Promise<void> {
    const mainLogPath = testInfo.outputPath('main-process.log');
    const rendererLogPath = testInfo.outputPath('renderer-console.log');
    const metadataPath = testInfo.outputPath('metadata.json');
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
          playwrightVersion: require('@playwright/test/package.json').version,
          electronVersion: require('electron/package.json').version,
        }, null, 2),
        'utf8',
      ),
    ]);
    await Promise.all([
      testInfo.attach('main-process-log', {
        path: mainLogPath,
        contentType: 'text/plain',
      }),
      testInfo.attach('renderer-console-log', {
        path: rendererLogPath,
        contentType: 'text/plain',
      }),
      testInfo.attach('workflow-metadata', {
        path: metadataPath,
        contentType: 'application/json',
      }),
    ]);
  }

  /** Force only this test's known Electron/Core processes to stop after cleanup failure. */
  async forceCleanup(): Promise<void> {
    await this.application.close().catch(() => undefined);
    if (this.corePid !== null && LocalElectronApplicationDriver.isProcessAlive(this.corePid)) {
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
      this.mainOutput = `${this.mainOutput}${value}`.slice(-128_000);
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
      this.rendererOutput = `${this.rendererOutput}${value}`.slice(-128_000);
    };
    this.page.on('console', (message) => {
      append(`[renderer:${message.type()}] ${message.text()}\n`);
    });
    this.page.on('pageerror', (error) => {
      append(`[renderer:pageerror] ${error.stack ?? error.message}\n`);
    });
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
        (entry): entry is [string, string] => entry[1] !== undefined,
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
}

export const test = base.extend<LocalWorkflowFixtures>({
  desktopApp: async ({}, use, testInfo) => {
    const driver = await LocalElectronApplicationDriver.launch(testInfo);
    let workflowError: unknown;
    let cleanupError: unknown;
    try {
      await driver.waitUntilReady();
      await use(driver);
      await driver.captureFinalScreenshot(testInfo);
    } catch (error) {
      workflowError = error;
    } finally {
      try {
        await driver.stopTrace(testInfo);
        await driver.closeGracefully();
      } catch (error) {
        cleanupError = error;
      }
      await driver.writeEvidence(testInfo).catch(() => undefined);
      await driver.forceCleanup();
      await driver.removeUserData();
      if (cleanupError) {
        testInfo.annotations.push({
          type: 'cleanup-failure-context',
          description: String(cleanupError),
        });
      }
    }
    if (workflowError) {
      throw workflowError;
    }
    if (cleanupError) {
      throw cleanupError;
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
});

export { expect };
