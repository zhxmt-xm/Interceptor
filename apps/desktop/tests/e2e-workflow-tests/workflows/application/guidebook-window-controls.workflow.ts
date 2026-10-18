import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { MacosWorkflowHostSafetyOperations } from '../../fixtures/safety/macos-workflow-host-safety-operations';

const execute = promisify(execFile);

test('workspace guide records actual maximize restore and minimize without capturing the desktop', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const initialLanguage = await page.locator('html').getAttribute('lang');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  if (!initialLanguage || !initialTheme) throw new Error('The ready App omitted its language or theme.');
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const availableSize = await page.evaluate(() => ({ width: screen.availWidth, height: screen.availHeight }));
  const owner = desktopApp.nativeFileDialogOwner();
  const maximize = getByAutomationId(page, AUTOMATION_IDS.shell.window.maximizeRestore);
  const minimize = getByAutomationId(page, AUTOMATION_IDS.shell.window.minimize);
  const checkpoints: Array<{
    step: string;
    minimized: boolean;
    visible: boolean;
    width: number;
    height: number;
  }> = [];
  const nativeWindow = async (restore = false) => {
    expect(await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId)).toEqual(owner);
    const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application("System Events");
const owned = events.applicationProcesses.whose({ unixId: ${owner.processId} })()[0];
if (!owned) throw new Error("Owned App is unavailable");
function attribute(element, name) {
  const values = element.attributes.whose({ name })();
  return values.length ? values[0].value() : null;
}
const windows = owned.windows().filter(window => attribute(window, "AXIdentifier") !== "save-panel"
  && attribute(window, "AXIdentifier") !== "open-panel");
if (windows.length !== 1) throw new Error("Expected one owned main window");
const window = windows[0];
if (${restore}) {
  const minimized = window.attributes.whose({ name: "AXMinimized" })()[0];
  if (minimized) minimized.value = false;
  owned.frontmost = true;
}
const size = window.size();
JSON.stringify({ width: size[0], height: size[1], minimized: attribute(window, "AXMinimized") === true,
  visible: owned.visible() && attribute(window, "AXMinimized") !== true });
`], { encoding: 'utf8', timeout: 10_000 });
    const state: unknown = JSON.parse(stdout);
    if (typeof state !== 'object' || state === null
      || !('width' in state) || typeof state.width !== 'number'
      || !('height' in state) || typeof state.height !== 'number'
      || !('minimized' in state) || typeof state.minimized !== 'boolean'
      || !('visible' in state) || typeof state.visible !== 'boolean') {
      throw new Error('Native window state is invalid.');
    }
    return { width: state.width, height: state.height, minimized: state.minimized, visible: state.visible };
  };
  const checkpoint = async (step: string): Promise<void> => {
    checkpoints.push({ step, ...await nativeWindow() });
  };
  let media: GuidebookMedia | undefined;
  let needsRestore = false;
  let zoomedByTest = false;

  // 准备：只录本轮Settings窗口，不让默认Capture背景流量或桌面进入镜头。
  // Arrange: record only this App's Settings window, excluding default Capture traffic and the desktop.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
  expect(await nativeWindow()).toMatchObject({ ...originalSize, minimized: false, visible: true });
  try {
    media = await GuidebookMedia.start(desktopApp, testInfo, 'workspace-window-controls');

    // 用户操作：最大化和恢复均真实点击产品按钮，并读取原生窗口状态。
    // User actions: click the actual product Maximize and Restore controls and read native window state.
    await media.step('01-normal', '查看当前正常窗口 / Inspect the current normal window', async () => {
      await expect(maximize).toBeVisible();
      await expect(minimize).toBeVisible();
      await checkpoint('normal');
    });
    await media.step('02-maximize', '点击最大化 / Click Maximize', async () => {
      await maximize.click();
      zoomedByTest = true;
      await expect.poll(nativeWindow).toMatchObject({ ...availableSize, minimized: false, visible: true });
      await checkpoint('maximized');
    });
    await media.step('03-restore', '再次点击恢复原窗口 / Click again to restore the window', async () => {
      await maximize.click();
      zoomedByTest = false;
      await expect.poll(nativeWindow).toMatchObject({ ...originalSize, minimized: false, visible: true });
      await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(originalSize);
      needsRestore = false;
      await checkpoint('restored-from-maximize');
    });
    await media.step('04-minimize-control', '查看最小化按钮，随后实际点击 / Inspect Minimize before actually clicking it', async () => {
      await minimize.focus();
      await expect(minimize).toBeFocused();
    });
    await minimize.click();
    needsRestore = true;
    await expect.poll(nativeWindow).toMatchObject({ minimized: true });
    await checkpoint('minimized');

    // 恢复边界：测试侧只恢复同一原生窗口，不把它说成已录制Dock操作。
    // Restore boundary: restore only the same native window for inspection, not as recorded Dock interaction.
    await nativeWindow(true);
    await expect.poll(nativeWindow).toMatchObject({ ...originalSize, minimized: false, visible: true });
    needsRestore = false;
    await media.step('05-returned-window', '恢复后检查同一窗口（不录Dock） / Inspect the returned window without recording the Dock', async () => {
      await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(originalSize);
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy)).toHaveAttribute('aria-current', 'page');
      await checkpoint('restored-from-minimize');
    });

    // 业务断言与证据：语言、主题、窗口身份及当前设置工作区不因窗口控件被替换。
    // Assertions and evidence: window controls do not replace language, theme, window identity or the Settings workspace.
    await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage);
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    const evidence = testInfo.outputPath('window-controls.json');
    await writeFile(evidence, JSON.stringify({
      originalSize, availableSize, checkpoints,
      restoredThroughOwnedAccessibilityWindow: true,
      recordingScope: 'Workflow-owned App window only; no desktop or Dock footage',
      minimizeImage: 'The control is shown before the actual click; minimized state is separately read and verified',
    }, null, 2), 'utf8');
    await testInfo.attach('window-controls.json', { path: evidence, contentType: 'application/json' });
  } finally {
    // 清理：先恢复本轮窗口，再正常停止录像；App退出与宿主恢复由原driver验证。
    // Cleanup: restore the owned window before stopping recording; the existing driver verifies App shutdown and host restoration.
    try {
      if (needsRestore) await nativeWindow(true);
      if (zoomedByTest) await maximize.click();
    } finally {
      if (media) await media.stop({
        workspace: 'Settings > Privacy',
        initialSize: `${originalSize.width}x${originalSize.height}`,
        maximize: 'Actual product Maximize and Restore clicks',
        minimize: 'Actual product Minimize click; the button image precedes the click',
        restoreBoundary: 'Test-side accessibility restores the same owned window for continued verification; no Dock interaction is claimed',
        recordingScope: 'Only the App window; no display, desktop or other application capture',
      });
    }
  }
});
