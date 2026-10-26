import { access, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Bind and immediately release a loopback port so a real send reaches no listener. */
async function reserveClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

test('composer.send-failure reports invalid URL and network errors without a fake response', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.send-failure',
  });
  desktopApp.configureWorkflowTimeout(testInfo, 150_000);
  const { page } = desktopApp;

  const requestPath = '/e2e/composer/send-failure';
  loopbackLab.respondWith(requestPath, {
    body: JSON.stringify({ message: 'send-failure-success' }),
    headers: {
      'content-type': 'application/json',
      'set-cookie': ['e2e_session=failure-value; Path=/; HttpOnly'],
    },
  });
  const unusedPort = await reserveClosedPort();

  const send = getByAutomationId(page, AUTOMATION_IDS.composer.send);
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  const response = getByAutomationId(page, AUTOMATION_IDS.composer.response);
  const history = getByAutomationId(page, AUTOMATION_IDS.composer.history);
  const historyList = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.historyList,
  );
  const historyRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerHistoryRow,
  );
  const responseTabs = page.locator('[data-automation-id^="composer.response-tab."]');

  /** Wait until the real send appends its terminal History row. */
  const waitForHistoryRows = async (count: number): Promise<void> => {
    await expect.poll(async () => {
      if (!(await historyList.isVisible().catch(() => false))) {
        await history.click().catch(() => undefined);
      }
      return historyRows.count();
    }, {
      message: `Composer History did not reach ${count} rows.`,
      timeout: 20_000,
    }).toBe(count);
  };
  const closeHistory = async (): Promise<void> => {
    if (await historyList.isVisible().catch(() => false)) {
      await history.click();
    }
  };

  // 准备：冷启动 bootstrap 完成系统代理接管后进入 Composer，新建空请求。
  // Arrange: after cold bootstrap takes the system proxy, open Composer and create an empty request.
  await expect.poll(
    () => access(desktopApp.systemProxyJournalPath()).then(() => true, () => false),
    { message: 'Cold bootstrap did not take the system proxy.' },
  ).toBe(true);
  const proxyBeforeSends = JSON.stringify(await desktopApp.readSystemProxySettings());

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method))
    .toContainText('GET');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.protocol.auto))
    .toHaveAttribute('aria-checked', 'true');
  await expect(url).toHaveValue('');
  await expect(send).toBeDisabled();
  await expect(response).toHaveAttribute('data-send-state', 'empty');
  await history.click();
  await expect(historyList).toBeVisible();
  await expect(historyRows).toHaveCount(0);
  await closeHistory();
  await screenshotStep('新建请求，Send在空URL时不可用 / Create a request with Send disabled on an empty URL');

  // 非法URL：真实Core返回ok=false，Renderer显示错误态而不是空响应壳。
  // Invalid URL: real Core returns ok=false and Renderer shows the error state instead of a response shell.
  await url.fill('not a valid request address');
  await expect(send).toBeEnabled();
  await send.click();
  await waitForHistoryRows(1);
  await closeHistory();
  await expect(response).toHaveAttribute('data-send-state', 'failed');
  const invalidUrlError = (await response.textContent())?.trim() ?? '';
  expect(invalidUrlError.length).toBeGreaterThan(0);
  await expect(responseTabs).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBody)).toHaveCount(0);
  await expect(send).toBeEnabled();
  await screenshotStep('非法URL显示错误态且Send恢复可用 / An invalid URL shows the error state and Send is usable again');

  // 未监听端口：真实连接被拒绝，同样不产生响应tab或成功状态。
  // Unused port: the real connection is refused, again creating no response tabs or success status.
  await url.fill(`http://127.0.0.1:${unusedPort}/unreachable`);
  await send.click();
  await waitForHistoryRows(2);
  await closeHistory();
  await expect(response).toHaveAttribute('data-send-state', 'failed');
  const unreachableError = (await response.textContent())?.trim() ?? '';
  expect(unreachableError.length).toBeGreaterThan(0);
  expect(unreachableError).not.toBe(invalidUrlError);
  await expect(responseTabs).toHaveCount(0);
  await expect(send).toBeEnabled();
  await screenshotStep('未监听端口同样进入错误态 / An unused port enters the same error state');

  // 有效fixture：旧错误清除，真实200、正文与四个响应tab可用。
  // Valid fixture: the old error clears; a real 200, body and all four response tabs become available.
  await url.fill(loopbackLab.url(requestPath));
  await send.click();
  await waitForHistoryRows(3);
  await closeHistory();
  await expect(response).toHaveAttribute('data-send-state', 'ready');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body))
    .toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBody))
    .toContainText('send-failure-success', { timeout: 20_000 });
  await expect(page.locator('[data-automation-id="composer.response"][data-send-state="failed"]'))
    .toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.headers).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.cookies).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.timing).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
  await screenshotStep('改成有效URL后得到真实200响应 / A valid URL yields a real 200 response');

  // History终态：三条真实发送按倒序保留成功/失败状态与数值duration。
  // History terminal state: three real sends keep their success/failure status and numeric duration in reverse order.
  await history.click();
  await expect(historyList).toBeVisible();
  await expect(historyRows).toHaveCount(3);
  await expect(historyRows.nth(0)).toHaveAttribute('data-ok', 'true');
  await expect(historyRows.nth(0)).toHaveAttribute('data-status', '200');
  await expect(historyRows.nth(0)).toContainText(loopbackLab.url(requestPath));
  await expect(historyRows.nth(1)).toHaveAttribute('data-ok', 'false');
  await expect(historyRows.nth(1)).toHaveAttribute('data-status', '0');
  await expect(historyRows.nth(2)).toHaveAttribute('data-ok', 'false');
  await expect(historyRows.nth(2)).toHaveAttribute('data-status', '0');
  const durations = await historyRows.evaluateAll((elements) => elements.map(
    (element) => Number(element.getAttribute('data-duration-ms')),
  ));
  expect(durations).toHaveLength(3);
  for (const duration of durations) {
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
  }
  const historyEvidence = await historyRows.evaluateAll((elements) => elements.map((element) => ({
    ok: element.getAttribute('data-ok'),
    status: element.getAttribute('data-status'),
    durationMs: element.getAttribute('data-duration-ms'),
  })));
  await screenshotStep('History保留三次发送的成功与失败终态 / History retains the terminal state of all three sends');
  await closeHistory();

  // 发送不修改系统代理，也不产生Rule记录。
  // Sending changes neither the system proxy nor any Rule records.
  expect(JSON.stringify(await desktopApp.readSystemProxySettings())).toBe(proxyBeforeSends);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.list)).toBeVisible();
  await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow)).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await expect(response).toHaveAttribute('data-send-state', 'ready');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('composer-send-failure-state.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath,
    unusedPort,
    history: historyEvidence,
    proxyUnchanged: true,
  }, null, 2), 'utf8');
  await testInfo.attach('composer-send-failure-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
