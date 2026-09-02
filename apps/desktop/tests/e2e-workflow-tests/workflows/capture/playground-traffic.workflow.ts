import { chromium, type Browser } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

test('capture.playground-traffic sends Browser traffic into real Capture', async ({
  desktopApp,
  playgroundServer,
}, testInfo) => {
  test.setTimeout(150_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.playground-traffic',
  });

  let browser: Browser | null = null;
  try {
    // 准备：通过产品UI开启真实Recording，再用系统Edge打开完整Playground进程。
    // Arrange: enable real Recording through product UI, then open the full Playground process in system Edge.
    await startRecording(desktopApp);
    browser = await chromium.launch({ channel: 'msedge' });
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await browserPage.goto(playgroundServer.url);
    await expect(browserPage.locator('main')).toHaveAttribute('data-section', 'capture');
    await expect(browserPage.locator('[data-scenario-id]')).toHaveCount(39);

    // 用户操作：在Playground选择H1 JSON并点击公开Run控件，不直接调用Lab API。
    // User action: select H1 JSON in Playground and click its public Run control without calling the Lab API directly.
    await browserPage.locator('[data-scenario-id="h1-json"]').click();
    await browserPage.locator('[data-playground-action="run"]').click();
    await expect(browserPage.locator('[data-traffic-state="complete"]')).toBeVisible();

    // 业务断言：真实Capture接收自产H1 exchange，并在Response正文中显示origin JSON。
    // Business assertion: real Capture receives the generated H1 exchange and shows the origin JSON in Response body.
    const captureRows = getByAutomationIdPrefix(
      desktopApp.page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    );
    const h1Row = captureRows.filter({ hasText: '/playground/h1-json' }).last();
    await expect(h1Row).toBeVisible();
    await expect(h1Row).toContainText('h1');
    await h1Row.click();
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.tab.response,
    ).click();
    await expect(getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.bodyPane,
    )).toContainText('ord_42');

    // 用户操作：返回Playground选择WebSocket text场景并再次点击Run。
    // User action: return to Playground, select the WebSocket text scenario, and click Run again.
    await browserPage.locator('[data-scenario-id="ws-text"]').click();
    await expect(browserPage.locator('[data-traffic-state]')).toHaveCount(0);
    await browserPage.locator('[data-playground-action="run"]').click();
    await expect(browserPage.locator('[data-traffic-state="complete"]')).toBeVisible();

    // 业务断言：真实Capture显示自产WebSocket exchange和双向text payload。
    // Business assertion: real Capture shows the generated WebSocket exchange and bidirectional text payload.
    const webSocketRow = captureRows.filter({ hasText: '/playground/ws/text' }).last();
    await expect(webSocketRow).toBeVisible();
    await expect(webSocketRow).toContainText('ws');
    const rowAutomationId = await webSocketRow.getAttribute('data-automation-id');
    if (!rowAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
      throw new Error('Captured WebSocket row has no stable exchange identity.');
    }
    const exchangeId = rowAutomationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
    await webSocketRow.click();
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.tab.messages,
    ).click();
    const frames = getByAutomationIdPrefix(
      desktopApp.page,
      `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`,
    );
    await expect.poll(() => frames.count()).toBeGreaterThanOrEqual(2);
    await expect(frames.filter({ hasText: 'hello from client' })).toHaveCount(2);

    // Evidence：保存真实Browser页面、Renderer状态和无page error事实。
    // Evidence: retain the real Browser page, Renderer state, and zero-page-error fact.
    await testInfo.attach('playground-browser-final', {
      body: await browserPage.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    // 清理：先关闭系统Edge；fixture随后关闭Playground并验证端口，Desktop fixture验证Main/Core/8888与代理恢复。
    // Cleanup: close system Edge first; fixtures then close Playground and verify its port, Main/Core/8888, and proxy restoration.
    await browser?.close();
  }
});
