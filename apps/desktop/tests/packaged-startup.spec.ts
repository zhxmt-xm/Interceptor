import fs from 'node:fs';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

test('packaged app starts with an isolated renderer and healthy core', async ({
  }, testInfo) => {
  const executablePath = resolvePackagedExecutable();
  expect(fs.existsSync(executablePath), `Missing package: ${executablePath}`).toBe(
    true,
  );

  const electronApp = await electron.launch({ executablePath });
  let corePid: number | null = null;

  try {
    const page = await electronApp.firstWindow();
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

    await page.getByLabel('Dark theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: testInfo.outputPath('interceptor-dark-1280x800.png'),
      animations: 'disabled',
    });

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(900, 600);
    });
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('interceptor-dark-900x600.png'),
      animations: 'disabled',
    });
  } finally {
    await electronApp.close();
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