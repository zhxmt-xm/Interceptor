import { writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { resources } from '../../../../src/renderer/i18n/resources';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** The 15 language buttons exposed by the real Sidebar Language menu. */
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

/** Every shipped language, in the order the Language menu renders it. */
const LANGUAGE_IDS = Object.keys(resources) as ReadonlyArray<keyof typeof resources>;

/** Shell controls whose visible text must fit its own box in every language. */
const SHELL_TEXT_CONTROLS: readonly AutomationId[] = [
  AUTOMATION_IDS.app.headerTitle,
  AUTOMATION_IDS.shell.workspace.capture,
  AUTOMATION_IDS.shell.workspace.rules,
  AUTOMATION_IDS.shell.workspace.composer,
  AUTOMATION_IDS.shell.workspace.diagnostics,
  AUTOMATION_IDS.shell.workspace.guidebook,
  AUTOMATION_IDS.shell.workspace.settings,
  AUTOMATION_IDS.shell.language.trigger,
  AUTOMATION_IDS.shell.theme.trigger,
  AUTOMATION_IDS.capture.recordingToggle,
];

/** Read one shipped translation without depending on a language catalog type. */
function message(language: string, key: string): string {
  const catalog = (resources as unknown as Record<string, {
    translation: Record<string, string>;
  }>)[language];
  const value = catalog?.translation[key];
  if (typeof value !== 'string') {
    throw new Error(`Missing ${key} in the ${language} catalog.`);
  }
  return value;
}

/** Prove one language is applied across the shell, Listbar and current page. */
async function expectLanguageApplied(page: Page, language: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.headerTitle))
    .toHaveText(message(language, 'sidebar.capture'));
  for (const [key, automationId] of [
    ['sidebar.capture', AUTOMATION_IDS.shell.workspace.capture],
    ['sidebar.rulesMap', AUTOMATION_IDS.shell.workspace.rules],
    ['sidebar.composer', AUTOMATION_IDS.shell.workspace.composer],
    ['sidebar.diagnostics', AUTOMATION_IDS.shell.workspace.diagnostics],
    ['guidebook.title', AUTOMATION_IDS.shell.workspace.guidebook],
    ['sidebar.settings', AUTOMATION_IDS.shell.workspace.settings],
    ['common.language', AUTOMATION_IDS.shell.language.trigger],
    ['common.theme', AUTOMATION_IDS.shell.theme.trigger],
  ] as const) {
    await expect(getByAutomationId(page, automationId)).toContainText(message(language, key));
  }
  const navigation = getByAutomationId(page, AUTOMATION_IDS.shell.navigation);
  await expect(navigation).toContainText(message(language, 'sidebar.workspace'));
  await expect(navigation).toContainText(message(language, 'sidebar.session'));
  await expect(navigation).toContainText(message(language, 'sidebar.localTraffic'));
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const recordingKey = await recording.getAttribute('aria-pressed') === 'true'
    ? 'capture.recording'
    : 'capture.paused';
  await expect(recording).toContainText(message(language, recordingKey));
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter))
    .toHaveAttribute('placeholder', message(language, 'capture.filterRequests'));

  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow, `${language}: the App page overflows`).toEqual({ horizontal: 0, vertical: 0 });
  for (const automationId of SHELL_TEXT_CONTROLS) {
    const control = getByAutomationId(page, automationId);
    await expect(control, `${language}: ${automationId} is not visible`).toBeVisible();
    const clipped = await control.evaluate((node) => node.clientWidth > 0
      && node.scrollWidth > node.clientWidth + 1);
    expect(clipped, `${language}: ${automationId} clips its text`).toBe(false);
  }
}

test('shell.appearance.language applies all 15 languages and restores the last one after restart', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'shell.appearance.language',
  });

  const { page } = desktopApp;
  const initialLanguage = await page.locator('html').getAttribute('lang');
  if (!initialLanguage || !LANGUAGE_BUTTONS[initialLanguage]) {
    throw new Error('The ready App omitted a supported initial language.');
  }
  const evidence: Array<{ language: string; lang: string; header: string }> = [];
  let restartedApp: LocalElectronApplicationDriver | null = null;
  let restartedClosed = false;
  let workflowError: unknown;
  let cleanupError: unknown;

  try {
    // 准备：首次启动语言来自系统语言匹配；展开Sidebar让所有受检文案真实可见。
    // Arrange: the first-run language follows the system match; expand the Sidebar so every checked label is visible.
    if (await getByAutomationId(page, AUTOMATION_IDS.app.root).getAttribute('data-collapsed') === 'true') {
      await getByAutomationId(page, AUTOMATION_IDS.shell.sidebarToggle).click();
    }
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.root))
      .toHaveAttribute('data-collapsed', 'false');
    await screenshotStep(`初始语言${initialLanguage}，Sidebar已展开 / Initial language ${initialLanguage} with the Sidebar expanded`);

    // 用户操作：通过真实Language菜单逐个切换15种语言并逐项核对文案与布局。
    // User actions: switch all 15 languages through the real Language menu and verify copy and layout.
    for (const language of LANGUAGE_IDS) {
      await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
      await getByAutomationId(page, LANGUAGE_BUTTONS[language]!).click();
      await expectLanguageApplied(page, language);
      evidence.push({
        language,
        lang: language,
        header: message(language, 'sidebar.capture'),
      });
      await screenshotStep(`切换到${language}并检查布局 / Switch to ${language} and inspect the layout`);
    }
    const lastLanguage = LANGUAGE_IDS.at(-1)!;
    expect(await page.locator('html').getAttribute('lang')).toBe(lastLanguage);

    // 证据与重启：正常关闭第一代，保留profile，在同一profile启动第二代。
    // Evidence and restart: close the first generation normally, keep its profile and start a second generation from it.
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await screenshotStep(`保留最后语言${lastLanguage} / Retain the last language ${lastLanguage}`);
    restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'restarted',
    });
    await restartedApp.waitUntilReady();
    const restartedPage = restartedApp.page;

    // 业务断言：保存的语言在重启后立即生效，Shell文案与`html[lang]`一致。
    // Assert: the saved language applies after restart and the Shell copy matches `html[lang]`.
    await expect(restartedPage.locator('html')).toHaveAttribute('lang', lastLanguage);
    await expect(getByAutomationId(restartedPage, AUTOMATION_IDS.app.headerTitle))
      .toHaveText(message(lastLanguage, 'sidebar.capture'));
    await expect(getByAutomationId(restartedPage, AUTOMATION_IDS.shell.workspace.capture))
      .toContainText(message(lastLanguage, 'sidebar.capture'));
    expect(restartedApp.userDataDirectory).toBe(desktopApp.userDataDirectory);
    expect(restartedApp.rendererPageErrors()).toEqual([]);
    await screenshotStep(`重启后恢复${lastLanguage} / Restore ${lastLanguage} after restart`);

    const evidencePath = testInfo.outputPath('language-matrix.json');
    await writeFile(evidencePath, JSON.stringify({
      initialLanguage,
      lastLanguage,
      languages: evidence,
    }, null, 2), 'utf8');
    await testInfo.attach('language-matrix.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    if (restartedApp) {
      try {
        if (!restartedClosed) {
          await restartedApp.captureFinalScreenshot(testInfo);
          await restartedApp.stopTrace(testInfo);
          await restartedApp.closeGracefully();
          restartedClosed = true;
          await restartedApp.writeEvidence(testInfo);
        }
      } catch (error) {
        cleanupError = error;
        await restartedApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Language matrix and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
