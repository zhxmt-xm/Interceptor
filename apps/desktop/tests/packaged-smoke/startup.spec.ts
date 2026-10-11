import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import {
  createServer as createHttpServer,
  request as requestHttp,
  type Server as HttpServer,
} from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { AUTOMATION_IDS } from '../../src/shared/automation-ids';
import { dismissWindowsFileDialogs } from '../e2e-workflow-tests/fixtures/ui/windows-file-dialog';
import { WorkflowHostSafetyGuard } from '../e2e-workflow-tests/fixtures/safety/workflow-host-safety-guard';
import { WindowsWorkflowHostSafetyOperations } from '../e2e-workflow-tests/fixtures/safety/windows-workflow-host-safety-operations';
import { MacosWorkflowHostSafetyOperations } from '../e2e-workflow-tests/fixtures/safety/macos-workflow-host-safety-operations';
import { requireSharedCertificateReady } from '../e2e-workflow-tests/fixtures/ui/https-capture';
import { getByAutomationId } from '../e2e-workflow-tests/fixtures/ui/automation';
import { startRecording } from '../e2e-workflow-tests/fixtures/ui/capture-workflow';

/** Renderer 启动时自动接管的监听端口；产品不支持迁移，smoke 必须复用它。 */
const DEFAULT_CAPTURE_PORT = 8888;
const execFileAsync = promisify(execFile);

class ReleaseScreenshotMatrix {
  /** All implemented workspaces addressed through the production sidebar. */
  private static readonly views = [
    { label: 'Capture', slug: 'capture' },
    { label: 'Rules & Map', slug: 'rules' },
    { label: 'Composer', slug: 'composer' },
    { label: 'Diagnostics', slug: 'diagnostics' },
    { label: 'Settings', slug: 'settings' },
  ] as const;
  /** Every language selector state currently exposed by the product. */
  private static readonly languages = [
    { name: 'English', id: 'en', languageLabel: 'Language', captureLabel: 'Capture' },
    { name: '简体中文', id: 'zh-CN', languageLabel: '语言', captureLabel: '抓包' },
    { name: '繁體中文', id: 'zh-TW', languageLabel: '語言', captureLabel: '擷取' },
    { name: '日本語', id: 'ja', languageLabel: '言語', captureLabel: 'キャプチャ' },
    { name: '한국어', id: 'ko', languageLabel: '언어', captureLabel: '캡처' },
    { name: 'Deutsch', id: 'de', languageLabel: 'Sprache', captureLabel: 'Aufzeichnung' },
    { name: 'Français', id: 'fr', languageLabel: 'Langue', captureLabel: 'Capture réseau' },
    { name: 'Español', id: 'es', languageLabel: 'Idioma', captureLabel: 'Captura' },
    { name: 'Italiano', id: 'it', languageLabel: 'Lingua', captureLabel: 'Cattura' },
    { name: 'Português (Brasil)', id: 'pt-BR', languageLabel: 'Idioma', captureLabel: 'Captura' },
    { name: 'Русский', id: 'ru', languageLabel: 'Язык', captureLabel: 'Захват' },
    { name: 'Nederlands', id: 'nl', languageLabel: 'Taal', captureLabel: 'Verkeer' },
    { name: 'Polski', id: 'pl', languageLabel: 'Język', captureLabel: 'Przechwytywanie' },
    { name: 'Türkçe', id: 'tr', languageLabel: 'Dil', captureLabel: 'Yakalama' },
    { name: 'Українська', id: 'uk', languageLabel: 'Мова', captureLabel: 'Перехоплення' },
  ] as const;

  /** Capture all release screenshot dimensions through normal UI interactions. */
  static async capture(
    page: Page,
    testInfo: TestInfo,
    windowOwner: { readonly processId: number; readonly processStartedAt: string },
  ): Promise<void> {
    await this.resizeScreenshotWindow(page, windowOwner, { width: 1280, height: 800 });
    for (const theme of ['light', 'dark'] as const) {
      await this.selectTheme(page, theme);
      for (const view of this.views) {
        await this.selectView(page, view.label);
        await this.screenshot(page, testInfo, `${view.slug}-${theme}-1280x800.png`);
      }
    }

    await this.resizeScreenshotWindow(page, windowOwner, { width: 900, height: 600 });
    for (const view of this.views) {
      await this.selectView(page, view.label);
      await this.screenshot(page, testInfo, `${view.slug}-dark-900x600.png`);
    }

    await this.resizeScreenshotWindow(page, windowOwner, { width: 1280, height: 800 });
    let currentLanguageLabel = 'Language';
    for (const language of this.languages) {
      await this.selectLanguage(page, currentLanguageLabel, language);
      currentLanguageLabel = language.languageLabel;
    }
    await this.screenshot(page, testInfo, 'capture-lang-uk.png');
    await this.selectLanguage(page, currentLanguageLabel, this.languages[0]);
  }

  /** Select native macOS window sizing without changing the existing Windows matrix. */
  private static async resizeScreenshotWindow(
    page: Page,
    windowOwner: { readonly processId: number; readonly processStartedAt: string },
    size: { width: number; height: number },
  ): Promise<void> {
    switch (process.platform) {
      case 'darwin':
        return this.resizeMacosScreenshotWindow(page, windowOwner, size);
      default:
        return page.setViewportSize(size);
    }
  }

  /** Resize only this smoke's exact Main window instead of emulating a smaller page inside it. */
  private static async resizeMacosScreenshotWindow(
    page: Page,
    windowOwner: { readonly processId: number; readonly processStartedAt: string },
    size: { width: number; height: number },
  ): Promise<void> {
    await expect.poll(async () => {
      const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(windowOwner.processId);
      if (current.processStartedAt !== windowOwner.processStartedAt) {
        throw new Error('Screenshot Main process generation changed.');
      }
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${windowOwner.processId}
    return count of windows
  end tell
end tell
`], { encoding: 'utf8' });
      return Number(stdout.trim());
    }, { message: 'Native macOS screenshot window was not exposed by System Events' }).toBeGreaterThan(0);
    const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(windowOwner.processId);
    if (current.processStartedAt !== windowOwner.processStartedAt) {
      throw new Error('Screenshot Main process generation changed.');
    }
    const cdpSession = await page.context().newCDPSession(page);
    try {
      await cdpSession.send('Emulation.clearDeviceMetricsOverride');
      await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${windowOwner.processId}
    set size of window 1 to {${size.width}, ${size.height}}
  end tell
end tell
`], { encoding: 'utf8' });
      await expect.poll(() => page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      })), { message: 'Native macOS screenshot window did not reach the requested content size' })
        .toEqual(size);
    } finally {
      await cdpSession.detach();
    }
  }

  /** Select one sidebar workspace and wait for its main surface to remain visible. */
  private static async selectView(page: Page, label: string): Promise<void> {
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('button', { name: label, exact: true })
      .click();
    await expect(page.getByRole('main')).toBeVisible();
  }

  /** Select a time-of-day theme and verify persisted application state. */
  private static async selectTheme(
    page: Page,
    theme: 'light' | 'dark',
  ): Promise<void> {
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('button', {
      name: theme === 'light' ? 'Light' : 'Dark',
      exact: true,
    }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.evaluate(() =>
      window.localStorage.getItem('interceptor.theme'))).toBe(theme);
  }

  /** Select one language state and verify its persisted profile value. */
  private static async selectLanguage(
    page: Page,
    currentLanguageLabel: string,
    language: (typeof ReleaseScreenshotMatrix.languages)[number],
  ): Promise<void> {
    await page.getByRole('button', { name: currentLanguageLabel, exact: true }).click();
    await page.getByRole('button', { name: language.name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', language.id);
    await expect.poll(() => page.evaluate(() =>
      window.localStorage.getItem('interceptor.language'))).toBe(language.id);
    await expect(
      page.getByRole('navigation').getByRole('button', {
        name: language.captureLabel,
        exact: true,
      }),
    ).toBeVisible();
    await this.expectNoPageOverflow(page);
  }

  /** Write one stable screenshot without tooltip or animation noise. */
  private static async screenshot(
    page: Page,
    testInfo: TestInfo,
    name: string,
  ): Promise<void> {
    await this.expectNoPageOverflow(page);
    await testInfo.attach(`${name}-dimensions`, {
      body: JSON.stringify(await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        deviceScaleFactor: window.devicePixelRatio,
      }))),
      contentType: 'application/json',
    });
    await page.mouse.move(400, 400);
    await expect(page.locator('.ant-tooltip')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath(name),
      animations: 'disabled',
    });
  }

  /** Assert that localized page content remains inside the BrowserWindow viewport. */
  private static async expectNoPageOverflow(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.width).toBeLessThanOrEqual(0);
    expect(overflow.height).toBeLessThanOrEqual(0);
  }
}

class PackagedWorkflowSmoke {
  /** Resolve the package version used by local or tagged release builds. */
  static expectedVersion(): string {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };
    return process.env.INTERCEPTOR_BUILD_VERSION ?? packageJson.version;
  }

  /** Execute real Core workflows against an isolated loopback origin. */
  static async run(page: Page): Promise<void> {
    await expect.poll(() => page.evaluate(() => window.interceptor.getCaptureStatus()), {
      message: 'Default Capture listener did not start',
      timeout: 15_000,
    }).toMatchObject({ listening: true, host: '127.0.0.1' });
    // 产品不支持迁移监听端口，smoke 直接复用已在运行的默认端口。
    const listener = await page.evaluate(() => window.interceptor.getCaptureStatus());
    const proxyPort = listener.port;
    if (proxyPort === null) {
      throw new Error('Capture listener port is unavailable.');
    }
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const recordingToggle = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
    await recordingToggle.click();
    await expect(recordingToggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => window.interceptor.getCaptureStatus()))
      .toMatchObject({ listening: true, recording: false });

    const origin = await this.startOrigin();
    const errors: unknown[] = [];
    try {
      await startRecording({ page });
      const capture = await page.evaluate(() => window.interceptor.getCaptureStatus());
      expect(capture).toMatchObject({
        listening: true,
        host: '127.0.0.1',
        port: proxyPort,
      });

      const response = await this.requestThroughProxy(proxyPort, origin.port);
      expect(response).toMatchObject({
        statusCode: 200,
        body: '{"releaseSmoke":true}',
      });

      let exchangeId: string | null = null;
      await expect.poll(async () => {
        exchangeId = await page.evaluate(async () => {
          const sessions = await window.interceptor.querySessions({
            limit: 20,
            sort: 'started_desc',
            filter: { host: '127.0.0.1' },
          });
          return sessions.items.find((item) =>
            item.path === '/release-smoke')?.id ?? null;
        });
        return exchangeId;
      }, {
        message: 'Proxied release-smoke exchange was not persisted',
        timeout: 10_000,
      }).not.toBeNull();
      if (!exchangeId) {
        throw new Error('Captured exchange id is unavailable.');
      }
      const detail = await page.evaluate((id) =>
        window.interceptor.getExchangeDetail(id), exchangeId);
      expect(detail).toMatchObject({
        url: `http://127.0.0.1:${origin.port}/release-smoke`,
        statusText: 'OK',
        summary: { statusCode: 200 },
      });

      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`http://127.0.0.1:${origin.port}/composer-smoke`);
      await getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('releaseSmoke');
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.copy).click();
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({ releaseSmoke: true });

      const rules = await page.evaluate(() => window.interceptor.getRules());
      expect(Array.isArray(rules.nodes)).toBe(true);

      const breakpoints = await page.evaluate(() =>
        window.interceptor.listBreakpoints());
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager).click();
      const breakpointToggle = getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle);
      await expect(breakpointToggle).toHaveAttribute('aria-checked', String(breakpoints.enabled));
      await breakpointToggle.click();
      await expect(breakpointToggle).toHaveAttribute('aria-checked', String(!breakpoints.enabled));
      await breakpointToggle.click();
      await expect(breakpointToggle).toHaveAttribute('aria-checked', String(breakpoints.enabled));
      await page.keyboard.press('Escape');
      await expect(breakpointToggle).toBeHidden();

      const diagnostics = await page.evaluate(() =>
        window.interceptor.queryDiagnostics({ limit: 20 }));
      expect(diagnostics.records.length).toBeGreaterThan(0);
    } catch (error) {
      errors.push(error);
    } finally {
      try {
        const beforeStop = await page.evaluate(() =>
          window.interceptor.getCaptureUsage());
        // 暂停记录：监听器与系统代理保持运行、流量继续转发，已录数据保留到手动 Clear。
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
        if (await recordingToggle.getAttribute('aria-pressed') === 'true') await recordingToggle.click();
        await expect(recordingToggle).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(() => page.evaluate(() => window.interceptor.getCaptureStatus()))
          .toMatchObject({ listening: true, recording: false });
        const afterStop = await page.evaluate(() => window.interceptor.getCaptureUsage());
        expect(afterStop.sessionCount).toBe(beforeStop.sessionCount);
        expect(afterStop.exchangeCount).toBeGreaterThanOrEqual(beforeStop.exchangeCount);
        expect(afterStop.bodyCount).toBeGreaterThanOrEqual(beforeStop.bodyCount);
        expect(afterStop.blobBytes).toBeGreaterThanOrEqual(beforeStop.blobBytes);
        await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
        await expect.poll(() => page.evaluate(() => window.interceptor.getCaptureUsage()), {
          message: 'Manual Clear did not delete temporary recording data',
          timeout: 10_000,
        }).toMatchObject({
          sessionCount: 1,
          exchangeCount: 0,
          bodyCount: 0,
          blobBytes: 0,
        });
      } catch (error) {
        errors.push(error);
      }
      try {
        await this.closeOrigin(origin.server);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Packaged workflows and cleanup failed.');
  }

  /** Start one deterministic JSON origin on a random loopback port. */
  private static async startOrigin(): Promise<{
    server: HttpServer;
    port: number;
  }> {
    const server = createHttpServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        connection: 'close',
      });
      response.end('{"releaseSmoke":true}');
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Unable to bind release-smoke origin.'));
          return;
        }
        resolve(address.port);
      });
    });
    return { server, port };
  }

  /** Send one absolute-form HTTP request through the packaged explicit proxy. */
  private static async requestThroughProxy(
    proxyPort: number,
    originPort: number,
  ): Promise<{ statusCode: number | undefined; body: string }> {
    return new Promise((resolve, reject) => {
      const request = requestHttp({
        host: '127.0.0.1',
        port: proxyPort,
        method: 'GET',
        path: `http://127.0.0.1:${originPort}/release-smoke`,
        headers: {
          host: `127.0.0.1:${originPort}`,
          connection: 'close',
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('error', reject);
        response.once('end', () => resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.once('error', reject);
      request.end();
    });
  }

  /** Close the loopback origin after all in-flight requests complete. */
  private static async closeOrigin(server: HttpServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
test('packaged app starts with an isolated renderer and running core', async ({
  }, testInfo) => {
  test.setTimeout(180_000);
  if (process.platform === 'darwin') await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
  await requireSharedCertificateReady();
  const executablePath = resolvePackagedExecutable();
  expect(fs.existsSync(executablePath), `Missing package: ${executablePath}`).toBe(
    true,
  );
  const workflowHostSafetyGuard = await createPackagedWorkflowHostSafetyGuard(
    executablePath,
  );
  await workflowHostSafetyGuard?.captureBaseline();

  const debuggingPort = await reservePort();
  const userDataPath = fs.mkdtempSync(
    path.join(os.tmpdir(), 'interceptor-packaged-smoke-'),
  );
  const outputPath = process.platform === 'darwin' ? path.join(userDataPath, 'main.log') : null;
  const outputFile = outputPath === null ? null : fs.openSync(outputPath, 'wx', 0o600);
  let appProcess: ChildProcess;
  try {
    appProcess = spawn(
      executablePath,
      [
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${userDataPath}`,
      ],
      {
        stdio: outputFile === null ? ['ignore', 'pipe', 'pipe'] : ['ignore', outputFile, outputFile],
        windowsHide: true,
      },
    );
  } finally {
    if (outputFile !== null) fs.closeSync(outputFile);
  }
  const processOutput = captureProcessOutput(appProcess, outputPath);
  let browser: Browser | null = null;
  let page: Page | null = null;
  let corePid: number | null = null;
  let workflowError: unknown = null;

  try {
    if (workflowHostSafetyGuard) {
      if (!appProcess.pid) {
        throw new Error('Packaged Electron process did not expose a PID.');
      }
      workflowHostSafetyGuard.registerProcessIdentity(
        await readPackagedProcessIdentity(appProcess.pid),
      );
      workflowHostSafetyGuard.registerApplication(appProcess.pid, userDataPath);
      await workflowHostSafetyGuard.captureProcessTrees();
    }
    await expect
      .poll(async () => {
        if (appProcess.exitCode !== null) {
          throw new Error(
            `Packaged app exited before CDP was ready.\n${processOutput.read()}`,
          );
        }

        return isCdpReady(debuggingPort);
      }, {
        message: 'CDP endpoint did not start',
        timeout: 15_000,
      })
      .toBe(true);

    browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${debuggingPort}`,
    );
    const context = browser.contexts()[0];
    expect(context, 'Packaged app did not create a browser context').toBeDefined();
    await expect
      .poll(() => {
        if (appProcess.exitCode !== null || appProcess.signalCode !== null) {
          throw new Error(`Packaged app exited during native preparation.\n${processOutput.read()}`);
        }
        return context?.pages().length ?? 0;
      }, { timeout: process.platform === 'darwin' ? 120_000 : 10_000 })
      .toBeGreaterThan(0);
    page = context?.pages()[0] ?? null;
    expect(page, 'Packaged app did not create a renderer page').toBeDefined();
    if (!page) {
      throw new Error('Packaged app did not create a renderer page');
    }
    const rendererPage = page;
    rendererPage.setDefaultTimeout(15_000);

    await page.waitForLoadState('domcontentloaded');

    // Keep the packaged UI deterministic; HTTPS trust remains user-initiated and untouched.
    await page.evaluate(() => {
      window.localStorage.setItem('interceptor.language', 'en');
      window.localStorage.removeItem('interceptor.lang');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator(
      `[data-automation-id="${AUTOMATION_IDS.app.root}"]`,
    )).toBeVisible({ timeout: 120_000 });

    // 侧栏默认折叠，品牌名不渲染；改用头部视图名确认 shell 与英文语言包都已生效。
    await expect(page.getByRole('banner')).toContainText('Capture');
    await expect(page.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await settleProxyReadiness(page);
    await workflowHostSafetyGuard?.captureProcessTrees();

    const nativeChromeHeight = await page.evaluate(() =>
      window.outerHeight - window.innerHeight);
    expect(nativeChromeHeight).toBeLessThan(24);

    const securitySnapshot = await page.evaluate(() => ({
      url: window.location.href,
      apiKeys: Object.keys(window.interceptor).sort(),
      hasNodeProcess: typeof (window as unknown as { process?: unknown }).process,
      hasNodeRequire: typeof (window as unknown as { require?: unknown }).require,
      csp:
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? null,
    }));

    expect(securitySnapshot).toEqual({
      url: 'interceptor://app/index.html',
      apiKeys: [
        'allowAgentToolCall',
        'allowMcpToolCall',
        'applyUpstreamSettings',
        'automaticallyExecuteAgentTools',
        'automaticallyExecuteMcpClientTools',
        'cancelAgentTurn',
        'cancelTransferJob',
        'changeMcpEndpoint',
        'checkForUpdates',
        'claimUiPreferenceChange',
        'clearCapture',
        'closeApplication',
        'completeCollectionImport',
        'completeRulesImport',
        'completeUiPreferenceChange',
        'continueBreakpointQueue',
        'continueBreakpointRule',
        'copyMcpClientConfiguration',
        'createAgentSession',
        'createMcpClient',
        'deleteAgentSession',
        'deleteCertificate',
        'denyAgentToolCall',
        'denyMcpToolCall',
        'disableAgentTool',
        'disableAllAppContainers',
        'disableMcpServer',
        'disableMcpTool',
        'disableWebSocketBreakpoints',
        'downloadUpdate',
        'dropBreakpointQueue',
        'echoCore',
        'enableAgentTool',
        'enableAllAppContainers',
        'enableMcpServer',
        'enableMcpTool',
        'enableSystemProxy',
        'enableWebSocketBreakpoints',
        'exportCollection',
        'exportRules',
        'generateCertificate',
        'getAgentModels',
        'getAgentSession',
        'getCaptureStatus',
        'getCaptureUsage',
        'getCertificateStatus',
        'getCollection',
        'getCoreProcessStatus',
        'getCoreTrace',
        'getExchangeDetail',
        'getInsecureHosts',
        'getMcpStatus',
        'getRecentDiagnostics',
        'getRuleHits',
        'getRules',
        'getStartupStage',
        'getSystemProxyStatus',
        'getTlsPassthroughSettings',
        'getToolCapabilitySettings',
        'getTransferJob',
        'getUpdateStatus',
        'getUpstreamSettings',
        'importCollection',
        'importRules',
        'installCertificate',
        'listAgentSessions',
        'listAppContainers',
        'listBreakpoints',
        'minimizeWindow',
        'onAgentSessionEvent',
        'onAppContainersChanged',
        'onBreakpointsChange',
        'onCaptureEvents',
        'onCaptureImported',
        'onCaptureReset',
        'onCaptureStatusChange',
        'onClientAppIcons',
        'onCollectionChanged',
        'onCollectionImportCanceled',
        'onCollectionImportRequested',
        'onCoreProcessStatusChange',
        'onMcpApprovalRequest',
        'onMcpApprovalSettled',
        'onMcpStatusChange',
        'onPlatformOperationConflict',
        'onRulesChanged',
        'onRulesImportCanceled',
        'onRulesImportRequested',
        'onStartupStageChange',
        'onSystemProxyStatusChange',
        'onTlsCompatibilityChange',
        'onTlsSettingsChanged',
        'onUiPreferenceChangeRequested',
        'onUiPreferenceChanged',
        'onUpdateStatusChange',
        'onUpstreamSettingsChanged',
        'openCertificateManager',
        'openDownloadedUpdate',
        'pickBreakpointBodyFile',
        'probeTls',
        'queryDiagnostics',
        'queryGrpcMessages',
        'querySessions',
        'queryWebSocketFrames',
        'readBody',
        'readGrpcBody',
        'readImportFile',
        'regenerateMcpClientCredential',
        'removeAgentProvider',
        'renameAgentSession',
        'replaceCollection',
        'replaceRules',
        'replaceTlsPassthroughSettings',
        'reportRendererDiagnostic',
        'requireAgentToolApproval',
        'requireMcpClientApproval',
        'resolveBreakpoint',
        'restoreSystemProxy',
        'retryAgentTurn',
        'revealCertificate',
        'revokeMcpClient',
        'saveVerifiedAgentProvider',
        'selectAgentSession',
        'sendAgentMessage',
        'sendComposerRequest',
        'setAgentSessionModel',
        'setAppContainerLoopbackExemption',
        'setBreakpointsEnabled',
        'setDefaultAgentModel',
        'setExportPrivacyDefaults',
        'setHttpsDecryption',
        'setInsecureHosts',
        'setUiLanguage',
        'setUiTheme',
        'startArchiveExport',
        'startArchiveImport',
        'startBodyExport',
        'startCapture',
        'startDiagnosticsExport',
        'startHarExport',
        'startHarImport',
        'stopCapture',
        'testAgentProviderConnection',
        'toggleMaximizeWindow',
        'uninstallCertificate',
        'viewCertificate',
      ],
      hasNodeProcess: 'undefined',
      hasNodeRequire: 'undefined',
      csp: expect.stringContaining("connect-src 'none'"),
    });
    expect(securitySnapshot.csp).toContain("frame-src 'none'");
    expect(securitySnapshot.csp).not.toContain('frame-ancestors');

    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.updates).click();
    await expect(page.locator('[data-automation-id^="settings.updates.github-"]')).toHaveCount(0);
    const updateStatus = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
    await expect(updateStatus).toHaveAttribute('data-supported', 'true');
    await expect(updateStatus).toHaveAttribute('data-state', /^(available|up-to-date|failed)$/, { timeout: 90_000 });
    if (await updateStatus.getAttribute('data-state') !== 'available') {
      const lastCheckedAt = await updateStatus.getAttribute('data-last-checked-at');
      await getByAutomationId(page, AUTOMATION_IDS.settings.updates.check).click();
      await expect.poll(() => updateStatus.getAttribute('data-last-checked-at')).not.toBe(lastCheckedAt);
      await expect(updateStatus).toHaveAttribute('data-state', /^(available|up-to-date|failed)$/, { timeout: 90_000 });
    }
    const updateSnapshot = await page.evaluate(() =>
      window.interceptor.getUpdateStatus());
    expect(updateSnapshot).toMatchObject({
      supported: true,
      currentVersion: PackagedWorkflowSmoke.expectedVersion(),
      progress: null,
      downloadedBytes: null,
    });
    expect([
      'available',
      'up-to-date',
      'failed',
    ]).toContain(updateSnapshot.state);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

    const systemProxy = await page.evaluate(() =>
      window.interceptor.getSystemProxyStatus(),
    );
    expect(systemProxy).toMatchObject({
      supported: true,
      owned: true,
      ownershipLost: false,
    });

    await expect
      .poll(
        async () => {
          const status = await rendererPage.evaluate(() =>
            window.interceptor.getCoreProcessStatus(),
          );
          corePid = status.pid;
          return status.state;
        },
        { timeout: 10_000 },
      )
      .toBe('running');

    expect(corePid).not.toBeNull();
    if (corePid !== null && workflowHostSafetyGuard) {
      workflowHostSafetyGuard.registerProcessIdentity(
        await readPackagedProcessIdentity(corePid),
      );
      await registerPackagedCaptureListener(rendererPage, workflowHostSafetyGuard);
    }
    await expect(
      page.getByTitle(`Proxy Core · Running · PID ${corePid}`),
    ).toBeVisible();

    const echoResult = await page.evaluate(() =>
      window.interceptor.echoCore('m1-message-port'),
    );
    expect(echoResult).toMatchObject({
      value: 'm1-message-port',
      handledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      traceId: expect.stringMatching(/^trace-/),
    });

    await expect
      .poll(
        async () => {
          const trace = await rendererPage.evaluate((traceId) =>
            window.interceptor.getCoreTrace(traceId), echoResult.traceId);
          return trace.records.map(({ phase }) => phase);
        },
        { message: 'Echo command trace did not complete', timeout: 5_000 },
      )
      .toEqual(expect.arrayContaining([
        'action.completed',
        'command.completed',
      ]));

    const previousCorePid = corePid;
    if (previousCorePid === null) {
      throw new Error('Core PID was unavailable before restart test');
    }
    const previousCoreIdentity = await readPackagedProcessIdentity(
      previousCorePid,
    );
    workflowHostSafetyGuard?.registerProcessIdentity(previousCoreIdentity);
    await terminatePackagedProcess(previousCoreIdentity);

    await expect
      .poll(
        async () => {
          const status = await rendererPage.evaluate(() =>
            window.interceptor.getCoreProcessStatus(),
          );
          if (
            status.state === 'running' &&
            status.pid !== null &&
            status.pid !== previousCorePid
          ) {
            corePid = status.pid;
            return true;
          }
          return false;
        },
        // macOS publishes running only after native proxy recovery, whose request budget is 30 seconds.
        { message: 'Core did not restart with a new PID', timeout: process.platform === 'darwin' ? 35_000 : 15_000 },
      )
      .toBe(true);

    if (corePid !== null && workflowHostSafetyGuard) {
      workflowHostSafetyGuard.registerProcessIdentity(
        await readPackagedProcessIdentity(corePid),
      );
      await workflowHostSafetyGuard.captureProcessTrees();
      await registerPackagedCaptureListener(rendererPage, workflowHostSafetyGuard);
    }

    await expect
      .poll(() => isProcessAlive(previousCorePid), { timeout: 5_000 })
      .toBe(false);
    const restartedEcho = await page.evaluate(() =>
      window.interceptor.echoCore('m1-restarted-port'),
    );
    expect(restartedEcho.value).toBe('m1-restarted-port');
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true', { timeout: 35_000 });

    // 存储栈端到端：Main IPC → CoreRuntime → 真实 Core → Core 内临时 Capture/Body Store。
    const storageStatus = await page.evaluate(
      () => window.interceptor.getCaptureUsage(),
    );
    expect(storageStatus).not.toHaveProperty('quotaBytes');
    expect(storageStatus.databaseBytes).toBe(0);

    await PackagedWorkflowSmoke.run(page);

    // Let the async post-restart bootstrap raise and settle its readiness modal before
    // the screenshot matrix, so it cannot pop up mid-capture and block a click.
    await drainReadinessBeforeCapture(page);

    if (!appProcess.pid) throw new Error('Screenshot Main process identity is unavailable.');
    await ReleaseScreenshotMatrix.capture(page, testInfo, await readPackagedProcessIdentity(appProcess.pid));

    await restoreProxyBeforeShutdown(page);
    const restoredProxy = await page.evaluate(() => window.interceptor.getSystemProxyStatus());
    expect(restoredProxy).toMatchObject({
      supported: true, owned: false, ownershipLost: false,
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).click();
    await expect
      .poll(() => appProcess.exitCode, {
        message: 'App did not exit cleanly',
        timeout: 5_000,
      })
      .not.toBeNull();
  } catch (error) {
    workflowError = error;
  } finally {
    let proxyCleanupError: unknown = null;
    const hostSafetyErrors: unknown[] = [];
    await workflowHostSafetyGuard?.captureProcessTrees().catch((error) => {
      hostSafetyErrors.push(error);
    });
    if (appProcess.exitCode === null && page) {
      try {
        await restoreProxyBeforeShutdown(page);
      } catch (error) {
        proxyCleanupError = error;
      }
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).click().catch((error) => {
        hostSafetyErrors.push(error);
      });
      await waitForExit(appProcess).catch((error) => { hostSafetyErrors.push(error); });
    }
    if (process.platform !== 'darwin') await browser?.close().catch(() => undefined);
    if (appProcess.exitCode === null) {
      let terminationAllowed = true;
      if (workflowHostSafetyGuard) {
        const cleanup = process.platform === 'darwin'
          ? workflowHostSafetyGuard.cleanupRegisteredApplications()
          : workflowHostSafetyGuard.terminateRegisteredApplications();
        await cleanup.catch((error) => {
          terminationAllowed = process.platform !== 'darwin';
          hostSafetyErrors.push(error);
        });
      } else if (process.platform !== 'darwin') {
        appProcess.kill();
      } else {
        terminationAllowed = false;
        hostSafetyErrors.push(new Error('macOS cleanup has no host baseline; retaining the application and profile.'));
      }
      if (terminationAllowed) await waitForExit(appProcess);
    }
    if (process.platform === 'darwin' && (appProcess.exitCode !== null || appProcess.signalCode !== null)) {
      await browser?.close().catch(() => undefined);
    }
    await workflowHostSafetyGuard?.verifyRestored().catch((error) => {
      hostSafetyErrors.push(error);
    });
    await testInfo.attach('main-process-log', {
      body: Buffer.from(processOutput.read(), 'utf8'),
      contentType: 'text/plain',
    });
    const cleanupErrors = [workflowError, proxyCleanupError, ...hostSafetyErrors]
      .filter((error) => error !== null);
    if (cleanupErrors.length === 0) {
      fs.rmSync(userDataPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    } else {
      testInfo.annotations.push({
        type: 'preserved-user-data',
        description: userDataPath,
      });
    }
    if (cleanupErrors.length === 1) {
      throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, 'Packaged smoke or cleanup failed.');
    }
  }

  if (corePid !== null) {
    const stoppedCorePid = corePid;
    await expect
      .poll(() => isProcessAlive(stoppedCorePid), { timeout: 5_000 })
      .toBe(false);
  }
});

/**
 * Before the screenshot matrix, give the asynchronous post-restart bootstrap time to
 * raise its readiness modal and close it, so it cannot pop up mid-capture and block a
 * click. If the modal never appears (listener-not-ready path), just proceed.
 */
async function drainReadinessBeforeCapture(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Proxy not ready' });
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
      return;
    }
    await page.waitForTimeout(500);
  }
}

/** Wait for cold-start BootScreen or the later runtime readiness dialog to settle. */
async function settleProxyReadiness(page: Page): Promise<void> {
  const bootScreen = page.locator(
    `[data-automation-id="${AUTOMATION_IDS.shell.boot.screen}"]`,
  );
  const dialog = page.getByRole('dialog').filter({ hasText: 'Proxy not ready' });
  const recording = page.getByRole('button', { name: 'Recording' });
  let lastPhase = 'screen-missing';
  await expect.poll(async () => {
    if (await bootScreen.isVisible()) {
      lastPhase = await bootScreen.getAttribute('data-phase') ?? 'unknown';
      return lastPhase === 'error'
        ? 'boot-error'
        : `pending:${lastPhase}`;
    }
    if (await dialog.isVisible()) {
      return 'prompt';
    }
    if (await recording.isVisible()) {
      return 'recording';
    }
    return `pending:${lastPhase}`;
  }, {
    message: 'Proxy readiness did not settle',
    // CoreRuntime itself allows 30 seconds for a cold process to become ready.
    timeout: 35_000,
  }).not.toMatch(/^pending:/);

  if (await bootScreen.isVisible()) {
    await bootScreen.locator(
      `[data-automation-id="${AUTOMATION_IDS.shell.boot.enterAnyway}"]`,
    ).click();
    await expect(page.getByRole('button', { name: 'Paused' })).toBeVisible();
    await expect(page.getByText('System proxy off', { exact: true })).toBeVisible();
  } else if (await dialog.isVisible()) {
    await expect(page.getByRole('button', { name: 'Paused' })).toBeVisible();
    await expect(page.getByText('System proxy off', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }
}

/** Confirm guarded system-proxy restore before any forced process fallback. */
async function restoreProxyBeforeShutdown(page: Page): Promise<void> {
  if (await page.evaluate(() => window.interceptor.getStartupStage()) !== 'ready') return;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  const restore = getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore);
  const enable = getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable);
  await expect(restore.or(enable)).toBeVisible();
  if (await restore.isVisible()) await restore.click();
  await expect(enable).toBeEnabled({ timeout: 35_000 });
}

function resolvePackagedExecutable(): string {
  const packageDirectory = path.resolve(
    process.cwd(),
    'out',
    `Interceptor-${process.platform}-${process.arch}`,
  );

  if (process.platform === 'win32') {
    return path.join(packageDirectory, 'Interceptor.exe');
  }

  if (process.platform === 'darwin') {
    return path.join(
      path.resolve(
        process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
          ?? path.join(packageDirectory, 'Interceptor.app'),
      ),
      'Contents',
      'MacOS',
      'Interceptor',
    );
  }

  return path.join(packageDirectory, 'Interceptor');
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function reservePort(): Promise<number> {
  const server = net.createServer();

  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a CDP port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function isCdpReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

function captureProcessOutput(process: ChildProcess, outputPath: string | null): { read: () => string } {
  if (outputPath !== null) {
    return { read: () => fs.readFileSync(outputPath, 'utf8').slice(-8_000) };
  }
  let output = '';
  const append = (chunk: Buffer | string): void => {
    output = `${output}${chunk.toString()}`.slice(-8_000);
  };

  process.stdout?.on('data', append);
  process.stderr?.on('data', append);

  return { read: () => output };
}

async function waitForExit(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    process.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/** Select the platform host guard around the final packaged executable. */
async function createPackagedWorkflowHostSafetyGuard(
  executablePath: string,
): Promise<WorkflowHostSafetyGuard | null> {
  switch (process.platform) {
    case 'win32':
      return createWindowsPackagedWorkflowHostSafetyGuard(executablePath);
    case 'darwin':
      return createMacosPackagedWorkflowHostSafetyGuard(executablePath);
    default:
      return null;
  }
}

async function createWindowsPackagedWorkflowHostSafetyGuard(
  executablePath: string,
): Promise<WorkflowHostSafetyGuard> {
  const localAppDataDirectory = process.env.LOCALAPPDATA;
  if (!localAppDataDirectory) {
    throw new Error('LOCALAPPDATA is required for packaged smoke host protection.');
  }
  const helperPath = resolvePackagedWinInetHelperPath(executablePath);
  if (!fs.existsSync(helperPath)) {
    throw new Error(`Packaged WinINet helper is missing: ${helperPath}`);
  }
  return new WorkflowHostSafetyGuard(new WindowsWorkflowHostSafetyOperations({
    desktopDirectory: process.cwd(),
    helperPath,
    localAppDataDirectory,
    dismissDialogs: dismissWindowsFileDialogs,
  }));
}

async function createMacosPackagedWorkflowHostSafetyGuard(
  executablePath: string,
): Promise<WorkflowHostSafetyGuard> {
  const helperPath = path.resolve(path.dirname(executablePath), '../Resources/system-proxy/macos-proxy-helper');
  if (!fs.existsSync(helperPath)) {
    throw new Error(`Packaged macOS proxy helper is missing: ${helperPath}`);
  }
  return new WorkflowHostSafetyGuard(
    new MacosWorkflowHostSafetyOperations(process.cwd(), helperPath),
    'macOS',
  );
}

/** Resolve the packaged helper used for WinINet and process-generation operations. */
function resolvePackagedWinInetHelperPath(executablePath: string): string {
  return path.join(
    path.dirname(executablePath),
    'resources',
    'system-proxy',
    'wininet-proxy-helper.exe',
  );
}

async function registerPackagedCaptureListener(page: Page, guard: WorkflowHostSafetyGuard): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      return registerMacosPackagedCaptureListener(page, guard);
    default:
      return guard.registerCaptureListenerProcess();
  }
}

async function registerMacosPackagedCaptureListener(page: Page, guard: WorkflowHostSafetyGuard): Promise<void> {
  await expect.poll(
    () => page.evaluate(async () => (await window.interceptor.getCaptureStatus()).listening),
    { message: 'macOS capture listener did not become ready', timeout: 20_000 },
  ).toBe(true);
  await guard.registerCaptureListenerProcess();
}

/** Read one packaged process generation using the corresponding native query. */
async function readPackagedProcessIdentity(
  processId: number,
): Promise<{ readonly processId: number; readonly processStartedAt: string }> {
  switch (process.platform) {
    case 'win32':
      return readWindowsPackagedProcessIdentity(processId);
    case 'darwin':
      return MacosWorkflowHostSafetyOperations.readProcessIdentity(processId);
    default:
      throw new Error(`Packaged process inspection is not supported on ${process.platform}.`);
  }
}

async function readWindowsPackagedProcessIdentity(
  processId: number,
): Promise<{ readonly processId: number; readonly processStartedAt: string }> {
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
    throw new Error(`Packaged process ${processId} has no stable start token.`);
  }
  return { processId, processStartedAt: value.processStartedAt };
}

/** Terminate one exact packaged process generation without a reusable PID race. */
async function terminatePackagedProcess(
  processIdentity: { readonly processId: number; readonly processStartedAt: string },
): Promise<void> {
  switch (process.platform) {
    case 'win32':
      return terminateWindowsPackagedProcess(processIdentity);
    case 'darwin':
      return terminateMacosPackagedProcess(processIdentity);
    default:
      throw new Error(`Packaged process termination is not supported on ${process.platform}.`);
  }
}

async function terminateMacosPackagedProcess(
  processIdentity: { readonly processId: number; readonly processStartedAt: string },
): Promise<void> {
  const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(processIdentity.processId);
  if (current.processStartedAt !== processIdentity.processStartedAt) {
    throw new Error('Packaged Core process generation changed before termination.');
  }
  process.kill(processIdentity.processId, 'SIGKILL');
  await expect.poll(() => isProcessAlive(processIdentity.processId), { timeout: 5_000 }).toBe(false);
}

async function terminateWindowsPackagedProcess(
  processIdentity: { readonly processId: number; readonly processStartedAt: string },
): Promise<void> {
  const encodedIdentity = Buffer.from(
    JSON.stringify(processIdentity),
    'utf8',
  ).toString('base64');
  const script = String.raw`
$identity = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedIdentity}')
) | ConvertFrom-Json
$process = Get-Process -Id ([int]$identity.processId) -ErrorAction Stop
$processStartedAt = $process.StartTime.ToUniversalTime().ToString(
  'O',
  [Globalization.CultureInfo]::InvariantCulture
)
if ($processStartedAt -ne [string]$identity.processStartedAt) {
  throw 'Packaged Core process generation changed before termination.'
}
$process.Kill()
if (-not $process.WaitForExit(5000)) {
  throw 'Timed out terminating packaged Core.'
}
`;
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
}