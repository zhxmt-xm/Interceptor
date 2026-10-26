import { writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const PATH_A = '/e2e/composer/history-a';
const PATH_B = '/e2e/composer/history-b';
const BODY_B = JSON.stringify({ workflow: 'composer.history-new', request: 'B' });
const HEADER_B = { name: 'x-e2e-history', value: 'request-b' };
const BEARER_B = 'history-new-bearer';

/** Wait for one real Composer response state. */
async function expectSendState(page: Page, state: 'ready' | 'empty'): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.response))
    .toHaveAttribute('data-send-state', state);
}

/** Open the History flyout and return its rows in display order. */
async function openHistory(page: Page) {
  const history = getByAutomationId(page, AUTOMATION_IDS.composer.history);
  const list = getByAutomationId(page, AUTOMATION_IDS.composer.historyList);
  if (!(await list.isVisible().catch(() => false))) {
    await history.click();
  }
  await expect(list).toBeVisible();
  return getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerHistoryRow);
}

/** Close the History flyout when it is still open. */
async function closeHistory(page: Page): Promise<void> {
  const list = getByAutomationId(page, AUTOMATION_IDS.composer.historyList);
  if (await list.isVisible().catch(() => false)) {
    await getByAutomationId(page, AUTOMATION_IDS.composer.history).click();
  }
}

/** Select one Real Composer method through the shared method menu. */
async function selectMethod(page: Page, target: 'GET' | 'POST'): Promise<void> {
  const method = getByAutomationId(page, AUTOMATION_IDS.composer.method);
  await method.click();
  await page.keyboard.press('Home');
  if (target === 'POST') {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(method).toContainText(target);
}

test('composer.history-new restores complete requests and resets a new request without deleting history', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.history-new',
  });
  const { page } = desktopApp;
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  const responseBody = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane);

  // 准备：进入Composer，新建空请求并确认默认编辑状态。
  // Arrange: open Composer, create an empty request and confirm the default editor state.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.protocol.auto))
    .toHaveAttribute('aria-checked', 'true');
  await expect(url).toHaveValue('');
  await expectSendState(page, 'empty');
  await screenshotStep('新建空请求并保持默认GET/Auto / Create an empty request with default GET and Auto');

  // 用户操作：通过真实UI发送GET A。
  // User action: send GET A through the real UI.
  await url.fill(loopbackLab.url(PATH_A));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expectSendState(page, 'ready');
  await expect(responseBody).toContainText(PATH_A);
  await screenshotStep('发送GET请求A / Send GET request A');

  // 用户操作：新建B，设置POST、body、Header与Bearer，并真实发送。
  // User action: create B with POST, body, Header and Bearer, then send it.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await url.fill(loopbackLab.url(PATH_B));
  await selectMethod(page, 'POST');
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  const bodyModes = getByAutomationId(page, AUTOMATION_IDS.composer.bodyType)
    .locator('..')
    .getByRole('radio');
  await bodyModes.nth(2).click();
  const bodyEditor = getByAutomationId(page, AUTOMATION_IDS.composer.body);
  await expect(bodyEditor).toBeVisible();
  await bodyEditor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(BODY_B);
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill(HEADER_B.name);
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(HEADER_B.value);
  await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
  const authControl = getByAutomationId(page, AUTOMATION_IDS.composer.authType)
    .getByRole('combobox');
  await authControl.click();
  await authControl.press('Home');
  await authControl.press('ArrowDown');
  await authControl.press('Enter');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(BEARER_B);
  await screenshotStep('配置POST B的body、Header与Bearer / Configure body, Header and Bearer for POST B');
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expectSendState(page, 'ready');
  await expect(responseBody).toContainText(PATH_B);
  await screenshotStep('发送POST请求B / Send POST request B');

  // 业务断言：History按时间降序显示两条真实记录。
  // Assert: History lists the two real records in descending time order.
  const historyRows = await openHistory(page);
  await expect(historyRows).toHaveCount(2);
  const newest = historyRows.first();
  const oldest = historyRows.nth(1);
  await expect(newest).toContainText(PATH_B);
  await expect(newest).toContainText('POST');
  await expect(newest).toHaveAttribute('data-status', '200');
  await expect(oldest).toContainText(PATH_A);
  await expect(oldest).toContainText('GET');
  await screenshotStep('History按时间降序保留两条真实发送 / History keeps both real sends in descending order');
  await closeHistory(page);

  // 用户操作：加载A；History只回填method与URL，response保留当前会话结果。
  // User action: load A; History only restores method and URL, so the response stays with the current session.
  await openHistory(page);
  await historyRows.nth(1).click();
  await closeHistory(page);
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
  await expect(url).toHaveValue(loopbackLab.url(PATH_A).replace(/^https?:\/\//, ''));
  await expectSendState(page, 'ready');
  await expect(responseBody).toContainText(PATH_B);
  await screenshotStep('加载A回填GET与URL，response仍是当前会话 / Load A and restore GET and its URL without replacing the current response');

  // 用户操作：加载B；同样只回填method与URL。
  // User action: load B, which again only restores method and URL.
  await openHistory(page);
  await historyRows.first().click();
  await closeHistory(page);
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('POST');
  await expect(url).toHaveValue(loopbackLab.url(PATH_B).replace(/^https?:\/\//, ''));
  await screenshotStep('加载B回填POST与URL / Load B and restore POST and its URL');

  // 用户操作：点击New，编辑器和response重置，History不删除。
  // User action: click New; the editor and response reset while History keeps its records.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
  await expect(url).toHaveValue('');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.protocol.auto))
    .toHaveAttribute('aria-checked', 'true');
  await expectSendState(page, 'empty');
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.body)).toHaveCount(0);
  const remainingHistory = await openHistory(page);
  await expect(remainingHistory).toHaveCount(2);
  await closeHistory(page);
  await screenshotStep('New重置编辑器与response且History保留 / New resets the editor and response while History remains');

  // 业务断言：再次加载A，New没有删除或串改历史；加载不自动发送。
  // Assert: loading A again proves New neither deleted nor rewrote the stored requests, and loading does not send.
  await openHistory(page);
  await remainingHistory.nth(1).click();
  await closeHistory(page);
  await expect(url).toHaveValue(loopbackLab.url(PATH_A).replace(/^https?:\/\//, ''));
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
  await expectSendState(page, 'empty');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('composer-history-new.json');
  await writeFile(evidencePath, JSON.stringify({
    pathA: PATH_A,
    pathB: PATH_B,
    bodyB: BODY_B,
    headerB: HEADER_B,
    bearerB: BEARER_B,
  }, null, 2), 'utf8');
  await testInfo.attach('composer-history-new.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
