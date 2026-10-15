import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('workspace guide records navigation, layout and theme controls while preserving language', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  // 准备：只展示自产范围，保留现有语言并记录原主题。
  // Arrange: restrict traffic visibility, preserve the language and remember the original theme.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/workspace');
  const language = await page.locator('html').getAttribute('lang');
  const theme = await page.locator('html').getAttribute('data-theme');
  if (theme !== 'light' && theme !== 'dark' && theme !== 'warm' && theme !== 'ember') {
    throw new Error('The App did not expose one of its four themes.');
  }
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'workspace');
  try {
    // 用户操作：真实侧栏和主题控件，不为视频写入状态。
    // User actions: operate real sidebar and theme controls without state injection.
    await media.step('01-sidebar', '展开侧栏名称 / Expand sidebar labels', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.sidebarToggle).click();
    });
    await media.step('02-capture', '进入 Capture / Open Capture', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toBeVisible();
    });
    await media.step('03-rules', '进入 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create)).toBeVisible();
    });
    await media.step('04-composer', '进入 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.newRequest)).toBeVisible();
    });
    await media.step('05-diagnostics', '进入 Diagnostics / Open Diagnostics', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
    });
    await media.step('06-settings', '进入 Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates)).toBeVisible();
    });
    for (const value of ['warm', 'light', 'ember', 'dark'] as const) {
      await media.step(`07-theme-${value}`, `选择 ${value} 主题 / Select the ${value} theme`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
        await getByAutomationId(page, AUTOMATION_IDS.shell.theme[value]).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', value);
      });
    }
    await media.step('08-restore-theme', '恢复原主题 / Restore the original theme', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme[theme]).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });
    await media.step('09-language-menu', '查看语言菜单，不切换 / Inspect languages without changing the current language', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.language.en)).toBeVisible();
    });
    await page.keyboard.press('Escape');
    await media.step('10-agent-panel', '打开可选 Agent 面板 / Open the optional Agent panel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toBeVisible();
    });
    await media.step('11-close-panel', '关闭面板但不退出 App / Close the panel, not the App', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);
    });
    // 证据：主题可恢复，语言未改动，导航未产生测试专用后门。
    // Evidence: restore theme, retain language and avoid test-only navigation APIs.
    await expect(page.locator('html')).toHaveAttribute('lang', language ?? '');
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ initialTheme: theme, appLanguage: language ?? '', languageChanged: 'false' });
  }
  // 清理：用户Close流程与宿主恢复由既有fixture完成。
  // Cleanup: the existing fixture completes product Close and host recovery.
});
