import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { createRequestBreakpointRule } from '../../fixtures/breakpoint-workflow';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

test('breakpoints.queue-isolation keeps HTTP and one WebSocket queue independent', async ({
  desktopApp,
  loopbackLab,
  webSocketLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.queue-isolation',
  });

  const { page } = desktopApp;
  const webSocketPath = '/e2e/queue-isolation-ws';
  const httpPath = '/e2e/queue-isolation-http';
  const clientMessage = 'client-queue-head';
  const originMessage = 'server-queue-follower';
  const captureRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const keywordFilter = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
  const showCaptureRow = async (requestPath: string) => {
    await keywordFilter.fill(requestPath);
    const row = captureRows.filter({ hasText: requestPath }).last();
    await expect(row).toBeVisible();
    return row;
  };
  const selectCaptureRow = async (requestPath: string) => {
    const row = await showCaptureRow(requestPath);
    if (await row.getAttribute('aria-pressed') !== 'true') {
      await row.click();
    }
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    return row;
  };

  // Arrange: establish the real WebSocket first, enable its product breakpoint, then create the HTTP Rule.
  // 准备：先建立真实 WebSocket 并通过产品 UI 启用断点，再创建 HTTP Rule，避免 Upgrade 被该 Rule 挂起。
  await startRecording(desktopApp);
  const client = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    webSocketPath,
  );
  const webSocketRow = await selectCaptureRow(webSocketPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  await createRequestBreakpointRule(page, 'E2E queue isolation');

  // Arrange pending traffic: hold one HTTP request, then create ordered outbound/inbound pending frames.
  // 构造 pending：挂起一条 HTTP 请求，再按顺序制造当前连接的出站与入站帧断点。
  const httpRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    httpPath,
    { method: 'POST', body: 'http-queue' },
  ).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const httpRow = await showCaptureRow(httpPath);
  await expect(httpRow).toHaveAttribute('data-queue-key', 'http');
  await expect(httpRow).toHaveAttribute('data-breakpoint-state', 'head');

  await selectCaptureRow(webSocketPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  const pendingRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  client.sendText(clientMessage);
  await expect(pendingRows).toHaveCount(1);
  webSocketLab.sendFromOrigin(originMessage);
  await expect(pendingRows).toHaveCount(2);

  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('3');

  // Assert the current connection exposes one editable head and one queued non-editor row.
  // 断言当前连接只有一个可编辑队首，第二条为可选择但不可编辑的 queued 行。
  const webSocketHead = page.locator(
    `[data-automation-id^="${AUTOMATION_ID_PREFIXES.breakpointPending}"][data-breakpoint-state="head"]`,
  );
  const webSocketQueued = page.locator(
    `[data-automation-id^="${AUTOMATION_ID_PREFIXES.breakpointPending}"][data-breakpoint-state="queued"]`,
  );
  await expect(webSocketHead).toHaveCount(1);
  await expect(webSocketQueued).toHaveCount(1);
  await expect(webSocketHead).toHaveAttribute('data-queue-key', /^ws:/);
  await expect(webSocketHead).toHaveAttribute('data-queue-position', '1');
  await expect(webSocketQueued).toHaveAttribute('data-queue-position', '2');

  // Assert list integrity: one pending frame must not duplicate its already-captured history row.
  // 断言列表完整性：同一pending帧不得与已捕获的历史行重复渲染。
  await page.waitForTimeout(2_200);
  const historicalClientFrames = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.websocketFrame,
  ).filter({ hasText: clientMessage });
  const pendingClientFrames = pendingRows.filter({ hasText: clientMessage });
  expect(await historicalClientFrames.count() + await pendingClientFrames.count()).toBe(1);

  // Assert draft ownership: HTTP and WebSocket heads retain separate in-memory edits across selection changes.
  // 断言草稿归属：HTTP与WebSocket队首在切换选择后分别保留自己的内存编辑。
  await selectCaptureRow(httpPath);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('http-draft');

  await selectCaptureRow(webSocketPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await webSocketHead.click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('websocket-draft');

  await selectCaptureRow(httpPath);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('http-draft');
  await selectCaptureRow(webSocketPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await webSocketHead.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('websocket-draft');

  await webSocketQueued.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queuedDetail)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toHaveCount(0);

  // Act: continue the WebSocket queue only; the HTTP queue and a future echo must remain pending.
  // 操作：只继续 WebSocket 队列；HTTP 队列以及命令开始后产生的未来 echo 必须继续等待。
  await webSocketHead.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule)).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();

  await client.waitForText(originMessage);
  await expect.poll(() => webSocketLab.hasMessage(clientMessage)).toBe(true);
  await expect(pendingRows).toHaveCount(1);
  await expect(pendingRows).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(pendingRows).toHaveAttribute('data-queue-position', '1');
  await showCaptureRow(httpPath);
  await expect(httpRow).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('2');

  // Act and assert: release the future WebSocket item, then release HTTP through its own queue head.
  // 操作与断言：释放未来 WebSocket 项，再单独释放 HTTP 队首，证明两个逻辑队列互不阻塞。
  await showCaptureRow(webSocketPath);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
  await client.waitForText(clientMessage);
  await expect(pendingRows).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('1');

  await selectCaptureRow(httpPath);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('http-draft');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  const httpOutcome = await httpRequest;
  expect(httpOutcome).toMatchObject({ result: { statusCode: 200 } });
  await expect.poll(() => loopbackLab.observation(httpPath)?.body.toString('utf8'))
    .toBe('http-queue');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');

  // Evidence and teardown: persist both data-plane observations; shared fixture verifies process and port cleanup.
  // 证据与清理：保存双向数据面事实；共享 fixture 验证进程退出与端口释放。
  expect(client.hasText(originMessage)).toBe(true);
  expect(client.hasText(clientMessage)).toBe(true);
  await testInfo.attach('websocket-queue-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
