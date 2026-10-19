import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { verifyAppContainerControls } from '../../fixtures/ui/settings-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const SETTINGS_SECTION_IDS = [
  AUTOMATION_IDS.settings.section.proxy,
  AUTOMATION_IDS.settings.section.upstream,
  AUTOMATION_IDS.settings.section.appContainers,
  AUTOMATION_IDS.settings.section.tlsPassthrough,
  AUTOMATION_IDS.settings.section.certificates,
  AUTOMATION_IDS.settings.section.appearance,
  AUTOMATION_IDS.settings.section.storage,
  AUTOMATION_IDS.settings.section.privacy,
  AUTOMATION_IDS.settings.section.agent,
  AUTOMATION_IDS.settings.section.updates,
] as const;

/** 断言并记录唯一暴露为当前页面的 Settings section。 */
/** Assert and record the one Settings section exposed as the current page. */
async function expectCurrentSection(
  page: Page,
  expectedSection: AutomationId,
  evidence: Array<{ step: string; currentSections: AutomationId[] }>,
  step: string,
): Promise<void> {
  await expect(getByAutomationId(page, expectedSection)).toHaveAttribute(
    'aria-current',
    'page',
  );
  const currentSections: AutomationId[] = [];
  for (const sectionId of SETTINGS_SECTION_IDS) {
    if (await getByAutomationId(page, sectionId).getAttribute('aria-current') === 'page') {
      currentSections.push(sectionId);
    }
  }
  expect(currentSections).toEqual([expectedSection]);
  evidence.push({ step, currentSections });
}

test('settings.navigation keeps the active section across workspace navigation', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.navigation',
  });

  const { page } = desktopApp;
  const sectionEvidence: Array<{
    step: string;
    currentSections: AutomationId[];
  }> = [];
  const baselineViolations: Array<{ sectionId: string; tag: string; alignItems: string; alignSelf: string }> = [];

  // 准备：fresh profile 已通过真实 App/Core/listener readiness，普通导航进入 Settings 默认 section。
  // Arrange: a fresh profile passed real App/Core/listener readiness; normal navigation opens the default Settings section.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await expectCurrentSection(
    page,
    AUTOMATION_IDS.settings.section.certificates,
    sectionEvidence,
    'default',
  );

  const fontEvidence = await page.evaluate(async () => {
    const loaded = await document.fonts.load('550 12.5px "Inter"', 'Continue to Windows approval');
    const faces = Array.from(document.fonts).filter((face) => face.family.replaceAll('"', '').replaceAll("'", '') === 'Inter');
    const fontUrls = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules)
      .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
      .filter((rule) => rule.style.getPropertyValue('font-family').replaceAll('"', '').replaceAll("'", '') === 'Inter')
      .flatMap((rule) => Array.from(rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g),
        (match) => new URL(match[1]!, sheet.href ?? location.href).href)));
    return { fontFamily: getComputedStyle(document.body).fontFamily,
      weights: [...new Set(faces.map((face) => face.weight))].sort((left, right) => Number(left) - Number(right)),
      loadedFaces: loaded.length, allLoaded: loaded.every((face) => face.status === 'loaded'),
      fontUrls };
  });
  await writeFile(testInfo.outputPath('settings-fonts.json'), JSON.stringify(fontEvidence, null, 2), 'utf8');
  await page.screenshot({ path: testInfo.outputPath('settings-fonts.png') });
  expect(fontEvidence.weights).toEqual(['400', '450', '500', '600', '700']);
  expect(fontEvidence.loadedFaces).toBeGreaterThan(0);
  expect(fontEvidence.allLoaded).toBe(true);
  expect(fontEvidence.fontFamily.replaceAll('"', '')).toMatch(/^Inter(?:,|$)/);
  expect(fontEvidence.fontUrls.length).toBeGreaterThan(0);
  expect(fontEvidence.fontUrls.every((url) => url.startsWith('interceptor://app/'))).toBe(true);
  await screenshotStep('准备：fresh profile 已通过真实 App/Core/listener readiness，普通导航进入 Settings 默认 section。 / Arrange: a fresh profile passed real App/Core/listener readiness; normal navigation opens the default Settings section.');

  // 用户操作：逐项点击十个正式section，并要求每一步只有目标项表达current page。
  // User actions: visit all ten public sections and require exactly the target to expose the current page state.
  for (const sectionId of SETTINGS_SECTION_IDS) {
    await getByAutomationId(page, sectionId).click();
    await expectCurrentSection(page, sectionId, sectionEvidence, `select:${sectionId}`);
    if (sectionId === AUTOMATION_IDS.settings.section.upstream) {
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.currentRoute)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.mode.system)).toBeChecked();
    }
    if (sectionId === AUTOMATION_IDS.settings.section.appContainers) {
      await verifyAppContainerControls(page, testInfo);
    }
    if (sectionId === AUTOMATION_IDS.settings.section.updates) {
      const updateStatus = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
      await expect(updateStatus).toBeVisible();
      await expect(updateStatus).toHaveCSS('display', 'flex');
      await expect(updateStatus).toHaveCSS('align-items', 'center');
      await expect(page.locator('[data-automation-id^="settings.updates.github-"]')).toHaveCount(0);
      await updateStatus.screenshot({ path: testInfo.outputPath('updates-status.png') });
    }
    const violations = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(element => element.checkVisibility())
      .flatMap(element => {
        const style = getComputedStyle(element);
        return /baseline/.test(`${style.alignItems} ${style.alignSelf}`)
          ? [{ tag: element.tagName, alignItems: style.alignItems, alignSelf: style.alignSelf }]
          : [];
      }));
    baselineViolations.push(...violations.map(violation => ({ sectionId, ...violation })));
    if (violations.length > 0) await page.screenshot({ path: testInfo.outputPath(`${sectionId}-baseline.png`) });
    await screenshotStep(`打开Settings分组${sectionId.split('.').at(-1)} / Open Settings section ${sectionId.split('.').at(-1)}`);
  }

  // 布局断言：默认页面不使用baseline对齐，不以字形或矩形中心容差代替CSS规则。
  // Layout assertion: default pages do not use baseline alignment; glyph or geometry tolerance is not the CSS contract.
  await writeFile(testInfo.outputPath('settings-layout.json'), JSON.stringify({ baselineViolations }, null, 2), 'utf8');
  expect(baselineViolations).toEqual([]);

  // 键盘交互：Agent section 必须是可聚焦的原生命令，并可用 Enter 激活。
  // Keyboard interaction: the Agent section must be a focusable native command activated with Enter.
  const agentSection = getByAutomationId(page, AUTOMATION_IDS.settings.section.agent);
  await expect(agentSection).toHaveRole('button');
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await agentSection.focus();
  await page.keyboard.press('Enter');
  await expectCurrentSection(page, AUTOMATION_IDS.settings.section.agent, sectionEvidence, 'keyboard:agent');
  await screenshotStep('键盘交互：Agent section 必须是可聚焦的原生命令，并可用 Enter 激活。 / Keyboard interaction: the Agent section must be a focusable native command activated with Enter.');

  // 业务断言：从 App Containers 普通离开到 Capture 后返回，必须恢复离开前的 section。
  // Business assertion: leaving App Containers for Capture and returning normally must restore the last section.
  const appContainersSection = AUTOMATION_IDS.settings.section.appContainers;
  await getByAutomationId(page, appContainersSection).click();
  await expectCurrentSection(page, appContainersSection, sectionEvidence, 'before:capture');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.shell.workspace.capture,
  )).toHaveAttribute('aria-current', 'page');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await expectCurrentSection(page, appContainersSection, sectionEvidence, 'after:capture');
  await screenshotStep('业务断言：从 App Containers 普通离开到 Capture 后返回，必须恢复离开前的 section。 / Business assertion: leaving App Containers for Capture and returning normally must restore the last section.');

  // 业务断言：Rules、Composer、Diagnostics 的连续往返均不得重置 TLS passthrough section。
  // Business assertion: round trips through Rules, Composer, and Diagnostics must not reset TLS passthrough.
  const tlsPassthroughSection = AUTOMATION_IDS.settings.section.tlsPassthrough;
  await getByAutomationId(page, tlsPassthroughSection).click();
  for (const workspaceId of [
    AUTOMATION_IDS.shell.workspace.rules,
    AUTOMATION_IDS.shell.workspace.composer,
    AUTOMATION_IDS.shell.workspace.diagnostics,
  ] as const) {
    await getByAutomationId(page, workspaceId).click();
    await expect(getByAutomationId(page, workspaceId)).toHaveAttribute(
      'aria-current',
      'page',
    );
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await expectCurrentSection(
      page,
      tlsPassthroughSection,
      sectionEvidence,
      `after:${workspaceId}`,
    );
  }
  await screenshotStep('业务断言：Rules、Composer、Diagnostics 的连续往返均不得重置 TLS passthrough section。 / Business assertion: round trips through Rules, Composer, and Diagnostics must not reset TLS passthrough.');

  // 外观与导航：通过正式菜单切换四主题，语言只读，结束恢复原偏好。
  // Appearance and navigation: switch all four themes through their menus, inspect language and restore preferences.
  const language = await page.locator('html').getAttribute('lang');
  const themeNames = ['light', 'dark', 'warm', 'ember'] as const;
  const themeValue = await page.locator('html').getAttribute('data-theme');
  const initialTheme = themeNames.find(theme => theme === themeValue);
  if (!initialTheme || !language) throw new Error('The ready App omitted its actual theme or language.');
  const sidebar = getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture);
  const initialSidebarWidth = (await sidebar.boundingBox())?.width;
  if (initialSidebarWidth === undefined) throw new Error('The workspace navigation is not visible.');
  await getByAutomationId(page, AUTOMATION_IDS.shell.sidebarToggle).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).not.toBe(initialSidebarWidth);
  await screenshotStep('展开或收起侧栏而不离开当前分组 / Toggle sidebar labels without leaving the current section');
  await getByAutomationId(page, AUTOMATION_IDS.shell.sidebarToggle).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(initialSidebarWidth);
  try {
    for (const theme of themeNames) {
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme[theme]).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await screenshotStep(`选择${theme}主题 / Select the ${theme} theme`);
    }
  } finally {
    await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.theme[initialTheme]).click();
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.language.en)).toBeVisible();
  await screenshotStep('查看语言菜单但保持当前App语言 / Inspect the language menu without changing the App language');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('lang', language);

  // 窗口操作：真实最大化、恢复、最小化，只恢复本轮窗口，不拍桌面。
  // Window actions: maximize, restore and minimize the actual owned window without capturing the desktop.
  const initialSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const maximize = getByAutomationId(page, AUTOMATION_IDS.shell.window.maximizeRestore);
  await maximize.click();
  try {
    await expect.poll(() => desktopApp.windowState()).toMatchObject({ maximized: true, minimized: false, visible: true });
    await screenshotStep('通过产品按钮最大化窗口 / Maximize the window through the product control');
  } finally {
    await maximize.click();
  }
  await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(initialSize);
  await screenshotStep('恢复原窗口尺寸 / Restore the original window size');
  await getByAutomationId(page, AUTOMATION_IDS.shell.window.minimize).click();
  try {
    await expect.poll(() => desktopApp.windowState()).toMatchObject({ minimized: true });
  } finally {
    await desktopApp.restoreWindow();
  }
  await expect.poll(() => desktopApp.windowState()).toMatchObject({ minimized: false, visible: true });
  await expectCurrentSection(page, tlsPassthroughSection, sectionEvidence, 'after:window-controls');
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
  await screenshotStep('恢复最小化窗口并保留当前设置 / Restore the minimized window while retaining current settings');

  // 证据与销毁：附加语言无关状态；fixture 随后保存 trace/screenshot 并验证进程与 8888 释放。
  // Evidence and teardown: attach language-independent state; the fixture then retains trace/screenshot and verifies process/8888 release.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('section-navigation-state.json');
  await writeFile(evidencePath, JSON.stringify(sectionEvidence, null, 2), 'utf8');
  await testInfo.attach('section-navigation-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});