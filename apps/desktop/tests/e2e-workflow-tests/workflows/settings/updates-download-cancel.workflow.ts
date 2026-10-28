import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TestInfo } from '@playwright/test';
import semver from 'semver';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  openUpdatesPanel,
  waitForTerminalUpdateStatus,
} from '../../fixtures/ui/update-panel';

test.skip(process.platform !== 'win32' && process.platform !== 'darwin',
  'Real update download and installer verification run on Windows and macOS.');
test.skip(!process.env.INTERCEPTOR_E2E_APP_PATH,
  'Installer cancellation requires a packaged App through INTERCEPTOR_E2E_APP_PATH.');

test('settings.updates.download-cancel cancels an in-flight real download', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.setTimeout(5 * 60_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.updates.download-cancel',
  });
  const { page } = desktopApp;

  // 准备：真实检查必须发现更高版本；本流程需要较慢的宿主网络，避免下载在取消前完成。
  // Arrange: the real check must find a newer release; this flow needs a slow host route so the download is still running when cancelled.
  await openUpdatesPanel(page);
  const initial = await waitForTerminalUpdateStatus(page);
  testInfo.annotations.push({
    type: 'update-precondition',
    description: `${initial.currentVersion} -> ${initial.latestVersion} (${initial.state})`,
  });
  testInfo.skip(initial.state !== 'available',
    `Requires a packaged App older than the real published release; check returned ${initial.state}.`);
  expect(semver.valid(initial.currentVersion)).not.toBeNull();
  expect(semver.valid(initial.latestVersion)).not.toBeNull();
  expect(semver.gt(initial.latestVersion!, initial.currentVersion!)).toBe(true);

  // 用户操作：立即点击 Download 和 Cancel；Main abort 后必须删除 `.part` 并回到 Available。
  // User action: click Download and Cancel immediately; Main must abort, delete `.part` and return to Available.
  const downloadsDirectory = path.join(desktopApp.userDataDirectory, 'updates/downloads');
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  const download = getByAutomationId(page, AUTOMATION_IDS.settings.updates.download);
  await expect(download).toBeEnabled();
  await download.click();
  const cancel = getByAutomationId(page, AUTOMATION_IDS.settings.updates.cancel);
  const cancelClicked = await cancel.click({ timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!cancelClicked) {
    testInfo.skip(true,
      `Cancel was not actionable before the download reached ${await status.getAttribute('data-state')} on this host; run on a slower or throttled network.`);
  }
  await expect.poll(() => status.getAttribute('data-state'), { timeout: 60_000 })
    .toMatch(/^(available|downloaded)$/);
  if (await status.getAttribute('data-state') === 'downloaded') {
    testInfo.skip(true,
      'The download completed before the cancel command took effect on this host; run on a slower or throttled network.');
  }
  await screenshotStep('用户操作：下载中点击取消并回到 Available / User action: cancel while downloading and return to Available');

  // 业务断言：状态回 Available、没有部分文件、没有可打开的安装器，App 仍运行。
  // Business assertion: Available, no partial file, nothing openable, and the App keeps running.
  await expect(status).toHaveAttribute('data-state', 'available');
  const names = await readdir(downloadsDirectory).catch(() => []);
  expect(names.filter((name) => String(name).includes('.part'))).toEqual([]);
  const assetExtension = process.platform === 'win32' ? '.msi' : '.dmg';
  expect(names.filter((name) => String(name).toLowerCase().endsWith(assetExtension))).toEqual([]);
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.openInstaller))
    .toHaveCount(0);
  expect(page.isClosed()).toBe(false);

  const evidencePath = testInfo.outputPath('updates-download-cancel.json');
  await writeFile(evidencePath, JSON.stringify({
    checkedAt: initial.lastCheckedAt,
    currentVersion: initial.currentVersion,
    latestVersion: initial.latestVersion,
    returnedTo: 'available',
    filesAfterCancel: names.map(String),
    appStillRunning: !page.isClosed(),
  }, null, 2), 'utf8');
  await testInfo.attach('updates-download-cancel.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
