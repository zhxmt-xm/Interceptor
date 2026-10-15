import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('workspace persistence guide proves normal Close and preserved configuration across real App generations', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const requestPath = '/guide/restart/request';
  const url = httpTrafficRunner.url(requestPath);
  let restarted: LocalElectronApplicationDriver | undefined;
  let after: GuidebookMedia | undefined;
  const language = await page.locator('html').getAttribute('lang');
  // 准备与操作：只创建本轮请求与偏好，不修改日常CA或其他profile。
  // Arrange and act: create only this profile's request and preferences without changing the shared CA.
  const before = await GuidebookMedia.start(desktopApp, testInfo, 'workspace-close');
  try {
    await before.step('01-composer', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    });
    await before.step('02-url', '保存演示 URL / Save the example URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url);
    });
    await before.step('03-name', '命名 Guide retained request / Name the retained request', async () => {
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).first();
      const value = await row.getAttribute('data-automation-id');
      if (!value?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('Missing saved request identity.');
      const id = value.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
      await row.click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(id, 'rename')).click();
      const name = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(id));
      await name.fill('Guide retained request');
      await name.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    });
    await before.step('04-privacy', '设置本profile导出偏好 / Set this profile’s export preference', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.privacy.maskCookies).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.privacy.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await before.step('05-capture', '产生临时 Capture 记录 / Produce a temporary Capture record', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/restart');
      await startRecording(desktopApp);
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)).toHaveCount(1);
    });
    await before.step('06-before-close', '确认保存后正常关闭 / Save first, then close normally', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).focus();
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.window.close)).toBeVisible();
    });
  } finally {
    await before.stop({ requestName: 'Guide retained request', url, maskCookies: 'false',
      closeImage: 'before the actual Close action; shutdown is verified by the driver' });
  }
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();

  try {
    // 用户操作：真实重开同一测试profile，不重新seed或重放先前操作。
    // User actions: reopen the same real profile without seeding or replaying previous operations.
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'reopened',
    });
    await restarted.waitUntilReady();
    const current = restarted.page;
    after = await GuidebookMedia.start(restarted, testInfo, 'workspace-restart');
    await after.step('01-collection', '重开后找到已保存请求 / Find the saved request after reopening', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.composer).click();
      const row = getByAutomationIdPrefix(current, AUTOMATION_ID_PREFIXES.composerCollectionRequest)
        .filter({ hasText: 'Guide retained request' });
      await expect(row).toBeVisible();
      await row.click();
      const address = new URL(url);
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.url)).toHaveValue(`${address.host}${address.pathname}`);
    });
    await after.step('02-privacy', '确认偏好持久化 / Verify the persisted preference', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(current, AUTOMATION_IDS.settings.section.privacy).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.settings.privacy.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await after.step('03-restore-privacy', '恢复遮罩默认值 / Restore the masking default', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.settings.privacy.maskCookies).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.settings.privacy.maskCookies)).toHaveAttribute('aria-checked', 'true');
    });
    await after.step('04-temporary-capture', '确认旧 Capture 不会保留 / Verify old Capture records are temporary', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(current, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/restart');
      await expect(getByAutomationIdPrefix(current, AUTOMATION_ID_PREFIXES.captureRequestRow)).toHaveCount(0);
    });
    await after.step('05-language', '确认语言没有被录制修改 / Confirm recording did not change language', async () => {
      await expect(current.locator('html')).toHaveAttribute('lang', language ?? '');
    });
    // 证据：Collection/偏好持久化与Capture临时性分别核对。
    // Evidence: verify persistent Collection/preferences separately from temporary Capture.
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (after) await after.stop({ requestName: 'Guide retained request', url,
        persisted: 'Collection and privacy preference', temporary: 'Capture records', appLanguage: language ?? '' });
    } finally {
      if (restarted) {
        await restarted.captureFinalScreenshot(testInfo);
        await restarted.stopTrace(testInfo);
        await restarted.closeGracefully();
        await restarted.writeEvidence(testInfo);
        await restarted.forceCleanup();
      }
    }
  }
  // 清理：外层fixture核对两代进程、listener、系统代理及共享CA恢复。
  // Cleanup: the outer fixture verifies both generations, listeners, proxy and shared CA restoration.
});
