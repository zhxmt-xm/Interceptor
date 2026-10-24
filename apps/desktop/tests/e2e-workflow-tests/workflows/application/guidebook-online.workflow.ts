import { writeFile } from 'node:fs/promises';
import type { Frame, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';

const GUIDEBOOK_ORIGIN = 'https://www.interceptor.cn';

const THEME_BUTTONS: Readonly<Record<string, AutomationId>> = {
  warm: AUTOMATION_IDS.shell.theme.warm,
  light: AUTOMATION_IDS.shell.theme.light,
  ember: AUTOMATION_IDS.shell.theme.ember,
  dark: AUTOMATION_IDS.shell.theme.dark,
};

interface GuidebookEvidence {
  initialLanguage: string;
  initialTheme: string;
  initialFrameUrl: string;
  searchResultUrl: string;
  imagePreviewOpened: boolean;
  synchronizedTheme: string;
  restoredFrameUrl: string;
  refreshedFrameUrl: string;
  browserPagesBefore: number;
  browserPagesAfter: number;
  sandbox: string | null;
  referrerPolicy: string | null;
  preloadExposedToFrame: boolean;
}

function guidebookLocator(frame: Frame, automationId: string) {
  return frame.locator(`[data-automation-id="${automationId}"]`);
}

function expectedGuidebookLocale(language: string): 'zh-CN' | 'en' {
  return language === 'zh-CN' ? 'zh-CN' : 'en';
}

async function waitForGuidebookFrame(page: Page, language: string): Promise<Frame> {
  let guidebookFrame: Frame | undefined;
  const expectedPath = language === 'zh-CN' ? '/guide' : '/en/guide';
  await expect.poll(() => {
    guidebookFrame = page.frames().find((frame) => {
      if (!frame.url().startsWith(GUIDEBOOK_ORIGIN)) return false;
      const url = new URL(frame.url());
      return url.origin === GUIDEBOOK_ORIGIN
        && (url.pathname === expectedPath || url.pathname.startsWith(`${expectedPath}/`))
        && url.searchParams.get('embed') === 'desktop';
    });
    return guidebookFrame?.url() ?? '';
  }, {
    message: `The embedded Guidebook did not load ${expectedPath}.`,
    timeout: 30_000,
  }).toContain(`${expectedPath}`);
  return guidebookFrame!;
}

async function selectShellPreference(
  page: Page,
  trigger: AutomationId,
  option: AutomationId,
): Promise<void> {
  await getByAutomationId(page, trigger).click();
  await getByAutomationId(page, option).click();
}

test('shell.guidebook.online keeps remote reading inside the secure App shell', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 210_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'shell.guidebook.online',
  });

  const { page } = desktopApp;
  const appRoot = getByAutomationId(page, AUTOMATION_IDS.app.root);
  const frameElement = getByAutomationId(page, AUTOMATION_IDS.guidebook.frame);
  const initialLanguage = await page.locator('html').getAttribute('lang');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  if (!initialLanguage) {
    throw new Error(`Unsupported initial App language: ${initialLanguage ?? '<missing>'}`);
  }
  if (!initialTheme || !THEME_BUTTONS[initialTheme]) {
    throw new Error(`Unsupported initial App theme: ${initialTheme ?? '<missing>'}`);
  }

  // 准备：fresh profile完成真实启动与readiness取消，从Sidebar进入在线Guidebook。
  // Arrange: finish real fresh-profile startup and readiness cancellation, then enter the online Guidebook from the Sidebar.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.guidebook).click();
  await expect(appRoot).toHaveAttribute('data-view', 'guidebook');
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.guidebook))
    .toHaveAttribute('aria-current', 'page');
  await expect(getByAutomationId(page, AUTOMATION_IDS.guidebook.root))
    .toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  let guidebookFrame = await waitForGuidebookFrame(page, initialLanguage);
  const evidence: GuidebookEvidence = {
    initialLanguage,
    initialTheme,
    initialFrameUrl: guidebookFrame.url(),
    searchResultUrl: '',
    imagePreviewOpened: false,
    synchronizedTheme: '',
    restoredFrameUrl: '',
    refreshedFrameUrl: '',
    browserPagesBefore: 0,
    browserPagesAfter: 0,
    sandbox: await frameElement.getAttribute('sandbox'),
    referrerPolicy: await frameElement.getAttribute('referrerpolicy'),
    preloadExposedToFrame: await guidebookFrame.evaluate(() => 'interceptor' in window),
  };
  expect(evidence.sandbox).toBe('allow-same-origin allow-scripts');
  expect(evidence.referrerPolicy).toBe('no-referrer');
  expect(evidence.preloadExposedToFrame).toBe(false);
  await expect(guidebookFrame.locator('header')).toHaveCount(0);
  await expect(guidebookFrame.locator('footer')).toHaveCount(0);
  await expect(guidebookLocator(guidebookFrame, 'guide.root')).toBeVisible();
  await expect(guidebookLocator(guidebookFrame, 'guide.chapters')).toBeVisible();
  await expect(guidebookLocator(guidebookFrame, 'guide.article')).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.guidebook.status)).toBeVisible();
  await screenshotStep('进入在线Guidebook并核对安全frame与App外壳 / Open the online Guidebook and verify the secure frame and App shell.');

  // 用户操作：通过App工具栏打开官网既有搜索，使用本轮查询导航到真实结果。
  // User action: open the website search from the App toolbar and navigate with this run's query.
  await getByAutomationId(page, AUTOMATION_IDS.guidebook.search).click();
  const searchDialog = guidebookLocator(guidebookFrame, 'guide.search.dialog');
  const searchInput = guidebookLocator(guidebookFrame, 'guide.search.input');
  await expect(searchDialog).toBeVisible();
  await expect(searchInput).toBeFocused();
  await searchInput.fill(expectedGuidebookLocale(initialLanguage) === 'zh-CN' ? '证书' : 'certificate');
  const searchResults = guidebookLocator(guidebookFrame, 'guide.search.result');
  await expect(searchResults.first()).toBeVisible();
  await searchResults.first().click();
  await expect(searchDialog).not.toBeVisible();
  await expect.poll(() => guidebookFrame.url()).toContain('embed=desktop');
  evidence.searchResultUrl = guidebookFrame.url();
  expect(new URL(evidence.searchResultUrl).origin).toBe(GUIDEBOOK_ORIGIN);
  await screenshotStep('使用App工具栏搜索并打开真实教程结果 / Search from the App toolbar and open a real Guidebook result.');

  // 用户操作：进入Capture章节，通过官网控件打开并关闭真实步骤图。
  // User action: enter the Capture chapter and open then close a real step image with website controls.
  await guidebookLocator(guidebookFrame, 'guide.chapter.capture').click();
  await expect.poll(() => new URL(guidebookFrame.url()).pathname).toMatch(/\/guide\/capture$/);
  await expect(guidebookLocator(guidebookFrame, 'guide.outline')).toBeVisible();
  const articleImage = guidebookLocator(guidebookFrame, 'guide.article').locator('img').first();
  await articleImage.scrollIntoViewIfNeeded();
  await articleImage.evaluate((element: HTMLImageElement) => element.decode());
  await articleImage.locator('..').click();
  await expect(guidebookFrame.getByRole('dialog')).toBeVisible();
  await expect(guidebookLocator(guidebookFrame, 'image.preview.image')).toBeVisible();
  evidence.imagePreviewOpened = true;
  await page.keyboard.press('Escape');
  await expect(guidebookFrame.getByRole('dialog')).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.statusbar)).toBeVisible();
  await screenshotStep('打开并关闭真实教程步骤图，App外壳保持可见 / Open and close a real Guidebook image while the App shell stays visible.');

  // 主题同步：保持初始App语言，真实切换主题并核对远程frame。
  // Theme sync: keep the initial App language, switch the real theme and verify the remote frame.
  const synchronizedTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await selectShellPreference(
    page,
    AUTOMATION_IDS.shell.theme.trigger,
    THEME_BUTTONS[synchronizedTheme]!,
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', synchronizedTheme);
  await expect(guidebookFrame.locator('html')).toHaveAttribute('data-theme', synchronizedTheme);
  evidence.synchronizedTheme = synchronizedTheme;

  await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage);
  await screenshotStep('保持App语言并核对远程Guidebook主题同步 / Keep the App language and verify remote Guidebook theme synchronization.');

  // 恢复：回到初始主题，再通过Refresh验证新frame代际重新加载固定入口。
  // Restore: return to the initial theme, then use Refresh to reload the fixed entry in a new frame generation.
  await selectShellPreference(
    page,
    AUTOMATION_IDS.shell.theme.trigger,
    THEME_BUTTONS[initialTheme]!,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage);
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
  guidebookFrame = await waitForGuidebookFrame(page, initialLanguage);
  await expect(guidebookFrame.locator('html')).toHaveAttribute('data-theme', initialTheme);
  evidence.restoredFrameUrl = guidebookFrame.url();

  const previousFrameElement = await frameElement.elementHandle();
  const loading = getByAutomationId(page, AUTOMATION_IDS.guidebook.loading);
  const loadingVisible = loading.waitFor({ state: 'visible', timeout: 15_000 });
  await getByAutomationId(page, AUTOMATION_IDS.guidebook.refresh).click();
  await loadingVisible;
  await expect.poll(async () => previousFrameElement === null
    || await previousFrameElement.evaluate((element) => !element.isConnected).catch(() => true))
    .toBe(true);
  await expect(getByAutomationId(page, AUTOMATION_IDS.guidebook.root))
    .toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  guidebookFrame = await waitForGuidebookFrame(page, initialLanguage);
  evidence.refreshedFrameUrl = guidebookFrame.url();
  await screenshotStep('刷新固定Guidebook入口并等待新frame恢复Ready / Refresh the fixed Guidebook entry and wait for the new frame to return to Ready.');

  // 浏览器出口与证据：点击固定外部入口，不产生Electron新窗口或Renderer错误。
  // Browser exit and evidence: open the fixed external entry without creating an Electron window or Renderer error.
  evidence.browserPagesBefore = desktopApp.context.pages().length;
  await getByAutomationId(page, AUTOMATION_IDS.guidebook.openBrowser).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.guidebook.root).getByRole('alert'))
    .toHaveCount(0);
  evidence.browserPagesAfter = desktopApp.context.pages().length;
  expect(evidence.browserPagesAfter).toBe(evidence.browserPagesBefore);
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  const evidencePath = testInfo.outputPath('guidebook-online.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('guidebook-online.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
  await screenshotStep('保留Guidebook终态与固定浏览器出口证据 / Preserve the Guidebook final state and fixed browser-exit evidence.');
});
