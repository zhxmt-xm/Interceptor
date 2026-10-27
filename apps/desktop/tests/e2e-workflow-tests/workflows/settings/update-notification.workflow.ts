import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';
import semver from 'semver';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  listTree,
  openUpdatesPanel,
  waitForTerminalUpdateStatus,
} from '../../fixtures/ui/update-panel';
import {
  cancelOpenedWindowsInstaller,
  readWindowsMsiInstallerProcesses,
} from '../../fixtures/ui/windows-msi-installer';

interface NotificationMetrics {
  readonly viewportWidth: number;
  readonly noticeWidth: number;
  readonly noticeHeight: number;
  readonly actionWidth: number;
  readonly actionHeight: number;
  readonly actionPaddingLeft: number;
  readonly actionPaddingRight: number;
  readonly actionGap: number;
  readonly actionFontSize: number;
  readonly actionFontWeight: number;
  readonly iconWidth: number;
  readonly iconHeight: number;
  readonly textWidth: number;
  readonly textHeight: number;
  readonly unionCenterDeltaX: number;
  readonly unionCenterDeltaY: number;
  readonly barCenterDeltaY: number;
  readonly windowControlsOverlap: boolean;
  readonly settingsActionHeight: number;
  readonly pixelRatio: number;
}

/** Measure the real notification, its action and the Settings action from the DOM. */
async function readNotificationMetrics(page: Page, settingsActionId: string): Promise<NotificationMetrics> {
  return page.evaluate(([ids, settingsAction]) => {
    const query = (root: ParentNode, id: string): HTMLElement => {
      const element = root.querySelector(`[data-automation-id="${id}"]`);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing automation element ${id}.`);
      }
      return element;
    };
    const notice = query(document, ids.notice);
    const action = query(notice, ids.action);
    const icon = action.querySelector('svg');
    const label = action.querySelector('span');
    if (!icon || !label) {
      throw new Error('The notification action omitted its icon or label.');
    }
    const range = document.createRange();
    range.selectNodeContents(label);
    const textBox = range.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    const noticeBox = notice.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    const settingsBox = query(document, settingsAction).getBoundingClientRect();
    const windowControls = [...document.querySelectorAll('[data-automation-id^="shell.window."]')]
      .map((element) => element.getBoundingClientRect());
    const controlsLeft = Math.min(...windowControls.map((box) => box.left));
    const controlsRight = Math.max(...windowControls.map((box) => box.right));
    const controlsTop = Math.min(...windowControls.map((box) => box.top));
    const controlsBottom = Math.max(...windowControls.map((box) => box.bottom));
    const style = getComputedStyle(action);
    const unionLeft = Math.min(textBox.left, iconBox.left);
    const unionRight = Math.max(textBox.right, iconBox.right);
    const unionTop = Math.min(textBox.top, iconBox.top);
    const unionBottom = Math.max(textBox.bottom, iconBox.bottom);
    return {
      viewportWidth: innerWidth,
      noticeWidth: noticeBox.width,
      noticeHeight: noticeBox.height,
      actionWidth: actionBox.width,
      actionHeight: actionBox.height,
      actionPaddingLeft: Number.parseFloat(style.paddingLeft),
      actionPaddingRight: Number.parseFloat(style.paddingRight),
      actionGap: Number.parseFloat(style.gap),
      actionFontSize: Number.parseFloat(style.fontSize),
      actionFontWeight: Number.parseFloat(style.fontWeight),
      iconWidth: iconBox.width,
      iconHeight: iconBox.height,
      textWidth: textBox.width,
      textHeight: textBox.height,
      unionCenterDeltaX: (unionLeft + unionRight) / 2 - (actionBox.left + actionBox.right) / 2,
      unionCenterDeltaY: (unionTop + unionBottom) / 2 - (actionBox.top + actionBox.bottom) / 2,
      barCenterDeltaY: (actionBox.top + actionBox.bottom) / 2 - (noticeBox.top + noticeBox.bottom) / 2,
      windowControlsOverlap: controlsLeft < noticeBox.right && controlsRight > noticeBox.left &&
        controlsTop < noticeBox.bottom && controlsBottom > noticeBox.top,
      settingsActionHeight: settingsBox.height,
      pixelRatio: devicePixelRatio,
    };
  }, [{
    notice: AUTOMATION_IDS.settings.updateNotification.root,
    action: AUTOMATION_IDS.settings.updateNotification.action,
  }, settingsActionId] as const);
}

/** Assert the compact action contract and its measured centering. */
function expectCompactNotification(metrics: NotificationMetrics, settingsActionHeight: number): void {
  expect(Math.abs(metrics.noticeHeight - 44)).toBeLessThanOrEqual(0.5);
  expect(metrics.noticeWidth).toBeGreaterThanOrEqual(230);
  expect(metrics.noticeWidth).toBeLessThanOrEqual(380.5);
  expect(Math.abs(metrics.actionHeight - 32)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.actionPaddingLeft - 11)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.actionPaddingRight - 11)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.actionGap - 7)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.actionFontSize - 12.5)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.actionFontWeight - 550)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.iconWidth - 15)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.iconHeight - 15)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.unionCenterDeltaX)).toBeLessThanOrEqual(1 / metrics.pixelRatio);
  expect(Math.abs(metrics.unionCenterDeltaY)).toBeLessThanOrEqual(1 / metrics.pixelRatio);
  expect(Math.abs(metrics.barCenterDeltaY)).toBeLessThanOrEqual(1 / metrics.pixelRatio);
  expect(metrics.windowControlsOverlap).toBe(false);
  expect(Math.abs(metrics.settingsActionHeight - settingsActionHeight)).toBeLessThanOrEqual(0.5);
}

test.skip(process.platform !== 'win32',
  'The real installer notification flow is verified on Windows.');
test.skip(!process.env.INTERCEPTOR_E2E_APP_PATH,
  'The real update notification requires a packaged App through INTERCEPTOR_E2E_APP_PATH.');

test('settings.update-notification opens and dismisses the real installer notification', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.setTimeout(5 * 60_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.update-notification',
  });
  const { page } = desktopApp;

  // 准备：真实检查发现更高版本，Header 通知与 Settings 共享同一状态。
  // Arrange: the real check finds a newer release, and the header notification shares the Settings state.
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

  const notice = getByAutomationId(page, AUTOMATION_IDS.settings.updateNotification.root);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-state', 'available');
  const availableMetrics = await readNotificationMetrics(page, AUTOMATION_IDS.settings.updates.download);
  expect(availableMetrics.viewportWidth).toBeGreaterThan(1050);
  expectCompactNotification(availableMetrics, 34);
  await notice.screenshot({ path: testInfo.outputPath('update-notification-available.png') });
  await screenshotStep('准备：真实可用版本与通知 / Arrange: the real available release and its notification');

  // 用户操作：点击通知里的真实 Download；下载期间通知隐藏，完成后通知同步为 Downloaded。
  // User action: click the real Download action in the notification; it hides while downloading and returns as downloaded.
  const notificationAction = getByAutomationId(page, AUTOMATION_IDS.settings.updateNotification.action);
  await notificationAction.click();
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  await expect(status).toHaveAttribute('data-state', 'downloading', { timeout: 60_000 });
  await expect(notice).toHaveCount(0);
  await expect(status).toHaveAttribute('data-state', 'downloaded', { timeout: 5 * 60_000 });
  await expect(notice).toHaveAttribute('data-state', 'downloaded');
  const downloadedMetrics = await readNotificationMetrics(page, AUTOMATION_IDS.settings.updates.openInstaller);
  expectCompactNotification(downloadedMetrics, 34);
  await notice.screenshot({ path: testInfo.outputPath('update-notification-downloaded.png') });

  // 共享状态：切到其他 workspace 后通知仍由同一 store 驱动显示。
  // Shared state: the notification still renders from the same store after leaving Settings.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(notice).toBeVisible();
  await screenshotStep('用户操作：下载完成后的通知 / User action: the downloaded notification');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await expect(status).toHaveAttribute('data-state', 'downloaded');

  // 用户操作：从通知打开安装器，只允许本次下载的 MSI，并在原生窗口取消。
  // User action: open the installer from the notification, only for this MSI, then cancel the native window.
  const downloadsDirectory = path.join(desktopApp.userDataDirectory, 'updates/downloads');
  const installDirectory = path.join(process.env.LOCALAPPDATA!, 'Programs', 'Interceptor');
  const installTreeBefore = await listTree(installDirectory);
  const files = (await readdir(downloadsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  expect(files).toHaveLength(1);
  const installerPath = path.join(downloadsDirectory, files[0]!);
  const knownProcessIds = (await readWindowsMsiInstallerProcesses()).map((process) => process.processId);
  await notificationAction.click();
  const cancellation = await cancelOpenedWindowsInstaller({
    knownProcessIds,
    expectedInstallerPath: installerPath,
    windowTimeoutMs: 120_000,
    exitTimeoutMs: 120_000,
  });
  expect(cancellation.closed).toBe(true);
  expect(cancellation.exited).toBe(true);
  expect(await listTree(installDirectory)).toEqual(installTreeBefore);
  await expect(notice).toHaveAttribute('data-state', 'downloaded');
  await screenshotStep('用户操作：从通知打开并取消安装器 / User action: open from the notification and cancel the installer');

  // 业务断言：Dismiss 只隐藏通知，Settings 的动作仍可用。
  // Business assertion: Dismiss hides only the notification while the Settings action remains usable.
  await getByAutomationId(page, AUTOMATION_IDS.settings.updateNotification.dismiss).click();
  await expect(notice).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.openInstaller)).toBeEnabled();
  await expect(status).toHaveAttribute('data-state', 'downloaded');
  expect(page.isClosed()).toBe(false);

  // 证据：只保留尺寸、布尔结论与版本；fixture 负责 trace、正常 Close、进程、8888 与宿主恢复。
  // Evidence: dimensions, boolean outcomes and versions only; the fixture owns trace, Close, processes, 8888 and host recovery.
  const installDirectoryUnchanged =
    JSON.stringify(installTreeBefore) === JSON.stringify(await listTree(installDirectory));
  const evidencePath = testInfo.outputPath('update-notification.json');
  await writeFile(evidencePath, JSON.stringify({
    checkedAt: initial.lastCheckedAt,
    currentVersion: initial.currentVersion,
    latestVersion: initial.latestVersion,
    availableMetrics,
    downloadedMetrics,
    notificationHiddenWhileDownloading: true,
    busyActionDisabled: 'covered-by-component-test',
    sharedStoreAcrossWorkspaces: true,
    installerWindow: {
      title: cancellation.window.title,
      closed: cancellation.closed,
      exited: cancellation.exited,
      actions: cancellation.actions,
      buttons: cancellation.buttons,
      openedDownloadedInstaller: cancellation.commandLine.toLowerCase().includes(installerPath.toLowerCase()),
    },
    installDirectoryUnchanged,
    dismissedKeepsSettingsAction: true,
    appStillRunning: !page.isClosed(),
  }, null, 2), 'utf8');
  await testInfo.attach('update-notification.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
