import { access, readFile, writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Matches RequestList's fixed `estimateSize`; the virtual list height is row count times this value. */
const ROW_HEIGHT = 52;
const REQUEST_COUNT = 240;
const CONCURRENCY = 20;
const PATH_PREFIX = '/e2e/virtual-scroll';

interface ListScrollState {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Real proxy requests with bounded concurrency, all sharing this workflow's unique path prefix. */
async function sendTraffic(
  port: number,
  requestThroughProxy: (port: number, pathname: string) => Promise<{ statusCode: number | undefined }>,
  from: number,
  to: number,
): Promise<void> {
  let next = from;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index > to) return;
      const response = await requestThroughProxy(port, `${PATH_PREFIX}/${index}`);
      if (response.statusCode !== 200) {
        throw new Error(`Virtual-scroll request ${index} returned ${response.statusCode}.`);
      }
    }
  }));
}

async function readListScroll(page: Page): Promise<ListScrollState> {
  return getByAutomationId(page, AUTOMATION_IDS.capture.listScroll).evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
}

test('capture.list.virtual-scroll keeps rendering bounded and preserves selection and scroll state', async ({
  desktopApp,
  httpTrafficRunner,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.list.virtual-scroll',
  });

  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const listScroll = getByAutomationId(page, AUTOMATION_IDS.capture.listScroll);
  const evidence: Record<string, unknown> = {
    requestCount: REQUEST_COUNT,
    pathPrefix: PATH_PREFIX,
  };

  // 准备：真实Recording；用唯一前缀与本 workflow 的请求隔离宿主自身流量。
  // Arrange: real Recording; isolate this workflow's requests from host traffic with a unique prefix.
  await startRecording(desktopApp);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toHaveCount(0);
  expect((await readListScroll(page)).scrollTop).toBe(0);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${PATH_PREFIX}/`);
  await expect(rows).toHaveCount(0);
  await screenshotStep('用唯一路径前缀开始本轮大列表 / Start the large list with this workflow prefix');

  // 用户操作：分批并发产生240条真实请求，最后一条单独发送以固定底部顺序。
  // User actions: produce 240 real requests with bounded concurrency; send the last one alone to fix the bottom order.
  await sendTraffic(
    desktopApp.capturePort(),
    (port, requestPath) => httpTrafficRunner.requestThroughProxy(port, requestPath),
    1,
    REQUEST_COUNT - 1,
  );
  await expect(httpTrafficRunner.requestThroughProxy(
    desktopApp.capturePort(),
    `${PATH_PREFIX}/${REQUEST_COUNT}`,
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(async () => (await readListScroll(page)).scrollHeight, {
    message: 'The virtual list did not account for all 240 requests',
    timeout: 60_000,
  }).toBe(REQUEST_COUNT * ROW_HEIGHT);
  const renderedRows = await rows.count();
  expect(renderedRows, 'A virtualized list must not render all 240 rows').toBeGreaterThan(0);
  expect(renderedRows, 'A virtualized list must not render all 240 rows').toBeLessThan(100);
  evidence.renderedRows = renderedRows;
  await screenshotStep('240条请求只渲染有限DOM行 / 240 requests render a bounded number of DOM rows');

  // 用户操作：滚到中部，选中一条可见请求。
  // User action: scroll to the middle and select one visible request.
  await listScroll.evaluate((element) => {
    element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) / 2);
  });
  await expect.poll(async () => (await readListScroll(page)).scrollTop).toBeGreaterThan(0);
  const middleRow = rows.nth(3);
  await expect(middleRow).toBeVisible();
  const middleAutomationId = await middleRow.getAttribute('data-automation-id');
  if (!middleAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('The visible virtual row omitted its public identity.');
  }
  const middlePath = (await middleRow
    .locator('[data-parity="capture-list-path-cell"]')
    .textContent())?.trim() ?? '';
  if (!new RegExp(`^${PATH_PREFIX}/\\d+$`).test(middlePath)) {
    throw new Error(`The visible virtual row rendered an unexpected path: ${middlePath || '(empty)'}`);
  }
  const middleRowByIdentity = getByAutomationId(page, middleAutomationId as AutomationId);
  await middleRowByIdentity.click();
  await expect(middleRowByIdentity).toHaveAttribute('aria-pressed', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText(middlePath);
  const beforeNavigation = await readListScroll(page);
  evidence.middlePath = middlePath;
  evidence.middleAutomationId = middleAutomationId;
  evidence.beforeNavigation = beforeNavigation;
  await screenshotStep('滚到中部并选中一条请求 / Scroll to the middle and select a request');

  // 业务断言：切到Rules再返回，selection、Inspector与scrollTop全部保持。
  // Assert: a round trip through Rules keeps the selection, Inspector and scrollTop.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture))
    .toHaveAttribute('aria-current', 'page');
  await expect.poll(async () => (await readListScroll(page)).scrollTop, {
    message: 'Returning to Capture did not restore the scroll position',
  }).toBe(beforeNavigation.scrollTop);
  await expect(middleRowByIdentity).toHaveAttribute('aria-pressed', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText(middlePath);
  await screenshotStep('跨workspace返回后保留选中与滚动 / Returning through another workspace preserves selection and scroll');

  // 业务断言：停在底部时新请求自动跟随。
  // Assert: a new request is followed while the list is docked at the bottom.
  await listScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => {
    const state = await readListScroll(page);
    return state.scrollTop + state.clientHeight >= state.scrollHeight - 1;
  }, { message: 'The list did not reach the bottom before appending' }).toBe(true);
  const beforeFollow = await readListScroll(page);
  await expect(httpTrafficRunner.requestThroughProxy(
    desktopApp.capturePort(),
    `${PATH_PREFIX}/follow`,
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(async () => (await readListScroll(page)).scrollHeight, {
    message: 'The followed request did not extend the virtual list',
  }).toBe((REQUEST_COUNT + 1) * ROW_HEIGHT);
  const afterFollow = await readListScroll(page);
  expect(afterFollow.scrollTop).toBeGreaterThan(beforeFollow.scrollTop);
  await expect(rows.filter({ hasText: `${PATH_PREFIX}/follow` })).toBeVisible();
  evidence.stickToBottom = { beforeFollow, afterFollow };
  await screenshotStep('停在底部时自动跟随新请求 / Follow the new request while docked at the bottom');

  // 业务断言：离开底部后新请求不抢滚动位置。
  // Assert: a new request must not steal the scroll position after leaving the bottom.
  await listScroll.evaluate((element, rowHeight) => {
    element.scrollTop = Math.max(0, element.scrollTop - rowHeight * 3);
  }, ROW_HEIGHT);
  await expect.poll(async () => {
    const state = await readListScroll(page);
    return state.scrollHeight - state.scrollTop - state.clientHeight;
  }, { message: 'The list did not leave the bottom before the next append' }).toBeGreaterThan(ROW_HEIGHT);
  const beforeStay = await readListScroll(page);
  await expect(httpTrafficRunner.requestThroughProxy(
    desktopApp.capturePort(),
    `${PATH_PREFIX}/stay`,
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(async () => (await readListScroll(page)).scrollHeight, {
    message: 'The non-followed request did not extend the virtual list',
  }).toBe((REQUEST_COUNT + 2) * ROW_HEIGHT);
  const afterStay = await readListScroll(page);
  expect(afterStay.scrollTop).toBe(beforeStay.scrollTop);
  // 新行可能落在向下的 overscan 里，因此以“不在列表可视区”而不是“不在DOM”判定未跟随。
  const stayRow = rows.filter({ hasText: `${PATH_PREFIX}/stay` });
  if (await stayRow.count() > 0) {
    const [stayRowTop, viewportBottom] = await Promise.all([
      stayRow.evaluate((row) => row.getBoundingClientRect().top),
      listScroll.evaluate((element) => element.getBoundingClientRect().bottom),
    ]);
    expect(stayRowTop, 'A detached list must not reveal the appended row').toBeGreaterThanOrEqual(viewportBottom);
  }
  evidence.stickToBottomDisabled = { beforeStay, afterStay };
  await screenshotStep('离开底部后新请求不抢滚动 / A new request does not steal a detached scroll position');

  // 清理路由：先经真实Proxy Restore交回系统代理，再交由fixture正常Close。
  // Route cleanup: hand the system proxy back through the real Proxy Restore, then let the fixture close normally.
  const journalPath = desktopApp.systemProxyJournalPath();
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { original: unknown };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
  expect(desktopApp.matchesSystemProxyEvidence(
    await desktopApp.readSystemProxySettings(),
    journal.original,
  )).toBe(true);
  await expect(access(journalPath)).rejects.toMatchObject({ code: 'ENOENT' });
  evidence.systemProxyRestoredBeforeClose = true;

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('virtual-scroll.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('virtual-scroll.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
