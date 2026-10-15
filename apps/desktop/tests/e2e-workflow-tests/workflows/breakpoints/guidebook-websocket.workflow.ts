import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoints guide records sent and received WebSocket text on one real connection', async ({
  desktopApp, webSocketTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const requestPath = '/guide/websocket/text';
  const payload = (message: string) => JSON.stringify({ type: 'chat', message });
  const original = payload('hello-original');
  const editOriginal = payload('edit-this');
  const replacement = payload('edited-by-guide');
  const dropped = payload('do-not-forward');
  const serverOriginal = payload('server-original');
  const serverEditOriginal = payload('server-edit-this');
  const serverReplacement = payload('server-edited-by-guide');
  const serverDropped = payload('server-do-not-forward');
  const afterDisabled = payload('after-disabled');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const connectionRow = rows.filter({ hasText: requestPath });
  const pendingRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  const toggle = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle);
  const body = getByAutomationId(page, AUTOMATION_IDS.breakpoints.body);
  let client: Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>> | undefined;
  const assertPaused = async (message: string): Promise<void> => {
    await expect(pendingRows).toHaveCount(1);
    await expect(pendingRows).toHaveAttribute('data-breakpoint-state', 'head');
    await expect(pendingRows).toHaveAttribute('data-queue-key', /^ws:/);
    await expect(pendingRows).toContainText(message);
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    expect(client!.hasText(message)).toBe(false);
  };
  const assertTextOnly = async (): Promise<void> => {
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.message)).toHaveAttribute('aria-pressed', 'true');
    for (const frame of ['ping', 'pong', 'close'] as const) {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame[frame])).toHaveAttribute('aria-pressed', 'false');
    }
  };

  // 准备：只准备真实代理和自产路径；连接、方向和消息都在录制期间建立。
  // Arrange: prepare only the real proxy and owned path; create the connection, direction settings and messages on camera.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/websocket');
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-websocket');
  try {
    // 用户操作：同一真实连接先演示Sent，再切换Received；不启用控制帧断点。
    // User actions: demonstrate Sent then Received on the same real connection, without control-frame breakpoints.
    await media.step('01-connect', '建立文本示例连接 / Connect the text example client', async () => {
      client = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), requestPath);
      await expect(connectionRow).toBeVisible();
    });
    await media.step('02-select-connection', '选中 WebSocket 连接 / Select the WebSocket connection', async () => {
      await connectionRow.click();
    });
    await media.step('03-messages', '打开 Messages / Open Messages', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await expect(toggle).toBeVisible();
    });
    await media.step('04-sent-setup', '打开连接断点设置 / Open connection breakpoint settings', async () => {
      await toggle.click();
      await assertTextOnly();
    });
    await media.step('05-sent-direction', '选择 Sent，仅暂停发送消息 / Choose Sent messages', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.sent).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.sent)).toHaveAttribute('aria-checked', 'true');
      await assertTextOnly();
    });
    await media.step('06-enable-sent', '启用 Sent 文本断点 / Enable Sent message breakpoints', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable)).toBeHidden();
    });
    await media.step('07-sent-original', '发送 hello-original 并暂停 / Pause hello-original', async () => {
      client!.sendText(original);
      await assertPaused(original);
      expect(webSocketTrafficRunner.hasMessage(original)).toBe(false);
    });
    await media.step('08-sent-unmodified', 'Continue unmodified 原样发送 / Continue the sent text unmodified', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await client!.waitForText(original);
      expect(webSocketTrafficRunner.hasMessage(original)).toBe(true);
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('09-sent-edit-target', '发送 edit-this 并暂停 / Pause edit-this', async () => {
      client!.sendText(editOriginal);
      await assertPaused(editOriginal);
    });
    await media.step('10-sent-text', '选择发送帧的 Text / Choose Text for the sent frame', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await expect(body).toBeVisible();
    });
    await media.step('11-sent-edit', '输入 edited-by-guide / Enter edited-by-guide', async () => {
      await body.fill(replacement);
      await expect(body).toHaveValue(replacement);
    });
    await media.step('12-sent-forward', 'Forward edited，核对源站和echo / Forward the edited text and verify its echo', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      await client!.waitForText(replacement);
      expect(webSocketTrafficRunner.hasMessage(replacement)).toBe(true);
      expect(webSocketTrafficRunner.hasMessage(editOriginal)).toBe(false);
      expect(client!.hasText(editOriginal)).toBe(false);
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('13-sent-drop-target', '发送 do-not-forward 并暂停 / Pause do-not-forward', async () => {
      client!.sendText(dropped);
      await assertPaused(dropped);
    });
    await media.step('14-sent-drop', 'Drop 发送帧 / Drop the sent frame', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop).click();
      await expect(pendingRows).toHaveCount(0);
      expect(webSocketTrafficRunner.hasMessage(dropped)).toBe(false);
      expect(client!.hasText(dropped)).toBe(false);
    });
    await media.step('15-disable-sent', '停用 Sent 设置 / Disable the Sent configuration', async () => {
      await toggle.click();
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('16-received-setup', '重新打开连接设置 / Reopen connection settings', async () => {
      await toggle.click();
      await assertTextOnly();
    });
    await media.step('17-received-direction', '选择 Received / Choose Received messages', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.received).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.received)).toHaveAttribute('aria-checked', 'true');
      await assertTextOnly();
    });
    await media.step('18-enable-received', '启用 Received 文本断点 / Enable Received message breakpoints', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable)).toBeHidden();
    });
    await media.step('19-received-original', '源站发送 server-original / Pause server-original from the origin', async () => {
      webSocketTrafficRunner.sendFromOrigin(serverOriginal);
      await assertPaused(serverOriginal);
    });
    await media.step('20-received-unmodified', 'Continue unmodified 原样接收 / Continue the received text unmodified', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await client!.waitForText(serverOriginal);
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('21-received-edit-target', '源站发送 server-edit-this / Pause server-edit-this', async () => {
      webSocketTrafficRunner.sendFromOrigin(serverEditOriginal);
      await assertPaused(serverEditOriginal);
    });
    await media.step('22-received-text', '选择接收帧的 Text / Choose Text for the received frame', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await expect(body).toBeVisible();
    });
    await media.step('23-received-edit', '输入 server-edited-by-guide / Enter server-edited-by-guide', async () => {
      await body.fill(serverReplacement);
      await expect(body).toHaveValue(serverReplacement);
    });
    await media.step('24-received-forward', 'Forward edited，客户端收到替换文本 / Forward the replacement to the client', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      await client!.waitForText(serverReplacement);
      expect(client!.hasText(serverEditOriginal)).toBe(false);
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('25-received-drop-target', '源站发送 server-do-not-forward / Pause server-do-not-forward', async () => {
      webSocketTrafficRunner.sendFromOrigin(serverDropped);
      await assertPaused(serverDropped);
    });
    await media.step('26-received-drop', 'Drop 接收帧 / Drop the received frame', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop).click();
      await expect(pendingRows).toHaveCount(0);
      expect(client!.hasText(serverDropped)).toBe(false);
    });
    await media.step('27-disable-received', '关闭连接断点 / Disable connection breakpoints', async () => {
      await toggle.click();
      await expect(pendingRows).toHaveCount(0);
    });
    await media.step('28-after-disabled', '核对关闭后正常echo / Verify normal echo after disabling', async () => {
      client!.sendText(afterDisabled);
      await client!.waitForText(afterDisabled);
      expect(webSocketTrafficRunner.hasMessage(afterDisabled)).toBe(true);
      expect(webSocketTrafficRunner.hasMessage(dropped)).toBe(false);
      expect(client!.hasText(dropped)).toBe(false);
      expect(client!.hasText(serverDropped)).toBe(false);
      await expect(pendingRows).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');
    });
    await media.step('29-close-client', '正常关闭示例连接 / Close the example connection normally', async () => {
      await client!.closeGracefully(1000, 'guide-finished');
      await expect.poll(() => webSocketTrafficRunner.latestCloseCode()).toBe(1000);
      expect(client!.isClosed()).toBe(true);
    });
  } finally {
    // 证据与清理：保存双端消息事实；失败只销毁本轮client，App由driver正常Close并核对系统恢复。
    // Evidence and cleanup: retain both endpoints' facts; only destroy an owned failed client and let the driver verify normal App Close.
    if (client && !client.isClosed()) client.destroy();
    await media.stop({
      path: requestPath, original, editOriginal, replacement, dropped,
      serverOriginal, serverEditOriginal, serverReplacement, serverDropped, afterDisabled,
      origin: `ws://127.0.0.1:${webSocketTrafficRunner.port}${requestPath}`,
      directions: 'client-to-server, server-to-client', frames: 'message',
    });
    const evidencePath = testInfo.outputPath('websocket-wire-evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      origin: webSocketTrafficRunner.evidence(),
      received: Object.fromEntries([original, editOriginal, replacement, dropped, serverOriginal,
        serverEditOriginal, serverReplacement, serverDropped, afterDisabled].map(text => [text, client?.hasText(text) ?? false])),
      clientClosed: client?.isClosed() ?? false,
    }, null, 2), 'utf8');
    await testInfo.attach('websocket-wire-evidence', { path: evidencePath, contentType: 'application/json' });
  }
});
