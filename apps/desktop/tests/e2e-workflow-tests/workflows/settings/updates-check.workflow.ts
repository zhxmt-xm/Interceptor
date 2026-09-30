import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';

async function verifyAnonymousUpdateCheck(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  generation: string,
): Promise<{ generation: string; supported: boolean; state: string | null; lastCheckedAt: string | null }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.updates).click();
  await page.screenshot({ path: testInfo.outputPath(`${generation}-updates.png`) });
  await expect(page.locator([
    '[data-automation-id^="settings.updates.github-"]',
    '[data-automation-id="settings.updates.device-code"]',
    '[data-automation-id="settings.updates.open-github"]',
  ].join(', '))).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.interceptor)
    .filter((key) => /github/i.test(key)))).toEqual([]);

  const updateStatus = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  await expect(updateStatus).toBeVisible();
  const supported = await updateStatus.getAttribute('data-supported') === 'true';
  if (supported) {
    await expect(updateStatus).toHaveAttribute('data-state', 'failed', { timeout: 90_000 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lastCheckedAt = await updateStatus.getAttribute('data-last-checked-at');
      const check = getByAutomationId(page, AUTOMATION_IDS.settings.updates.check);
      await expect(check).toBeEnabled();
      await check.click();
      await expect.poll(() => updateStatus.getAttribute('data-last-checked-at'))
        .not.toBe(lastCheckedAt);
      await expect(updateStatus).toHaveAttribute('data-state', 'failed', { timeout: 90_000 });
      await expect(check).toBeEnabled();
    }
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.download)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.openInstaller)).toHaveCount(0);
  } else {
    await expect(updateStatus).toHaveAttribute('data-state', 'unsupported');
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.check)).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath(`${generation}-updates-final.png`) });
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  return {
    generation,
    supported,
    state: await updateStatus.getAttribute('data-state'),
    lastCheckedAt: await updateStatus.getAttribute('data-last-checked-at'),
  };
}

test('settings.updates.check reports unavailable releases and retries without signing in', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.updates.check' });

  // 准备与用户操作：真实 App 已就绪，通过正式 Settings 入口匿名检查，不改写远端响应或产品状态。
  // Arrange and act: the real App is ready; check through Settings without replacing responses or product state.
  const evidence = [await verifyAnonymousUpdateCheck(desktopApp, testInfo, 'initial')];

  // 重启：正式退出第一代，在同一 profile 启动第二代，不保存或注入账号凭据。
  // Restart: close the first generation normally and reuse its profile without seeding account credentials.
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory,
    evidencePrefix: 'restarted',
  });
  try {
    await restartedApp.waitUntilReady();

    // 业务断言：重启后仍可匿名检查和失败重试，未打包目标明确保持 unsupported。
    // Assert: anonymous checks and failure retries survive restart; unpackaged builds remain unsupported.
    evidence.push(await verifyAnonymousUpdateCheck(restartedApp, testInfo, 'restarted'));
    expect(evidence[1]?.supported).toBe(evidence[0]?.supported);

    // 证据：保留真实终态与两代截图，不将失败分支记录为下载或打开安装器成功。
    // Evidence: retain actual states and both generations without claiming download or installer success.
    const evidencePath = testInfo.outputPath('updates-check.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('updates-check.json', { path: evidencePath, contentType: 'application/json' });
  } finally {
    // 清理：第二代正常退出；现有 host guard 复核代理、CA、Main/Core/Worker 与 8888。
    // Cleanup: close the second generation; the host guard verifies proxy, CA, processes, and port 8888.
    await restartedApp.stopTrace(testInfo);
    try {
      await restartedApp.closeGracefully();
    } finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});