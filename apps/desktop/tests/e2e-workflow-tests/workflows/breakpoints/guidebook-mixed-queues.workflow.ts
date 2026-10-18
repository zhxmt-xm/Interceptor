import { writeFile } from 'node:fs/promises';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule, createResponseBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoint guide separates mixed HTTP and WebSocket queues and releases pending traffic on normal Close', async ({
  desktopApp, httpTrafficRunner, webSocketTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/mixed/';
  const requestPath = `${prefix}request-head`;
  const responsePath = `${prefix}response-queued`;
  const upgradePath = `${prefix}upgrade-queued`;
  const livePath = `${prefix}live`;
  const exitPath = `${prefix}request-exit`;
  const originalBody = '{"message":"guide-original-http"}';
  const unsentDraft = '{"message":"guide-unsubmitted-draft"}';
  const firstFrame = 'guide-ws-head';
  const secondFrame = 'guide-ws-queued';
  const exitFrame = 'guide-ws-exit-must-not-forward';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const pendingRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  const badge = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager);
  const pendingClients = new Set<ReturnType<typeof httpTrafficRunner.startAbortableRequestThroughProxy>>();
  const startHttp = (requestPath: string, method: string, body?: string) => {
    const client = httpTrafficRunner.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath, { method, body });
    pendingClients.add(client);
    return client.result.then(
      result => { pendingClients.delete(client); return { kind: 'response' as const, result }; },
      (error: unknown) => { pendingClients.delete(client); return { kind: 'error' as const, error }; },
    );
  };
  const row = (requestPath: string) => rows.filter({ hasText: requestPath }).last();
  const select = async (requestPath: string) => {
    const target = row(requestPath);
    await expect(target).toBeVisible();
    if (await target.getAttribute('aria-pressed') !== 'true') await target.click();
    return target;
  };
  let liveClient: Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>> | undefined;
  let upgradedClient: Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>> | undefined;
  let upgradeOutcome: Promise<
    | { kind: 'connected'; client: Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>> }
    | { kind: 'error'; error: unknown }
  > | undefined;
  let requestOutcome: ReturnType<typeof startHttp> | undefined;
  let responseOutcome: ReturnType<typeof startHttp> | undefined;
  let exitOutcome: ReturnType<typeof startHttp> | undefined;
  let media: GuidebookMedia | undefined;
  let mediaStopped = false;

  // 准备：所有等待来自真实流量；只匹配本轮路径，已有连接避免被Upgrade规则提前拦住。
  // Arrange: all waits come from real traffic; narrow Rules to this run and establish the existing connection before Upgrade interception.
  httpTrafficRunner.respondWith(responsePath, {
    body: '{"message":"guide-response-held"}', headers: { 'content-type': 'application/json' },
  });
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  try {
    liveClient = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), livePath);
    await select(livePath);
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.both).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
    await createRequestBreakpointRule(page, 'Guide mixed requests', 'POST', `${prefix}request-`);
    await createResponseBreakpointRule(page, 'Guide mixed responses', responsePath);
    await createRequestBreakpointRule(page, 'Guide mixed Upgrade', 'GET', upgradePath);
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
    media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-mixed-queues');

    // 用户操作：请求和响应共用HTTP队列；按发布版本记录Upgrade的实际行为。
    // User actions: requests and responses share HTTP; record the released App's actual Upgrade behavior.
    await media.step('01-http-head', '发送HTTP请求成为队首 / Send an HTTP request as queue head', async () => {
      requestOutcome = startHttp(requestPath, 'POST', originalBody);
      await expect(row(requestPath)).toHaveAttribute('data-queue-key', 'http');
      await expect(row(requestPath)).toHaveAttribute('data-breakpoint-state', 'head');
      expect(httpTrafficRunner.observation(requestPath)).toBeUndefined();
    });
    await media.step('02-response-queued', '让响应进入同一HTTP队列 / Queue a response in the same HTTP queue', async () => {
      responseOutcome = startHttp(responsePath, 'GET');
      await expect(row(responsePath)).toHaveAttribute('data-queue-key', 'http');
      await expect(row(responsePath)).toHaveAttribute('data-breakpoint-state', 'queued');
      await expect(row(responsePath)).toHaveAttribute('data-queue-position', '2');
      expect(httpTrafficRunner.observation(responsePath)?.method).toBe('GET');
    });
    await media.step('03-upgrade-result', '检查Upgrade实际建立连接而未排队 / Observe Upgrade connecting without joining this queue', async () => {
      upgradeOutcome = webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), upgradePath).then(
        client => ({ kind: 'connected' as const, client }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      );
      const upgraded = await upgradeOutcome;
      if (!upgraded || upgraded.kind !== 'connected') throw new Error('The actual Upgrade did not connect.');
      upgradedClient = upgraded.client;
      await expect(row(upgradePath)).toBeVisible();
      await expect(row(upgradePath)).not.toHaveAttribute('data-breakpoint-id');
      await expect(badge).toHaveText('2');
    });
    await media.step('04-live-connection', '选择已经建立的WS连接 / Select the established WS connection', async () => {
      await select(livePath);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    });
    await media.step('05-ws-head', '发送第一条WS帧成为独立队首 / Send the first WS frame as its own queue head', async () => {
      liveClient!.sendText(firstFrame);
      await expect(pendingRows).toHaveCount(1);
      await expect(pendingRows).toHaveAttribute('data-queue-key', /^ws:/);
      await expect(pendingRows).toHaveAttribute('data-breakpoint-state', 'head');
    });
    await media.step('06-ws-queued', '源站帧进入同一WS队列 / Queue an origin frame in the same WS queue', async () => {
      webSocketTrafficRunner.sendFromOrigin(secondFrame);
      await expect(pendingRows).toHaveCount(2);
      await expect(pendingRows.filter({ hasText: secondFrame })).toHaveAttribute('data-queue-position', '2');
      await expect(badge).toHaveText('4');
      expect(webSocketTrafficRunner.hasMessage(firstFrame)).toBe(false);
      expect(liveClient!.hasText(secondFrame)).toBe(false);
    });
    await media.step('07-http-draft', '为HTTP队首填写但不提交草稿 / Enter an HTTP head draft without submitting it', async () => {
      await select(requestPath);
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(unsentDraft);
    });
    await media.step('08-inspect-response', '选择排队响应，只读查看 / Select the queued response for read-only inspection', async () => {
      await select(responsePath);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queuedDetail)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toHaveCount(0);
    });
    await media.step('09-inspect-upgrade', '选择已建立的连接，不伪造Queued / Select the established connection without claiming Queued', async () => {
      await select(upgradePath);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queuedDetail)).toHaveCount(0);
      await expect(row(upgradePath)).not.toHaveAttribute('data-breakpoint-id');
    });
    await media.step('10-http-menu', '回到HTTP队首并打开批量菜单 / Return to the HTTP head and open batch actions', async () => {
      await select(requestPath);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue(unsentDraft);
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
    });
    await media.step('11-continue-http', '仅Continue HTTP队列，草稿不应用 / Continue only HTTP without applying the draft', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
      expect(await requestOutcome).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
      expect(await responseOutcome).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
      expect(httpTrafficRunner.observation(requestPath)?.body.toString('utf8')).toBe(originalBody);
      expect(upgradedClient?.isClosed()).toBe(false);
      await expect(badge).toHaveText('2');
    });
    await media.step('12-ws-still-pending', '回到WS确认等待项仍在 / Return to WS and confirm its waits remain', async () => {
      await select(livePath);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await expect(pendingRows).toHaveCount(2);
      await expect(pendingRows.filter({ hasText: secondFrame })).toHaveAttribute('data-breakpoint-state', 'queued');
    });
    await media.step('13-drop-ws', '仅Drop当前WS队列 / Drop only the current WS queue', async () => {
      await pendingRows.filter({ hasText: firstFrame }).click();
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue).click();
      await expect(pendingRows).toHaveCount(0);
      await expect(badge).toHaveText('');
      expect(webSocketTrafficRunner.hasMessage(firstFrame)).toBe(false);
      expect(liveClient!.hasText(secondFrame)).toBe(false);
    });
    await media.step('14-exit-http', '为退出场景挂起新HTTP请求 / Hold a new HTTP request for the exit scenario', async () => {
      exitOutcome = startHttp(exitPath, 'POST', 'guide-http-exit-must-not-forward');
      await expect(row(exitPath)).toHaveAttribute('data-breakpoint-state', 'head');
      expect(httpTrafficRunner.observation(exitPath)).toBeUndefined();
    });
    await media.step('15-exit-ws', '同时保留一条WS等待项 / Retain a WS wait at the same time', async () => {
      await select(livePath);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      liveClient!.sendText(exitFrame);
      await expect(pendingRows).toHaveCount(1);
      await expect(badge).toHaveText('2');
      expect(webSocketTrafficRunner.hasMessage(exitFrame)).toBe(false);
    });
    await media.step('16-before-close', '记录真实Close之前的两条等待 / Record both waits before the actual Close', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).focus();
      await expect(badge).toHaveText('2');
    });
    await media.stop({
      requestPath, responsePath, upgradePath, livePath, exitPath,
      originalBody, unsentDraft, firstFrame, secondFrame, exitFrame,
      httpScope: 'Request and response waits share queueKey=http',
      upgradeBoundary: 'The released App established this real Upgrade without a pending item despite the configured narrow GET Rule; no queued Upgrade is claimed',
      wsScope: 'Established connection frames have a separate ws:* queue',
      closeImage: 'Before the actual Close; post-close cancellation and host restoration are separate evidence, not a desktop recording',
    });
    mediaStopped = true;

    // 退出与证据：真实Close必须取消等待内容，不能用停止客户端或截图代替。
    // Shutdown and evidence: actual Close must cancel held content; do not substitute stopping clients or taking a screenshot.
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    expect(await exitOutcome).toMatchObject({ kind: 'error' });
    await expect.poll(() => liveClient!.isClosed()).toBe(true);
    await expect.poll(() => upgradedClient!.isClosed()).toBe(true);
    expect(httpTrafficRunner.observation(exitPath)).toBeUndefined();
    expect(webSocketTrafficRunner.hasMessage(exitFrame)).toBe(false);
    const evidence = testInfo.outputPath('mixed-queues-and-close.json');
    await writeFile(evidence, JSON.stringify({
      http: httpTrafficRunner.evidence(), websocket: webSocketTrafficRunner.evidence(),
      httpOriginalPreserved: true, wsQueueNotContinuedByHttp: true,
      heldPayloadsNotForwardedOnClose: true,
    }, null, 2), 'utf8');
    await testInfo.attach('mixed-queues-and-close.json', { path: evidence, contentType: 'application/json' });
    await desktopApp.writeEvidence(testInfo);
  } finally {
    // 清理：仅清理本轮客户端；成功路径中App已先正常退出。
    // Cleanup: dispose only this run's clients; the successful path has already closed the App normally.
    try {
      if (media && !mediaStopped) await media.stop({ requestPath, responsePath, upgradePath, livePath, exitPath, status: 'Incomplete workflow; not publishable' });
    } finally {
      for (const client of pendingClients) client.abort();
      liveClient?.destroy();
      upgradedClient?.destroy();
      const upgraded = await upgradeOutcome;
      if (upgraded?.kind === 'connected' && upgraded.client !== upgradedClient) upgraded.client.destroy();
      await Promise.all([requestOutcome, responseOutcome, exitOutcome]);
    }
  }
});
