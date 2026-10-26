import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';
import semver from 'semver';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

async function verifyAnonymousUpdateCheck(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  generation: string,
): Promise<{ generation: string; supported: boolean; state: string | null; currentVersion: string | null; latestVersion: string | null; lastCheckedAt: string | null }> {
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
  await screenshotStep(`打开更新设置 / Open update settings (${generation})`);
  if (supported) {
    await expect(updateStatus).toHaveAttribute('data-state', /^(up-to-date|available|failed)$/, { timeout: 90_000 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await updateStatus.getAttribute('data-state') === 'available') break;
      const lastCheckedAt = await updateStatus.getAttribute('data-last-checked-at');
      const check = getByAutomationId(page, AUTOMATION_IDS.settings.updates.check);
      await expect(check).toBeEnabled();
      await screenshotStep(`检查当前版本并手动Check now / Inspect the current version before Check now (${generation}, ${attempt + 1})`, {
        highlights: [{ target: check, label: '1' }],
      });
      await check.click();
      await expect.poll(() => updateStatus.getAttribute('data-last-checked-at'))
        .not.toBe(lastCheckedAt);
      await expect(updateStatus).toHaveAttribute('data-state', /^(up-to-date|available|failed)$/, { timeout: 90_000 });
      if (await updateStatus.getAttribute('data-state') !== 'available') await expect(check).toBeEnabled();
      await screenshotStep(`核对实际版本与检查结果 / Verify versions and the update check result (${generation}, ${attempt + 1})`);
    }
    const state = await updateStatus.getAttribute('data-state');
    const currentVersion = await updateStatus.getAttribute('data-current-version');
    const latestVersion = await updateStatus.getAttribute('data-latest-version');
    expect(semver.valid(currentVersion)).not.toBeNull();
    if (state === 'available' || state === 'up-to-date') {
      expect(semver.valid(latestVersion)).not.toBeNull();
      expect(semver.gt(latestVersion!, currentVersion!)).toBe(state === 'available');
    }
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.download))
      .toHaveCount(state === 'available' ? 1 : 0);
    if (state === 'available') await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.check)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.openInstaller)).toHaveCount(0);
  } else {
    await expect(updateStatus).toHaveAttribute('data-state', 'unsupported');
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.check)).toHaveCount(0);
    await screenshotStep(`未打包App明确显示不支持更新 / Unpackaged App reports unsupported updates (${generation})`);
  }
  await page.screenshot({ path: testInfo.outputPath(`${generation}-updates-final.png`) });
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  return {
    generation,
    supported,
    state: await updateStatus.getAttribute('data-state'),
    currentVersion: await updateStatus.getAttribute('data-current-version'),
    latestVersion: await updateStatus.getAttribute('data-latest-version'),
    lastCheckedAt: await updateStatus.getAttribute('data-last-checked-at'),
  };
}

test('settings.updates.check compares published versions and checks without signing in', async ({
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

    // 业务断言：重启后仍按真实版本与终态检查，未打包目标明确保持 unsupported。
    // Assert: real version comparisons and terminal states survive restart; unpackaged builds remain unsupported.
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
