import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { chromium, expect, test, type Browser } from '@playwright/test';

test('packaged app starts with an isolated renderer and healthy core', async ({
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

    await expect(page.getByText('Interceptor', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    const securitySnapshot = await page.evaluate(() => ({
      apiKeys: Object.keys(window.interceptor).sort(),
      hasNodeProcess: typeof (window as unknown as { process?: unknown }).process,
      hasNodeRequire: typeof (window as unknown as { require?: unknown }).require,
      csp:
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? null,
    }));

    expect(securitySnapshot).toEqual({
      apiKeys: ['getCoreStatus', 'onCoreStatusChange'],
      hasNodeProcess: 'undefined',
      hasNodeRequire: 'undefined',
      csp: expect.stringContaining("connect-src 'none'"),
    });
    expect(securitySnapshot.csp).toContain("frame-src 'none'");
    expect(securitySnapshot.csp).not.toContain('frame-ancestors');

    await expect
      .poll(
        async () => {
          const status = await page.evaluate(() =>
            window.interceptor.getCoreStatus(),
          );
          corePid = status.pid;
          return status.state;
        },
        { timeout: 10_000 },
      )
      .toBe('healthy');

    expect(corePid).not.toBeNull();
    await expect(page.getByText(`PID ${corePid}`)).toBeVisible();

    await page
      .getByRole('radio', { name: 'Light theme' })
      .locator('..')
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.mouse.move(400, 400);
    await expect(page.locator('.ant-tooltip')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('interceptor-light-1280x800.png'),
      animations: 'disabled',
    });

    await page
      .getByRole('radio', { name: 'Dark theme' })
      .locator('..')
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.mouse.move(400, 400);
    await expect(page.locator('.ant-tooltip')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('interceptor-dark-1280x800.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 900, height: 600 });
    await expect(page.getByRole('main')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('interceptor-dark-900x600.png'),
      animations: 'disabled',
    });

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