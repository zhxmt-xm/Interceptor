import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import {
  createServer as createHttpServer,
  request as requestHttp,
  type Server as HttpServer,
} from 'node:http';
import net from 'node:net';
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
    { label: 'English', id: 'en' },
    { label: '简体中文', id: 'zh' },
    { label: '日本語', id: 'ja' },
    { label: 'Deutsch', id: 'de' },
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
    for (const language of this.languages) {
      await this.selectLanguage(page, language.label, language.id);
      for (const view of this.views) {
        await this.selectView(page, view.label);
        await this.screenshot(page, testInfo, `${view.slug}-lang-${language.id}.png`);
      }
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
    label: string,
    id: string,
  ): Promise<void> {
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
      window.localStorage.getItem('interceptor.lang'))).toBe(id);
  }

  /** Write one stable screenshot without tooltip or animation noise. */
  private static async screenshot(
    page: Page,
    testInfo: TestInfo,
    name: string,
  ): Promise<void> {
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.width).toBeLessThanOrEqual(0);
    expect(overflow.height).toBeLessThanOrEqual(0);
    await page.mouse.move(400, 400);
    await expect(page.locator('.ant-tooltip')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath(name),
      animations: 'disabled',
    });
  }
}

class PackagedWorkflowSmoke {
  /** Execute real Core workflows against an isolated loopback origin. */
  static async run(page: Page): Promise<void> {
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
      const validation = await page.evaluate((definitions) =>
        window.interceptor.validateRules([...definitions]), rules.rules);
      expect(validation.valid).toBe(true);

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
      await page.evaluate(() => window.interceptor.stopCapture())
        .catch(() => undefined);
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
  const executablePath = resolvePackagedExecutable();
  expect(fs.existsSync(executablePath), `Missing package: ${executablePath}`).toBe(
    true,
  );

  const debuggingPort = await reservePort();
  const appProcess = spawn(
    executablePath,
    [`--remote-debugging-port=${debuggingPort}`],
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

    // Packaged smoke validates the post-setup workspace without mutating trust stores.
    // First-run behavior itself is covered by the light/dark visual-parity flow.
    await page.evaluate(() => {
      window.localStorage.setItem('interceptor.first-run', 'completed');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Interceptor', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

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
        'clearStorage',
        'deleteCertificate',
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
        'installCertificate',
        'listBreakpoints',
        'onCaptureEvents',
        'onCoreProcessStatusChange',
        'openCertificateManager',
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
        'startCapture',
        'startDiagnosticsExport',
        'startHarExport',
        'startHarImport',
        'stopCapture',
        'uninstallCertificate',
        'validateRules',
        'viewCertificate',
      ],
      hasNodeProcess: 'undefined',
      hasNodeRequire: 'undefined',
      csp: expect.stringContaining("connect-src 'none'"),
    });
    expect(securitySnapshot.csp).toContain("frame-src 'none'");
    expect(securitySnapshot.csp).not.toContain('frame-ancestors');

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
      page.getByTitle(`Proxy Core running, PID ${corePid}`),
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

    // M2 存储栈端到端：Main IPC → CoreRuntime → 真实 Core → StorageService →
    // Storage Worker 线程 → node:sqlite 打开磁盘上的 capture.sqlite。
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const status = await window.interceptor.getStorageStatus();
            return status.quotaBytes;
          }),
        { message: 'Storage status was unavailable', timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const storageQuota = await page.evaluate(
      () => window.interceptor.getStorageStatus(),
    );
    expect(storageQuota.quotaBytes).toBeGreaterThan(0);
    expect(storageQuota.databaseBytes).toBeGreaterThan(0);

    // 清空后存储应为空，验证 cleanup 全链路（不依赖运行前是否有残留数据）。
    const clearedStorage = await page.evaluate(() =>
      window.interceptor.clearStorage(),
    );
    expect(clearedStorage.sessionCount).toBe(0);
    expect(clearedStorage.exchangeCount).toBe(0);
    expect(clearedStorage.bodyCount).toBe(0);

    await PackagedWorkflowSmoke.run(page);

    await ReleaseScreenshotMatrix.capture(page, testInfo);

    await page.evaluate(() => window.close());
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
  }

  if (corePid !== null) {
    const stoppedCorePid = corePid;
    await expect
      .poll(() => isProcessAlive(stoppedCorePid), { timeout: 5_000 })
      .toBe(false);
  }
});

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