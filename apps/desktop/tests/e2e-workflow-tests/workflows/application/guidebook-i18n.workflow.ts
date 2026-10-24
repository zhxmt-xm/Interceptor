import { writeFile } from 'node:fs/promises';
import type { Frame, Page } from '@playwright/test';

import { AUTOMATION_IDS, type AutomationId } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';

const GUIDEBOOK_ORIGIN = 'https://www.interceptor.cn';
const LANGUAGE_BUTTONS: Readonly<Record<string, AutomationId>> = {
  en: AUTOMATION_IDS.shell.language.en,
  'zh-CN': AUTOMATION_IDS.shell.language.zhCN,
  'zh-TW': AUTOMATION_IDS.shell.language.zhTW,
  ja: AUTOMATION_IDS.shell.language.ja,
  ko: AUTOMATION_IDS.shell.language.ko,
  de: AUTOMATION_IDS.shell.language.de,
  fr: AUTOMATION_IDS.shell.language.fr,
  es: AUTOMATION_IDS.shell.language.es,
  it: AUTOMATION_IDS.shell.language.it,
  'pt-BR': AUTOMATION_IDS.shell.language.ptBR,
  ru: AUTOMATION_IDS.shell.language.ru,
  nl: AUTOMATION_IDS.shell.language.nl,
  pl: AUTOMATION_IDS.shell.language.pl,
  tr: AUTOMATION_IDS.shell.language.tr,
  uk: AUTOMATION_IDS.shell.language.uk,
};

async function waitForGuidebookLocale(page: Page, language: string, theme: string): Promise<Frame> {
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en';
  const expectedPath = locale === 'zh-CN' ? '/guide' : '/en/guide';
  let guidebookFrame: Frame | undefined;
  await expect(getByAutomationId(page, AUTOMATION_IDS.guidebook.root))
    .toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect.poll(() => {
    guidebookFrame = page.frames().find(frame => {
      if (!frame.url().startsWith(GUIDEBOOK_ORIGIN)) return false;
      const url = new URL(frame.url());
      return url.origin === GUIDEBOOK_ORIGIN && url.pathname === expectedPath
        && url.searchParams.get('embed') === 'desktop';
    });
    return guidebookFrame?.url() ?? '';
  }, { timeout: 30_000 }).toContain(expectedPath);
  if (!guidebookFrame) throw new Error(`Missing Guidebook frame for ${language}.`);
  await expect(guidebookFrame.locator('[data-automation-id="guide.root"]'))
    .toBeVisible({ timeout: 30_000 });
  await expect(guidebookFrame.locator('[data-automation-id="guide.article"]'))
    .toHaveAttribute('lang', locale);
  await expect(guidebookFrame.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await guidebookFrame.evaluate(() => 'interceptor' in window)).toBe(false);
  return guidebookFrame;
}

async function selectAppLanguage(page: Page, language: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
  await getByAutomationId(page, LANGUAGE_BUTTONS[language]!).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

test('shell.guidebook.i18n synchronizes and restores the App language through the real UI', async ({
  desktopApp,
}, testInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'shell.guidebook.i18n' });
  const { page } = desktopApp;

  // 准备：独立fresh profile完成真实启动，保留初始语言和主题并打开Guidebook。
  // Arrange: finish real startup in an independent fresh profile, keep initial preferences and open the Guidebook.
  const initialLanguage = await page.locator('html').getAttribute('lang');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  if (!initialLanguage || !LANGUAGE_BUTTONS[initialLanguage] || !initialTheme) {
    throw new Error('The initial App language or theme is unavailable.');
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.guidebook).click();
  let guidebookFrame = await waitForGuidebookLocale(page, initialLanguage, initialTheme);
  const initialFrameUrl = guidebookFrame.url();
  await screenshotStep('保留初始语言和Guidebook入口 / Preserve the initial language and Guidebook entry.');

  // 用户操作：仅在本i18n workflow切换语言，核对官网入口和正文locale。
  // User action: switch language only in this i18n workflow and verify the website entry and article locale.
  const synchronizedLanguage = initialLanguage === 'zh-CN' ? 'en' : 'zh-CN';
  await selectAppLanguage(page, synchronizedLanguage);
  guidebookFrame = await waitForGuidebookLocale(page, synchronizedLanguage, initialTheme);
  const synchronizedFrameUrl = guidebookFrame.url();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
  await screenshotStep('通过真实Language菜单验证教程语言同步 / Verify Guidebook language synchronization through the real Language menu.');

  // 恢复与业务断言：从同一菜单恢复初始语言，确认主题未变且frame仍隔离。
  // Restore and assert: restore the initial language through the same menu, keeping the theme and frame isolation.
  await selectAppLanguage(page, initialLanguage);
  guidebookFrame = await waitForGuidebookLocale(page, initialLanguage, initialTheme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  // 证据与清理：保存locale与URL；所属driver正常Close并验证宿主、进程和8888恢复。
  // Evidence and cleanup: save locales and URLs; the owning driver closes normally and verifies host, process and port restoration.
  const evidencePath = testInfo.outputPath('guidebook-i18n.json');
  await writeFile(evidencePath, JSON.stringify({
    initialLanguage,
    initialTheme,
    initialFrameUrl,
    synchronizedLanguage,
    synchronizedFrameUrl,
    restoredLanguage: await page.locator('html').getAttribute('lang'),
    restoredFrameUrl: guidebookFrame.url(),
  }, null, 2), 'utf8');
  await testInfo.attach('guidebook-i18n.json', { path: evidencePath, contentType: 'application/json' });
  await screenshotStep('恢复初始语言并保留独立i18n证据 / Restore the initial language and preserve independent i18n evidence.');
});
