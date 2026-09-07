import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

test('breakpoints.lifecycle-release aborts all pending traffic on shutdown', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
  webSocketTrafficRunner: webSocketLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.lifecycle-release',
  });

  const { page } = desktopApp;
  const disconnectWebSocketPath = '/e2e/lifecycle-release-disconnect-ws';
  const shutdownWebSocketPath = '/e2e/lifecycle-release-shutdown-ws';
  const httpPath = '/e2e/lifecycle-release-http';
  const disconnectPayload = 'disconnect-must-not-forward';
  const shutdownPayload = 'shutdown-must-not-forward';

  // Arrange: enable one real WebSocket breakpoint, then create a POST-only HTTP breakpoint Rule.
  // 准备：启用真实WebSocket断点，再通过产品UI创建只匹配POST的HTTP断点规则。
  await startRecording(desktopApp);
  const disconnectClient = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    disconnectWebSocketPath,
  );
  const captureRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const webSocketRow = captureRows.filter({ hasText: disconnectWebSocketPath }).last();
  await expect(webSocketRow).toBeVisible();
  await webSocketRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  await createRequestBreakpointRule(page, 'E2E lifecycle release', 'POST');

  // Arrange pending traffic: neither HTTP nor WebSocket may reach origin while no user command runs.
  // 构造pending：在用户未执行命令时，HTTP与WebSocket均不得抵达origin。
  const httpOutcome = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    httpPath,
    { method: 'POST', body: 'http-must-not-forward' },
  ).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const httpRow = captureRows.filter({ hasText: httpPath }).last();
  await expect(httpRow).toHaveAttribute('data-breakpoint-state', 'head');

  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  disconnectClient.sendText(disconnectPayload);
  const pendingRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  await expect(pendingRows).toHaveCount(1);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('2');
  await page.waitForTimeout(1_200);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('2');
  expect(loopbackLab.observation(httpPath)).toBeUndefined();
  expect(webSocketLab.hasMessage(disconnectPayload)).toBe(false);

  // Act and assert client lifecycle: abnormal disconnect releases only its WebSocket queue.
  // 操作并断言客户端生命周期：异常断开只释放所属WebSocket队列。
  disconnectClient.destroy();
  await expect(pendingRows).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('1');
  expect(webSocketLab.hasMessage(disconnectPayload)).toBe(false);

  // Arrange shutdown lifecycle: create a second real connection and hold one new frame.
  // 准备Core关闭生命周期：建立第二条真实连接并再次挂起一帧。
  const shutdownClient = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    shutdownWebSocketPath,
  );
  const shutdownWebSocketRow = captureRows.filter({ hasText: shutdownWebSocketPath }).last();
  await expect(shutdownWebSocketRow).toBeVisible();
  await shutdownWebSocketRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  const breakpointToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  );
  const breakpointEnable = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointEnable,
  );
  await breakpointToggle.click();
  if (await breakpointEnable.count() === 0) {
    await breakpointToggle.click();
  }
  await breakpointEnable.click();
  shutdownClient.sendText(shutdownPayload);
  await expect(pendingRows).toHaveCount(1);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('2');
  expect(webSocketLab.hasMessage(shutdownPayload)).toBe(false);

  // Act: product Close must release Core/RPC lifecycle state as aborted and close both clients.
  // 操作：产品Close必须以aborted释放Core/RPC生命周期状态，并关闭两个客户端。
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();

  // Assert: lifecycle release never forwards the held payloads and leaves no listener/process behind.
  // 断言：生命周期释放绝不转发挂起payload，并且不遗留listener或进程。
  await expect(httpOutcome).resolves.toHaveProperty('error');
  await expect.poll(() => shutdownClient.isClosed()).toBe(true);
  expect(loopbackLab.observation(httpPath)).toBeUndefined();
  expect(webSocketLab.hasMessage(disconnectPayload)).toBe(false);
  expect(webSocketLab.hasMessage(shutdownPayload)).toBe(false);
  await testInfo.attach('lifecycle-release-origin-observation', {
    body: Buffer.from(JSON.stringify({
      http: loopbackLab.evidence(),
      websocket: webSocketLab.evidence(),
    }, null, 2)),
    contentType: 'application/json',
  });
});
