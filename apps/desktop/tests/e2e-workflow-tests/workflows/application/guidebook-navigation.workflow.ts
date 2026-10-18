import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { MacosWorkflowHostSafetyOperations } from '../../fixtures/safety/macos-workflow-host-safety-operations';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

const execute = promisify(execFile);

test('workspace guide records retained settings, Agent navigation, window resize and Upstream deep links', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const initialLanguage = await page.locator('html').getAttribute('lang');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const owner = desktopApp.nativeFileDialogOwner();
  const privacy = getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy);
  let resized = false;
  const resize = async (width: number, height: number): Promise<void> => {
    expect(await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId)).toEqual(owner);
    await execute('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${owner.processId}
    set size of window 1 to {${width}, ${height}}
  end tell
end tell
`], { encoding: 'utf8', timeout: 5000 });
    await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height });
  };
  // 准备：隐藏非演示流量，保持原主题与语言，只调整本轮App自己的原生窗口。
  // Arrange: hide unrelated traffic, retain theme/language and resize only the owned native App window.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/navigation');
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'workspace-navigation');
  try {
    await media.step('01-settings', '打开Settings / Open Settings', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click(); });
    await media.step('02-privacy', '进入Privacy分组 / Open the Privacy section', async () => {
      await privacy.click();
      await expect(privacy).toHaveAttribute('aria-current', 'page');
    });
    await media.step('03-composer', '离开Settings进入Composer / Leave Settings for Composer', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click(); });
    await media.step('04-return-settings', '返回Settings保留Privacy / Return to Settings with Privacy retained', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await expect(privacy).toHaveAttribute('aria-current', 'page');
    });
    await media.step('05-diagnostics', '切到Diagnostics / Switch to Diagnostics', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click(); });
    await media.step('06-retained-again', '再次返回仍是Privacy / Return again to the retained Privacy section', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await expect(privacy).toHaveAttribute('aria-current', 'page');
    });
    await media.step('07-capture', '返回Capture / Return to Capture', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click(); });
    await media.step('08-agent-empty', '打开未配置的Agent面板 / Open the unconfigured Agent panel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.configure)).toBeVisible();
    });
    await media.step('09-configure-link', '从空态进入Agent设置 / Follow Configure from the empty state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.configure).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.section.agent)).toHaveAttribute('aria-current', 'page');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.models.add)).toBeVisible();
    });
    await media.step('10-agent-open', '返回Capture并保持Agent打开 / Return to Capture with Agent open', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      if (!await getByAutomationId(page, AUTOMATION_IDS.agent.panel.root).isVisible()) await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toBeVisible();
    });
    for (const workspace of ['rules', 'composer', 'diagnostics'] as const) {
      await media.step(`11-${workspace}`, `打开${workspace}仍保留Agent / Open ${workspace} while retaining Agent`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace[workspace]).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toBeVisible();
      });
    }
    await media.step('12-header-close', '用Header入口关闭Agent / Close Agent with the Header control', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);
    });
    await media.step('13-header-open', '用Header入口重新打开 / Reopen with the Header control', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toBeVisible();
    });
    await media.step('14-panel-close', '用面板自己的关闭按钮 / Use the panel’s own close button', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);
    });
    await media.step('15-theme-menu', '只打开Theme菜单检查选择 / Open Theme without changing the selection', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.theme.light)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme!);
    });
    await media.step('16-dismiss-theme', 'Escape关闭且主题不变 / Dismiss with Escape and retain the theme', async () => {
      await page.keyboard.press('Escape');
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.theme.light)).toBeHidden();
      await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme!);
    });
    await media.step('17-resize', '缩小实际App窗口 / Resize the actual App window smaller', async () => {
      resized = true;
      await resize(1280, 800);
      await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toBeVisible();
    });
    await media.step('18-restore-size', '恢复原窗口尺寸 / Restore the original window size', async () => {
      await resize(originalSize.width, originalSize.height);
      resized = false;
    });
    await media.step('19-capture', '返回Capture查看快捷入口 / Return to Capture for its shortcut', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    });
    await media.step('20-upstream-shortcut', '打开底栏上游快捷浮层 / Open the statusbar Upstream shortcut', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.trigger).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.openSettings)).toBeVisible();
    });
    await media.step('21-upstream-link', '从浮层直达Upstream设置 / Open Upstream settings from the popover', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.openSettings).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream)).toHaveAttribute('aria-current', 'page');
    });
    await media.step('22-leave-deeplink', '离开深链目标 / Leave the deep-link destination', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    });
    await media.step('23-retained-deeplink', '返回Settings保留新的Upstream位置 / Return to Settings with Upstream retained', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream)).toHaveAttribute('aria-current', 'page');
    });
    await media.step('24-recording', '回到Capture确认Recording / Return to Capture and confirm Recording', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await startRecording(desktopApp);
    });
    await media.step('25-request', '验证导航后的请求 / Verify a request after navigation', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), '/guide/navigation/ready')).statusCode).toBe(200);
    });
    // 证据：深链覆盖指定目标，普通导航保留上次分组；语言和主题均未改变。
    // Evidence: explicit deep links choose their target, ordinary navigation retains the last section, and language/theme remain unchanged.
    await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage!);
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme!);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try { if (resized) await resize(originalSize.width, originalSize.height); }
    finally {
      await media.stop({
        savedSection: 'Privacy', configureTarget: 'Settings / Agent', shortcutTarget: 'Settings / Upstream',
        originalSize: `${originalSize.width}x${originalSize.height}`, smallerSize: '1280x800',
        initialTheme: initialTheme ?? '', appLanguage: initialLanguage ?? '', languageChanged: 'false',
        requestPath: '/guide/navigation/ready',
      });
    }
  }
  // 清理：正常Close恢复代理，并核对CA、全部进程和8888。
  // Cleanup: normal Close restores proxy settings and verifies CA, all processes and port 8888.
});
