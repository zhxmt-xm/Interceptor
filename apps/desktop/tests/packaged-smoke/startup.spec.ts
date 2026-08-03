import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import {
  createServer as createHttpServer,
  request as requestHttp,
  type Server as HttpServer,
} from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@playwright/test';

class ReleaseScreenshotMatrix {
  /** All implemented workspaces addressed through the production sidebar. */
  private static readonly views = [
    { label: 'Capture', slug: 'capture' },
    { label: 'Rules & Map', slug: 'rules' },
    { label: 'Composer', slug: 'composer' },
    { label: 'Breakpoints', slug: 'breakpoints' },
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
  static async capture(page: Page, testInfo: TestInfo): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const theme of ['light', 'dark'] as const) {
      await this.selectTheme(page, theme);
      for (const view of this.views) {
        await this.selectView(page, view.label);
        await this.screenshot(page, testInfo, `${view.slug}-${theme}-1280x800.png`);
      }
    }

    await page.setViewportSize({ width: 900, height: 600 });
    for (const view of this.views) {
      await this.selectView(page, view.label);
      await this.screenshot(page, testInfo, `${view.slug}-dark-900x600.png`);
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    let currentLanguageLabel = 'Language';
    for (const language of this.languages) {
      await this.selectLanguage(page, currentLanguageLabel, language);
      currentLanguageLabel = language.languageLabel;
    }
    await this.screenshot(page, testInfo, 'capture-lang-uk.png');
    await this.selectLanguage(page, currentLanguageLabel, this.languages[0]);
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
    await page.evaluate(() => window.interceptor.stopCapture());

    const origin = await this.startOrigin();
    const proxyPort = await reservePort();
    try {
      const capture = await page.evaluate((port) =>
        window.interceptor.startCapture(port), proxyPort);
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

      const composer = await page.evaluate((url) =>
        window.interceptor.sendComposerRequest({
          method: 'GET',
          url,
          headers: [],
          protocol: 'http/1.1',
          timeoutMs: 5_000,
        }), `http://127.0.0.1:${origin.port}/composer-smoke`);
      expect(composer).toMatchObject({ ok: true, status: 200 });

      const rules = await page.evaluate(() => window.interceptor.getRules());
      expect(Array.isArray(rules.rules)).toBe(true);

      const breakpoints = await page.evaluate(() =>
        window.interceptor.listBreakpoints());
      const disabled = await page.evaluate(() =>
        window.interceptor.setBreakpointsEnabled(false));
      expect(disabled).toBe(false);
      const restored = await page.evaluate((enabled) =>
        window.interceptor.setBreakpointsEnabled(enabled), breakpoints.enabled);
      expect(restored).toBe(breakpoints.enabled);

      const diagnostics = await page.evaluate(() =>
        window.interceptor.queryDiagnostics({ limit: 20 }));
      expect(diagnostics.records.length).toBeGreaterThan(0);
    } finally {
      const beforeStop = await page.evaluate(() =>
        window.interceptor.getStorageStatus());
      // 暂停记录：监听器与系统代理保持运行、流量继续转发，已录数据保留到手动 Clear。
      const paused = await page.evaluate(() => window.interceptor.stopCapture())
        .catch(() => null);
      if (paused) {
        expect(paused).toMatchObject({ listening: true, recording: false });
      }
      await expect.poll(() => page.evaluate(() => window.interceptor.getStorageStatus()), {
        message: 'Pausing Capture changed retained recording data',
        timeout: 10_000,
      }).toMatchObject({
        sessionCount: beforeStop.sessionCount,
        exchangeCount: beforeStop.exchangeCount,
        bodyCount: beforeStop.bodyCount,
        blobBytes: beforeStop.blobBytes,
      });
      await page.evaluate(() => window.interceptor.clearStorage());
      await expect.poll(() => page.evaluate(() => window.interceptor.getStorageStatus()), {
        message: 'Manual Clear did not delete temporary recording data',
        timeout: 10_000,
      }).toMatchObject({
        sessionCount: 1,
        exchangeCount: 0,
        bodyCount: 0,
        blobBytes: 0,
      });
      await this.closeOrigin(origin.server);
    }
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
  test.setTimeout(90_000);
  const executablePath = resolvePackagedExecutable();
  expect(fs.existsSync(executablePath), `Missing package: ${executablePath}`).toBe(
    true,
  );

  const debuggingPort = await reservePort();
  const userDataPath = fs.mkdtempSync(
    path.join(os.tmpdir(), 'interceptor-packaged-smoke-'),
  );
  const appProcess = spawn(
    executablePath,
    [
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${userDataPath}`,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const processOutput = captureProcessOutput(appProcess);
  let browser: Browser | null = null;
  let corePid: number | null = null;

  try {
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
      .poll(() => context?.pages().length ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const page = context?.pages()[0];
    expect(page, 'Packaged app did not create a renderer page').toBeDefined();
    if (!page) {
      throw new Error('Packaged app did not create a renderer page');
    }

    await page.waitForLoadState('domcontentloaded');

    // Keep the packaged UI deterministic; HTTPS trust remains user-initiated and untouched.
    await page.evaluate(() => {
      window.localStorage.setItem('interceptor.language', 'en');
      window.localStorage.removeItem('interceptor.lang');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 侧栏默认折叠，品牌名不渲染；改用头部视图名确认 shell 与英文语言包都已生效。
    await expect(page.getByRole('banner')).toContainText('Capture');
    await expect(page.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await settleProxyReadiness(page);

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
        'cancelTransferJob',
        'checkForUpdates',
        'clearStorage',
        'closeApplication',
        'deleteCertificate',
        'downloadUpdate',
        'echoCore',
        'enableSystemProxy',
        'generateCertificate',
        'getCaptureStatus',
        'getCertificateStatus',
        'getCoreProcessStatus',
        'getCoreTrace',
        'getExchangeDetail',
        'getInsecureHosts',
        'getRecentDiagnostics',
        'getRuleHits',
        'getRules',
        'getStorageStatus',
        'getSystemProxyStatus',
        'getTransferJob',
        'getUpdateStatus',
        'installCertificate',
        'listBreakpoints',
        'minimizeWindow',
        'onCaptureEvents',
        'onClientAppIcons',
        'onCoreProcessStatusChange',
        'onUpdateStatusChange',
        'openCertificateManager',
        'openDownloadedUpdate',
        'probeConnection',
        'queryDiagnostics',
        'queryGrpcMessages',
        'querySessions',
        'queryWebSocketFrames',
        'readBody',
        'repairSystemProxy',
        'replaceRules',
        'reportRendererDiagnostic',
        'resolveBreakpoint',
        'restoreSystemProxy',
        'revealCertificate',
        'sendComposerRequest',
        'setBreakpointsEnabled',
        'setHttpsDecryption',
        'setInsecureHosts',
        'setWebSocketBreakpointsEnabled',
        'startArchiveExport',
        'startArchiveImport',
        'startBodyExport',
        'startCapture',
        'startDiagnosticsExport',
        'startHarExport',
        'startHarImport',
        'stopCapture',
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

    const updateSnapshot = await page.evaluate(() =>
      window.interceptor.getUpdateStatus());
    expect(updateSnapshot).toMatchObject({
      supported: true,
      currentVersion: PackagedWorkflowSmoke.expectedVersion(),
      progress: null,
      downloadedBytes: null,
    });
    expect([
      'idle',
      'checking',
      'available',
      'up-to-date',
      'failed',
    ]).toContain(updateSnapshot.state);

    const systemProxy = await page.evaluate(() =>
      window.interceptor.getSystemProxyStatus(),
    );
    expect(systemProxy).toMatchObject({
      supported: true,
      owned: false,
      ownershipLost: false,
    });
    const repair = await page.evaluate(() =>
      window.interceptor.repairSystemProxy(),
    );
    expect(repair).toMatchObject({
      restored: false,
      status: { supported: true, owned: false },
    });

    await expect
      .poll(
        async () => {
          const status = await page.evaluate(() =>
            window.interceptor.getCoreProcessStatus(),
          );
          corePid = status.pid;
          return status.state;
        },
        { timeout: 10_000 },
      )
      .toBe('running');

    expect(corePid).not.toBeNull();
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
          const trace = await page.evaluate((traceId) =>
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
    process.kill(previousCorePid);

    await expect
      .poll(
        async () => {
          const status = await page.evaluate(() =>
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
        { message: 'Core did not restart with a new PID', timeout: 15_000 },
      )
      .toBe(true);

    await expect
      .poll(() => isProcessAlive(previousCorePid), { timeout: 5_000 })
      .toBe(false);
    const restartedEcho = await page.evaluate(() =>
      window.interceptor.echoCore('m1-restarted-port'),
    );
    expect(restartedEcho.value).toBe('m1-restarted-port');

    // 存储栈端到端：Main IPC → CoreRuntime → 真实 Core → Core 内临时 Capture/Body Store。
    const storageStatus = await page.evaluate(
      () => window.interceptor.getStorageStatus(),
    );
    expect(storageStatus).not.toHaveProperty('quotaBytes');
    expect(storageStatus.databaseBytes).toBe(0);

    // Recording 期间清空应保留当前 Session 壳，但 Exchange/Body 必须归零。
    const clearRecordingPort = await reservePort();
    await expect.poll(
      () => page.evaluate(async (port) => {
        const current = await window.interceptor.getCaptureStatus();
        if (current.listening) {
          return true;
        }
        try {
          return (await window.interceptor.startCapture(port)).listening;
        } catch {
          return false;
        }
      }, clearRecordingPort),
      { message: 'Recording did not restart before Clear', timeout: 10_000 },
    ).toBe(true);
    const clearedStorage = await page.evaluate(() =>
      window.interceptor.clearStorage(),
    );
    expect(clearedStorage.sessionCount).toBe(1);
    expect(clearedStorage.exchangeCount).toBe(0);
    expect(clearedStorage.bodyCount).toBe(0);

    await PackagedWorkflowSmoke.run(page);

    // Let the async post-restart bootstrap raise and settle its readiness modal before
    // the screenshot matrix, so it cannot pop up mid-capture and block a click.
    await drainReadinessBeforeCapture(page);

    await ReleaseScreenshotMatrix.capture(page, testInfo);

    await page.evaluate(() => window.interceptor.closeApplication());
    await expect
      .poll(() => appProcess.exitCode, {
        message: 'App did not exit cleanly',
        timeout: 5_000,
      })
      .not.toBeNull();
  } finally {
    await browser?.close().catch(() => undefined);
    if (appProcess.exitCode === null) {
      appProcess.kill();
      await waitForExit(appProcess);
    }
    fs.rmSync(userDataPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
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

/** Wait for automatic bootstrap to become Recording or present its recovery dialog. */
async function settleProxyReadiness(page: Page): Promise<void> {
  // The recovery dialog is an Ant Modal whose role="dialog" element carries no accessible
  // name, so match it by its heading text instead of an accessible-name role query.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Proxy not ready' });
  const recording = page.getByRole('button', { name: 'Recording' });
  await expect.poll(async () => {
    if (await dialog.isVisible()) {
      return 'prompt';
    }
    if (await recording.isVisible()) {
      return 'recording';
    }
    return 'pending';
  }, {
    message: 'Proxy readiness did not settle',
    timeout: 20_000,
  }).not.toBe('pending');

  if (await dialog.isVisible()) {
    await expect(page.getByRole('button', { name: 'Paused' })).toBeVisible();
    await expect(page.getByText('System proxy off', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }
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
      packageDirectory,
      'Interceptor.app',
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

function captureProcessOutput(process: ChildProcess): { read: () => string } {
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