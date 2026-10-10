import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

test('capture.recording.pause-resume fixes recording at request and WebSocket upgrade start', async ({
  desktopApp, httpTrafficRunner, webSocketTrafficRunner,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.recording.pause-resume' });
  const { page } = desktopApp;
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const prefix = '/e2e/recording-boundary';
  const clients: Array<Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>>> = [];

  // 准备：新Electron通过正式UI开始录制，HTTP和WebSocket均由本轮真实网络产生。
  // Arrange: start Recording in a fresh Electron through UI and create HTTP and WebSocket traffic over the real network.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  try {
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/http-before`))
      .resolves.toMatchObject({ statusCode: 200 });
    const recordedClient = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), `${prefix}/ws-before`);
    clients.push(recordedClient);
    recordedClient.sendText('recorded-before-pause');
    await recordedClient.waitForText('recorded-before-pause');
    const recordedRow = rows.filter({ hasText: `${prefix}/ws-before` });
    await expect(recordedRow).toHaveCount(1);
    await recordedRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.websocketFrame)).toHaveCount(2);

    // 用户操作：暂停只影响新请求；旧连接继续双向转发和记录，新连接只转发。
    // User actions: pause affects only new requests; the recorded connection still captures both directions and a paused connection only forwards.
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/http-paused`))
      .resolves.toMatchObject({ statusCode: 200 });
    recordedClient.sendText('recorded-during-pause');
    await recordedClient.waitForText('recorded-during-pause');
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.websocketFrame)).toHaveCount(4);
    await expect(rows.filter({ hasText: `${prefix}/http-paused` })).toHaveCount(0);
    const ignoredClient = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), `${prefix}/ws-paused`);
    clients.push(ignoredClient);
    ignoredClient.sendText('ignored-during-pause');
    await ignoredClient.waitForText('ignored-during-pause');
    await expect(rows.filter({ hasText: `${prefix}/ws-paused` })).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    const pausedRows = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-automation-id')));

    // 业务断言：只比较自产记录，避免把恢复期间其他应用的新流量误判为补录；精确存储所有权由真实Core回归验证。
    // Product assertions: compare owned records, not new traffic from other apps after resume; real Core regression verifies exact storage ownership.
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    ignoredClient.sendText('ignored-after-resume-with-distinct-bytes');
    await ignoredClient.waitForText('ignored-after-resume-with-distinct-bytes');
    await ignoredClient.closeGracefully(1000, 'ignored-complete');
    await expect(rows.filter({ hasText: `${prefix}/ws-paused` })).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    const resumedRows = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-automation-id')));
    await testInfo.attach('recording-capture-boundary.json', {
      body: Buffer.from(JSON.stringify({ pausedRows, resumedRows })), contentType: 'application/json',
    });
    expect(resumedRows).toEqual(pausedRows);

    // 恢复后新流量：新HTTP和WebSocket重新录制，旧的暂停期流量仍不补录。
    // New traffic after resume: new HTTP and WebSocket requests are captured without backfilling paused traffic.
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/http-after`))
      .resolves.toMatchObject({ statusCode: 200 });
    const resumedClient = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), `${prefix}/ws-after`);
    clients.push(resumedClient);
    resumedClient.sendText('recorded-after-resume');
    await resumedClient.waitForText('recorded-after-resume');
    const resumedRow = rows.filter({ hasText: `${prefix}/ws-after` });
    await expect(resumedRow).toHaveCount(1);
    await resumedRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.websocketFrame)).toHaveCount(2);
    await expect(rows.filter({ hasText: prefix })).toHaveCount(4);
    await expect(rows.filter({ hasText: `${prefix}/http-paused` })).toHaveCount(0);
    await expect(rows.filter({ hasText: `${prefix}/ws-paused` })).toHaveCount(0);

    // 证据与清理：真实Close握手后保存数据面证据，fixture负责trace及完整进程和宿主恢复。
    // Evidence and cleanup: finish real Close handshakes and save network evidence; the fixture owns traces and full process and host restoration.
    for (const client of clients) await client.closeGracefully(1000, 'recording-complete');
    await expect.poll(() => webSocketTrafficRunner.evidence().closeCodes).toEqual([1000, 1000, 1000]);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('recording-network.json', {
      body: Buffer.from(JSON.stringify(webSocketTrafficRunner.evidence())), contentType: 'application/json',
    });
  } finally {
    for (const client of clients) {
      if (!client.isClosed()) await client.closeGracefully(1000, 'workflow-cleanup');
    }
  }
});