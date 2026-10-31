import type { Locator } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expectSameExchangeUi, expectSameOriginRequest } from '../../fixtures/ui/exchange-inspector';

/** 从公开 Capture row automation ID 提取 Core exchange ID。 */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

test('capture.replay resends the captured request through the proxy', async ({
  desktopApp,
  httpTrafficRunner,
  webSocketTrafficRunner,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.replay' });
  const { page } = desktopApp;
  const prefix = '/e2e/replay';
  const requestPath = `${prefix}/post`;
  const requestBody = 'replay-body-0123456789';
  const responseBody = 'replay-response-body';
  // 固定 Date，使两次响应的 header 可以逐字比较。
  const fixedDate = 'Thu, 01 Jan 2026 00:00:00 GMT';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  // 提示会短暂停留，按最后一条定位，避免上一条尚未消失时命中多个。
  const replayNotice = getByAutomationId(page, AUTOMATION_IDS.capture.replayNotice).last();
  const clients: Array<Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>>> = [];

  // 准备：新Electron经正式UI开始录制，只显示本轮自产路径并收起无关facet。
  // Arrange: start Recording through the real UI, scope this workflow's own path and collapse unrelated facets.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }

  try {
    // 用户操作：经8888发送一条自产POST，右键该行并从菜单重放。
    // User action: send one owned POST through 8888, then replay it from the row context menu.
    httpTrafficRunner.respondWith(requestPath, {
      statusCode: 200,
      headers: { 'content-type': 'text/plain', date: fixedDate },
      body: responseBody,
    });
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-e2e-replay': 'original' },
      body: requestBody,
    })).resolves.toMatchObject({ statusCode: 200 });
    const matchingRows = rows.filter({ hasText: requestPath });
    await expect(matchingRows).toHaveCount(1);
    const sourceRow = matchingRows.first();
    // 等响应状态进入行内，避免在 request-complete 窗口里打开禁用的 Replay。
    await expect(sourceRow).toContainText('200');
    const sourceExchangeId = await exchangeId(sourceRow);
    await sourceRow.click({ button: 'right' });
    const replay = getByAutomationId(page, AutomationIdFactory.captureReplay(sourceExchangeId));
    await expect(replay).toBeVisible();
    await screenshotStep('右键菜单中的Replay入口 / The Replay entry in the row context menu', {
      highlights: [{ target: replay.locator('xpath=ancestor::*[@role="menuitem"][1]'), label: '1' }],
    });
    await replay.click();
    await expect(replayNotice).toHaveAttribute('data-state', 'sent');

    // 业务断言：新行由正常代理管线产生，源站恰好收到两次相同的请求内容。
    // Product assertions: the new row comes from the normal proxy pipeline and the origin receives the same request twice.
    await expect(rows.filter({ hasText: requestPath })).toHaveCount(2);
    await expect.poll(() => httpTrafficRunner.evidence().length, { timeout: 5_000 }).toBe(2);
    const observations = httpTrafficRunner.evidence() as Array<{
      method: string;
      path: string;
      headers: Record<string, string | string[]>;
      bodyBase64: string;
    }>;
    // origin 侧：两次请求的 method、path、端到端 header 与正文必须完全一致。
    // Origin side: both requests must match on method, path, end-to-end headers and body.
    expectSameOriginRequest(observations[0]!, observations[1]!);
    const replayedRow = rows.filter({ hasText: requestPath }).last();
    // App 侧：两条记录的请求与响应在 Inspector 中必须完全一致。
    // App side: both rows must show the same request and response in the Inspector.
    await expectSameExchangeUi(page, sourceRow, replayedRow, {
      url: httpTrafficRunner.url(requestPath),
      method: 'POST',
      status: '200',
    });
    await screenshotStep('重放后新增同method/path的记录 / Replay adds a second row with the same method and path', {
      highlights: [{ target: replayedRow, label: '1' }],
    });

    // 禁用入口：WebSocket行的Replay不可用，不通过Store或Preload绕过。
    // Disabled entry: a WebSocket row cannot be replayed, without Store or Preload shortcuts.
    const client = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), `${prefix}/ws`);
    clients.push(client);
    client.sendText('replay-ws');
    await client.waitForText('replay-ws');
    const webSocketRow = rows.filter({ hasText: `${prefix}/ws` });
    await expect(webSocketRow).toHaveCount(1);
    const webSocketExchangeId = await exchangeId(webSocketRow);
    await webSocketRow.click({ button: 'right' });
    const webSocketReplay = getByAutomationId(
      page,
      AutomationIdFactory.captureReplay(webSocketExchangeId),
    );
    await expect(webSocketReplay.locator('xpath=ancestor::*[@role="menuitem"][1]'))
      .toHaveAttribute('aria-disabled', 'true');
    await screenshotStep('WebSocket行的Replay禁用 / Replay is disabled for a WebSocket row', {
      highlights: [{ target: webSocketReplay.locator('xpath=ancestor::*[@role="menuitem"][1]'), label: '1' }],
    });
    await page.keyboard.press('Escape');

    // 录制暂停：请求仍到达源站，但列表不新增行，提示说明录制已暂停。
    // Recording paused: the request still reaches the origin, no row is added and the notice says recording is paused.
    await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');
    await sourceRow.click({ button: 'right' });
    await getByAutomationId(page, AutomationIdFactory.captureReplay(sourceExchangeId)).click();
    await expect.poll(() => httpTrafficRunner.evidence().length, { timeout: 5_000 }).toBe(3);
    await expect(rows.filter({ hasText: requestPath })).toHaveCount(2);
    await expect(replayNotice).toHaveAttribute('data-state', 'paused');
    await screenshotStep('录制暂停时重放不新增记录 / Replay while recording is paused adds no row', {
      highlights: [{ target: replayNotice, label: '1' }],
    });

    // 证据：保留真实origin观测与行身份。
    // Evidence: keep the real origin observations and row identities.
    await testInfo.attach('capture-replay.json', {
      body: Buffer.from(JSON.stringify({
        sourceExchangeId,
        webSocketExchangeId,
        observations,
        rowCount: await rows.count(),
      })),
      contentType: 'application/json',
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    for (const client of clients) {
      if (!client.isClosed()) await client.closeGracefully(1000, 'workflow-cleanup');
    }
  }
});
