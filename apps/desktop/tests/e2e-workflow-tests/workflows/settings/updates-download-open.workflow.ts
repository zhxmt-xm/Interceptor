import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TestInfo } from '@playwright/test';
import semver from 'semver';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  listTree,
  openUpdatesPanel,
  readDownloadSample,
  waitForTerminalUpdateStatus,
  type DownloadSample,
} from '../../fixtures/ui/update-panel';
import {
  cancelOpenedWindowsInstaller,
  readWindowsMsiInstallerProcesses,
} from '../../fixtures/ui/windows-msi-installer';

test.skip(process.platform !== 'win32',
  'Native MSI download and installer cancellation are verified on Windows.');
test.skip(!process.env.INTERCEPTOR_E2E_APP_PATH,
  'Anonymous installer download requires a packaged App through INTERCEPTOR_E2E_APP_PATH.');

test('settings.updates.download-open downloads, verifies and opens the real installer', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.setTimeout(25 * 60_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.updates.download-open',
  });
  const { page } = desktopApp;

  // 准备：真实检查必须发现比被测 App 更高的已发布版本；否则记录前提不满足并跳过。
  // Arrange: the real check must find a published version above the App under test; otherwise record the unmet precondition and skip.
  await openUpdatesPanel(page);
  const initial = await waitForTerminalUpdateStatus(page);
  expect(initial.supported).toBe('true');
  testInfo.annotations.push({
    type: 'update-precondition',
    description: `${initial.currentVersion} -> ${initial.latestVersion} (${initial.state})`,
  });
  testInfo.skip(initial.state !== 'available',
    `Requires a packaged App older than the real published release; check returned ${initial.state}.`);
  expect(semver.valid(initial.currentVersion)).not.toBeNull();
  expect(semver.valid(initial.latestVersion)).not.toBeNull();
  expect(semver.gt(initial.latestVersion!, initial.currentVersion!)).toBe(true);
  await screenshotStep('准备：真实检查发现更高的已发布版本 / Arrange: the real check finds a newer published release');

  // 用户操作：显式点击 Download，采样公开进度后等待校验与原子落盘完成。
  // User action: click Download; sample public progress, then wait for verification and the atomic rename.
  const download = getByAutomationId(page, AUTOMATION_IDS.settings.updates.download);
  await expect(download).toBeEnabled();
  await download.click();
  await expect(download).toHaveCount(0);
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  await expect(status).toHaveAttribute('data-state', 'downloading', { timeout: 60_000 });
  const samples: DownloadSample[] = [];
  let lastState: string | null = 'downloading';
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const { state, sample } = await readDownloadSample(page);
    lastState = state;
    if (sample && (samples.length === 0 || sample.downloadedBytes !== samples.at(-1)!.downloadedBytes)) {
      samples.push(sample);
    }
    if (state !== 'downloading') {
      break;
    }
    await page.waitForTimeout(200);
  }
  expect(lastState).toBe('downloaded');
  await expect(status).toHaveAttribute('data-state', 'downloaded');
  expect(samples.length).toBeGreaterThan(0);
  const totalBytes = samples[0]!.totalBytes;
  expect(totalBytes).toBeGreaterThan(0);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]!.totalBytes).toBe(totalBytes);
    expect(samples[index]!.progress).toBeGreaterThanOrEqual(samples[index - 1]!.progress);
    expect(samples[index]!.downloadedBytes).toBeGreaterThanOrEqual(samples[index - 1]!.downloadedBytes);
  }
  expect(samples.at(-1)!.progress).toBeGreaterThan(samples[0]!.progress);
  await screenshotStep('用户操作：显式下载并等待校验完成 / User action: download explicitly and wait for verification');

  // 业务断言：只剩本次下载的 MSI，没有 .part 残留，尺寸与声明的 totalBytes 一致。
  // Business assertion: only this MSI remains, with no .part residue and the declared byte size.
  const downloadsDirectory = path.join(desktopApp.userDataDirectory, 'updates/downloads');
  const names = (await readdir(downloadsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  expect(names).toHaveLength(1);
  expect(names[0]!.toLowerCase().endsWith('.msi')).toBe(true);
  expect(names.filter((name) => name.includes('.part'))).toEqual([]);
  const installerPath = path.join(downloadsDirectory, names[0]!);
  expect((await stat(installerPath)).size).toBe(totalBytes);

  // 用户操作：打开安装器；只允许本次完整校验的 MSI，并在原生窗口取消，不安装或修改当前 App。
  // User action: open the installer; only this verified MSI may open, then cancel it in the native window without installing.
  const installDirectory = path.join(process.env.LOCALAPPDATA!, 'Programs', 'Interceptor');
  const installTreeBefore = await listTree(installDirectory);
  const knownProcessIds = (await readWindowsMsiInstallerProcesses()).map((process) => process.processId);
  await getByAutomationId(page, AUTOMATION_IDS.settings.updates.openInstaller).click();
  const cancellation = await cancelOpenedWindowsInstaller({
    knownProcessIds,
    expectedInstallerPath: installerPath,
    windowTimeoutMs: 120_000,
    exitTimeoutMs: 120_000,
  });
  expect(cancellation.closed).toBe(true);
  expect(cancellation.exited).toBe(true);
  expect(cancellation.commandLine.toLowerCase()).toContain(installerPath.toLowerCase());
  expect(await listTree(installDirectory)).toEqual(installTreeBefore);
  await expect(status).toHaveAttribute('data-state', 'downloaded');
  expect(page.isClosed()).toBe(false);
  await screenshotStep('用户操作：打开本次安装器并在原生窗口取消 / User action: open this installer and cancel the native window');

  // 证据：只保留版本、采样和布尔结论；fixture 负责 trace、正常 Close、进程、8888 与宿主恢复。
  // Evidence: versions, samples and boolean outcomes only; the fixture owns trace, Close, processes, 8888 and host recovery.
  const installDirectoryUnchanged =
    JSON.stringify(installTreeBefore) === JSON.stringify(await listTree(installDirectory));
  const evidencePath = testInfo.outputPath('updates-download-open.json');
  await writeFile(evidencePath, JSON.stringify({
    checkedAt: initial.lastCheckedAt,
    currentVersion: initial.currentVersion,
    latestVersion: initial.latestVersion,
    targetState: 'downloaded',
    installer: {
      fileName: names[0]!,
      bytes: totalBytes,
      partFiles: names.filter((name) => name.includes('.part')),
    },
    samples,
    installerWindow: {
      title: cancellation.window.title,
      closed: cancellation.closed,
      exited: cancellation.exited,
      actions: cancellation.actions,
      buttons: cancellation.buttons,
      openedDownloadedInstaller: cancellation.commandLine.toLowerCase().includes(installerPath.toLowerCase()),
    },
    installDirectoryUnchanged,
    appStillRunning: !page.isClosed(),
  }, null, 2), 'utf8');
  await testInfo.attach('updates-download-open.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
