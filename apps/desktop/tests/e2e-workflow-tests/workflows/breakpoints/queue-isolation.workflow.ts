import { writeFile } from 'node:fs/promises';

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
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('breakpoints.queue-isolation keeps HTTP and one WebSocket queue independent', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
  webSocketTrafficRunner: webSocketLab,
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
  const sequencePendingMessage = 'sequence-pending-before-history';
  const sequenceHistoryMessage = 'sequence-history-after-pending';
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
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointDirection.sent,
  ).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  await screenshotStep('准备：先建立真实 WebSocket 并通过产品 UI 启用断点，再创建 HTTP Rule，避免 Upgrade 被该 Rule 挂起。 / Arrange: establish the real WebSocket first, enable its product breakpoint, then create the HTTP Rule.');

  // Assert sequence ownership: a later unpaused inbound frame stays after the pending outbound frame.
  // 断言sequence归属：后到且未挂起的入站历史帧必须排在出站pending帧之后。
  const pendingRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  client.sendText(sequencePendingMessage);
  await expect(pendingRows).toHaveCount(1);
  webSocketLab.sendFromOrigin(sequenceHistoryMessage);
  await client.waitForText(sequenceHistoryMessage);
  await page.waitForTimeout(2_200);
  const sequencePendingRow = pendingRows.filter({ hasText: sequencePendingMessage });
  const sequenceHistoryRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.websocketFrame,
  ).filter({ hasText: sequenceHistoryMessage });
  await expect(sequencePendingRow).toHaveCount(1);
  await expect(sequenceHistoryRow).toHaveCount(1);
  const sequenceHistoryElement = await sequenceHistoryRow.elementHandle();
  expect(sequenceHistoryElement).not.toBeNull();
  expect(await sequencePendingRow.evaluate((pending, history) => Boolean(
    pending.compareDocumentPosition(history as Element) & Node.DOCUMENT_POSITION_FOLLOWING,
  ), sequenceHistoryElement)).toBe(true);

  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
  await expect.poll(() => webSocketLab.hasMessage(sequencePendingMessage)).toBe(true);
  await expect(pendingRows).toHaveCount(0);
  await screenshotStep('断言sequence归属：后到且未挂起的入站历史帧必须排在出站pending帧之后。 / Assert sequence ownership: a later unpaused inbound frame stays after the pending outbound frame.');

  // Arrange the main scenario with both directions enabled.
  // 准备主场景：停用单向配置，再通过产品UI启用双向断点。
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  await createRequestBreakpointRule(page, 'E2E queue isolation');
  await screenshotStep('准备主场景：停用单向配置，再通过产品UI启用双向断点。 / Arrange the main scenario with both directions enabled.');

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
  client.sendText(clientMessage);
  await expect(pendingRows).toHaveCount(1);
  webSocketLab.sendFromOrigin(originMessage);
  await expect(pendingRows).toHaveCount(2);

  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('3');
  await screenshotStep('构造 pending：挂起一条 HTTP 请求，再按顺序制造当前连接的出站与入站帧断点。 / Arrange pending traffic: hold one HTTP request, then create ordered outbound/inbound pending frames.');

  // Assert filtering: direction controls filter history and pending rows without renumbering the queue.
  // 断言筛选：方向控件同时筛选历史与pending行，但不改变逻辑队列位置。
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionSent).click();
  await expect(pendingRows).toHaveCount(1);
  await expect(pendingRows).toHaveAttribute('data-queue-position', '1');
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionReceived).click();
  await expect(pendingRows).toHaveCount(1);
  await expect(pendingRows).toHaveAttribute('data-queue-position', '2');
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll).click();
  await expect(pendingRows).toHaveCount(2);
  await screenshotStep('断言筛选：方向控件同时筛选历史与pending行，但不改变逻辑队列位置。 / Assert filtering: direction controls filter history and pending rows without renumbering the queue.');

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
  await screenshotStep('断言当前连接只有一个可编辑队首，第二条为可选择但不可编辑的 queued 行。 / Assert the current connection exposes one editable head and one queued non-editor row.');

  // Assert list integrity: one pending frame must not duplicate its already-captured history row.
  // 断言列表完整性：同一pending帧不得与已捕获的历史行重复渲染。
  await page.waitForTimeout(2_200);
  const historicalClientFrames = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.websocketFrame,
  ).filter({ hasText: clientMessage });
  const pendingClientFrames = pendingRows.filter({ hasText: clientMessage });
  expect(await historicalClientFrames.count() + await pendingClientFrames.count()).toBe(1);
  await screenshotStep('断言列表完整性：同一pending帧不得与已捕获的历史行重复渲染。 / Assert list integrity: one pending frame must not duplicate its already-captured history row.');

  // Assert draft ownership: HTTP and WebSocket heads retain separate in-memory edits across selection changes.
  // 断言草稿归属：HTTP与WebSocket队首在切换选择后分别保留自己的内存编辑。
  await selectCaptureRow(httpPath);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('http-draft');

  await selectCaptureRow(webSocketPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await webSocketHead.click();
  await screenshotStep('断言草稿归属：HTTP与WebSocket队首在切换选择后分别保留自己的内存编辑。 / Assert draft ownership: HTTP and WebSocket heads retain separate in-memory edits across selection changes.');

  // 布局断言：Original容器按实际正文定高，不保留旧185px下限。
  // Layout assertion: the Original container follows its body instead of the old 185px minimum.
  const executeEdited = getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited);
  const readOriginalLayout = () => executeEdited.evaluate((button) => {
    const inspector = button.closest('section')!;
    const sectionHeader = inspector.querySelector('[aria-controls]')!;
    const content = document.getElementById(sectionHeader.getAttribute('aria-controls')!)!;
    const original = content.firstElementChild!;
    const viewer = original.firstElementChild!;
    const originalStyle = getComputedStyle(original);
    return { display: originalStyle.display, minHeight: originalStyle.minHeight,
      originalHeight: original.getBoundingClientRect().height,
      viewerHeight: viewer.getBoundingClientRect().height };
  });
  await expect.poll(async () => {
    const layout = await readOriginalLayout();
    return { display: layout.display, minHeight: layout.minHeight,
      extraHeight: Math.abs(layout.originalHeight - layout.viewerHeight) };
  }).toEqual({ display: 'flex', minHeight: 'auto', extraHeight: 0 });
  const originalLayout = await readOriginalLayout();
  expect(originalLayout.viewerHeight).toBeGreaterThan(0);
  await writeFile(testInfo.outputPath('websocket-paused-original-layout.json'), JSON.stringify(originalLayout, null, 2), 'utf8');
  await executeEdited.locator('xpath=ancestor::section[1]').screenshot({ path: testInfo.outputPath('websocket-paused-original-layout.png') });

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
  await screenshotStep('布局断言：Original容器按实际正文定高，不保留旧185px下限。 / Layout assertion: the Original container follows its body instead of the old 185px minimum.');

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
  await screenshotStep('操作：只继续 WebSocket 队列；HTTP 队列以及命令开始后产生的未来 echo 必须继续等待。 / Act: continue the WebSocket queue only; the HTTP queue and a future echo must remain pending.');

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
  await screenshotStep('操作与断言：释放未来 WebSocket 项，再单独释放 HTTP 队首，证明两个逻辑队列互不阻塞。 / Act and assert: release the future WebSocket item, then release HTTP through its own queue head.');

  // Evidence and teardown: persist both data-plane observations; shared fixture verifies process and port cleanup.
  // 证据与清理：保存双向数据面事实；共享 fixture 验证进程退出与端口释放。
  expect(client.hasText(originMessage)).toBe(true);
  expect(client.hasText(clientMessage)).toBe(true);
  await testInfo.attach('websocket-queue-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
