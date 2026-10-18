import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('settings guide records a real update Check and its actual terminal result without installing', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(180_000);
  const { page } = desktopApp;
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  let terminalState = '';
  let lastCheckedAt = '';
  // 准备：使用Release原始更新源，不写入模拟状态、不提供私有凭据或替换下载内容。
  // Arrange: use the Release's original update source, without seeded status, private credentials or replaced downloads.
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-update-check');
  try {
    await media.step('01-settings', '打开Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-updates', '进入Updates查看真实状态 / Open Updates and inspect the actual state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.updates).click();
      await expect(status).toHaveAttribute('data-supported', 'true');
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.check)).toBeVisible();
    });
    await media.step('03-check', '真实点击Check / Actually click Check', async () => {
      const before = await status.getAttribute('data-last-checked-at');
      await getByAutomationId(page, AUTOMATION_IDS.settings.updates.check).click();
      await expect.poll(async () => {
        const next = await status.getAttribute('data-last-checked-at');
        return next !== null && next !== before;
      }, { timeout: 60_000 }).toBe(true);
    });
    await media.step('04-result', '核对这次检查的实际终态 / Inspect the actual terminal result of this check', async () => {
      await expect(status).not.toHaveAttribute('data-state', 'checking');
      terminalState = await status.getAttribute('data-state') ?? '';
      lastCheckedAt = await status.getAttribute('data-last-checked-at') ?? '';
      expect(['failed', 'up-to-date', 'available']).toContain(terminalState);
      expect(lastCheckedAt.length).toBeGreaterThan(0);
    });
    // 证据：failed只表示检查请求失败，不冒充有新版本、下载成功或安装完成。
    // Evidence: failed means the check failed, never a new version, a successful download or an installation.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      source: 'The actual Release update source zhxmt-xm/Interceptor, without injected credentials',
      checkResult: terminalState, lastCheckedAt, downloaded: 'false', installerOpened: 'false',
      boundary: 'Only the actual Check action/result is recorded; download and native installation require their own conditions',
    });
  }
  // 清理：未执行安装或更换App，正常Close验证进程、代理、CA与8888恢复。
  // Cleanup: no installation or App replacement; normal Close verifies processes, proxy/CA and port 8888.
});
