import { writeFile } from 'node:fs/promises';

import type { Locator, Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { expect, test } from '../../fixtures/local-electron-driver';

interface ClipboardSummary {
  readonly length: number;
  readonly lineCount: number;
  readonly prefix: string;
  readonly suffix: string;
}

async function copyBodySummary(page: Page, copy: Locator): Promise<ClipboardSummary> {
  await copy.click();
  return page.evaluate(async () => {
    const text = await navigator.clipboard.readText();
    return {
      length: text.length,
      lineCount: text.split('\n').length,
      prefix: text.slice(0, 80),
      suffix: text.slice(-80),
    };
  });
}

async function activeRequestId(page: Page): Promise<string> {
  const rows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionRequest,
  );
  const automationId = await rows.evaluateAll((elements) =>
    elements.find((element) => element.getAttribute('aria-pressed') === 'true')
      ?.getAttribute('data-automation-id') ?? null);
  expect(automationId).not.toBeNull();
  return automationId!.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
}

test('composer.response.body-formatting formats by language and preserves failures', async ({
  desktopApp,
  loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.response.body-formatting',
  });

  const { page } = desktopApp;
  const format = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseBodyAction.format,
  );
  const copy = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseBodyAction.copy,
  );

  // 配置四个真实loopback响应，分别覆盖自动、手动与失败回退。
  // Configure four real loopback responses for auto, manual, and failure fallback paths.
  const htmlPath = '/e2e/composer/body-formatting/auto-html';
  const htmlBody = '<main><section><p>value</p></section></main>';
  loopbackLab.respondWith(htmlPath, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: htmlBody,
  });
  const javascriptPath = '/e2e/composer/body-formatting/auto-javascript';
  const javascriptBody = 'function example(){const value=1;return {value};}';
  loopbackLab.respondWith(javascriptPath, {
    headers: { 'content-type': 'application/javascript; charset=utf-8' },
    body: javascriptBody,
  });
  const cssPath = '/e2e/composer/body-formatting/manual-css';
  const cssBody = `/*${'x'.repeat(2 * 1024 * 1024)}*/.a{color:red}`;
  loopbackLab.respondWith(cssPath, {
    headers: { 'content-type': 'text/css; charset=utf-8' },
    body: cssBody,
  });
  const xmlPath = '/e2e/composer/body-formatting/invalid-xml';
  const xmlBody = '<root><';
  loopbackLab.respondWith(xmlPath, {
    headers: { 'content-type': 'application/xml' },
    body: xmlBody,
  });

  // 通过真实Composer UI发送小HTML，验证挂载时自动格式化。
  // Send small HTML through the real Composer UI and verify mount-time auto-formatting.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(htmlPath));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(htmlPath)?.method).toBe('GET');
  await expect(format).toBeEnabled();
  await expect.poll(
    async () => (await copyBodySummary(page, copy)).lineCount,
  ).toBeGreaterThan(1);
  const htmlSummary = await copyBodySummary(page, copy);
  expect(htmlSummary.prefix.startsWith('<main>')).toBe(true);
  expect(htmlSummary.suffix.endsWith('</main>')).toBe(true);

  // 发送小JavaScript，验证公开worker getter的自动格式化路径。
  // Send small JavaScript and verify auto-formatting through its public worker getter.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(
    loopbackLab.url(javascriptPath),
  );
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(javascriptPath)?.method).toBe('GET');
  await expect(format).toBeEnabled();
  await expect.poll(
    async () => (await copyBodySummary(page, copy)).prefix,
  ).not.toBe(javascriptBody);
  const javascriptSummary = await copyBodySummary(page, copy);
  expect(javascriptSummary.prefix).toContain('function example() {');
  expect(javascriptSummary.suffix).toContain('return { value };');

  // 发送超过自动阈值的CSS，先锁定原文，再由用户显式Format。
  // Send CSS above the auto threshold, lock the raw baseline, then invoke explicit Format.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(cssPath));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(cssPath)?.method).toBe('GET');
  await expect(format).toBeEnabled();
  const cssRequestId = await activeRequestId(page);
  const cssBefore = await copyBodySummary(page, copy);
  expect(cssBefore).toMatchObject({ length: cssBody.length, lineCount: 1 });
  await format.click();
  await expect.poll(
    async () => (await copyBodySummary(page, copy)).lineCount,
    { timeout: 45_000 },
  ).toBeGreaterThan(1);
  const cssAfter = await copyBodySummary(page, copy);
  expect(cssAfter.suffix).toContain('.a {');

  // malformed XML必须恢复原文且不向真实Renderer泄漏未处理错误。
  // Malformed XML must restore the original text without leaking an uncaught Renderer error.
  const errorsBefore = desktopApp.rendererPageErrors();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(xmlPath));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(xmlPath)?.method).toBe('GET');
  await expect(format).toBeEnabled();
  await format.click();
  await expect(format).toBeEnabled();
  const xmlSummary = await copyBodySummary(page, copy);
  expect(xmlSummary).toMatchObject({
    length: xmlBody.length,
    lineCount: 1,
    prefix: xmlBody,
    suffix: xmlBody,
  });
  expect(desktopApp.rendererPageErrors()).toEqual(errorsBefore);

  // 切回CSS文档时不再触发Format，必须恢复该response自己的格式化view cache。
  // Return to the CSS document without formatting again; its response-scoped view cache must restore.
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionRequest(cssRequestId),
  ).click();
  await expect(format).toBeEnabled();
  const cssRestored = await copyBodySummary(page, copy);
  expect(cssRestored).toMatchObject({
    length: cssAfter.length,
    lineCount: cssAfter.lineCount,
    prefix: cssAfter.prefix,
    suffix: cssAfter.suffix,
  });

  // 保存四段及CSS恢复摘要；driver随后负责trace、正常Close和销毁验证。
  // Save four path summaries plus CSS restoration; the driver owns trace and teardown.
  const evidencePath = testInfo.outputPath('body-formatting-state.json');
  await writeFile(
    evidencePath,
    JSON.stringify({
      htmlSummary,
      javascriptSummary,
      cssBefore,
      cssAfter,
      cssRestored,
      xmlSummary,
    }, null, 2),
    'utf8',
  );
  await testInfo.attach('body-formatting-state', {
    path: evidencePath,
    contentType: 'application/json',
  });
});