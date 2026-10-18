import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoints guide records Both directions, empty WebSocket Text, ping/pong and close-code edits', async ({
  desktopApp, webSocketTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const requestPath = '/guide/websocket-controls';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const paused = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  const toggle = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle);
  let client: Awaited<ReturnType<typeof webSocketTrafficRunner.openThroughProxy>> | undefined;
  let closeOutcome: Promise<unknown> | undefined;
  const pongs: Buffer[] = [];
  const closes: Array<{ code: number; reason: string }> = [];
  const waitHead = async (kind: string): Promise<void> => {
    await expect(paused).toHaveCount(1);
    await expect(paused).toHaveAttribute('data-breakpoint-state', 'head');
    await expect(paused).toContainText(kind, { ignoreCase: true });
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
  };
  // 准备：只连接自有WebSocket源站，所有原始和替换载荷均为公开字符串。
  // Arrange: connect only to the owned WebSocket origin with public original/replacement payloads.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-websocket-controls');
  try {
    await media.step('01-connect', '建立控制帧演示连接 / Open the control-frame example connection', async () => {
      client = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), requestPath);
      client.on('pong', (data: Buffer) => pongs.push(Buffer.from(data)));
      client.on('close-frame', (code: number, reason: Buffer) => closes.push({ code, reason: reason.toString('utf8') }));
      await expect(rows).toHaveCount(1);
    });
    await media.step('02-select', '选中本轮连接 / Select this connection', async () => { await rows.click(); });
    await media.step('03-messages', '打开Messages / Open Messages', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    });
    await media.step('04-setup', '打开连接断点设置 / Open connection breakpoint settings', async () => { await toggle.click(); });
    await media.step('05-both', '选择Both方向 / Select Both directions', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.both).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.both)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('06-ping', '增加ping帧 / Include ping frames', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.ping).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.ping)).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('07-pong', '增加pong帧 / Include pong frames', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.pong).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.pong)).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('08-enable', '启用Both消息与ping/pong / Enable Both message and ping/pong breakpoints', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable)).toBeHidden();
    });
    await media.step('09-text', '发送非空消息并暂停 / Send and pause a non-empty message', async () => {
      client!.sendText('guide-before-empty');
      await expect(paused).toHaveCount(1);
      await expect(paused).toContainText('guide-before-empty');
      expect(webSocketTrafficRunner.hasMessage('guide-before-empty')).toBe(false);
    });
    await media.step('10-empty-mode', '选择Text替换 / Choose Text replacement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    });
    await media.step('11-empty-value', '明确填写空Text / Explicitly leave Text empty', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('');
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('');
    });
    let sentId = '';
    await media.step('12-empty-forward', '发送空消息而不是保留原文 / Forward an empty message instead of keeping the original', async () => {
      sentId = await paused.getAttribute('data-automation-id') ?? '';
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      await expect.poll(() => webSocketTrafficRunner.hasMessage('')).toBe(true);
      expect(webSocketTrafficRunner.hasMessage('guide-before-empty')).toBe(false);
      await expect(paused).toHaveCount(1);
      await expect(paused).not.toHaveAttribute('data-automation-id', sentId);
      expect(client!.hasText('')).toBe(false);
    });
    await media.step('13-empty-echo', '放行Both中的返回方向 / Continue the return direction in Both mode', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await client!.waitForText('');
      await expect(paused).toHaveCount(0);
    });
    await media.step('14-send-ping', '发送guide-ping并暂停 / Send and pause guide-ping', async () => {
      client!.sendPing('guide-ping');
      await waitHead('ping');
      expect(pongs).toHaveLength(0);
    });
    await media.step('15-continue-ping', '原样放行ping / Continue ping unchanged', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await waitHead('pong');
      expect(pongs).toHaveLength(0);
    });
    await media.step('16-continue-pong', '原样放行返回pong / Continue the returning pong unchanged', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await expect.poll(() => pongs.map(value => value.toString('utf8'))).toEqual(['guide-ping']);
      await expect(paused).toHaveCount(0);
    });
    await media.step('17-disable-both', '停用本轮Both设置 / Disable the current Both settings', async () => {
      await toggle.click();
      client!.sendText('guide-unpaused');
      await client!.waitForText('guide-unpaused');
      await expect(paused).toHaveCount(0);
    });
    await media.step('18-close-setup', '重新打开连接设置 / Open connection settings again', async () => { await toggle.click(); });
    await media.step('19-close-sent', '关闭演示只选择Sent / Select Sent for the close example', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.sent).click();
    });
    for (const frame of ['message', 'ping', 'pong'] as const) {
      await media.step(`20-${frame}-off`, `不再暂停${frame} / Stop pausing ${frame}`, async () => {
        const option = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame[frame]);
        if (await option.getAttribute('aria-pressed') === 'true') await option.click();
        await expect(option).toHaveAttribute('aria-pressed', 'false');
      });
    }
    await media.step('21-close-on', '选择close控制帧 / Select close control frames', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.close).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame.close)).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('22-enable-close', '启用Sent close断点 / Enable the Sent close breakpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
    });
    await media.step('23-close-request', '客户端请求以1000关闭 / Ask the client to close with code 1000', async () => {
      closeOutcome = client!.closeGracefully(1000, 'guide-close').then(() => ({ kind: 'closed' }),
        (error: unknown) => ({ kind: 'error', message: error instanceof Error ? error.message : String(error) }));
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.closeCode)).toHaveValue('1000');
      await expect(paused).toHaveCount(1);
    });
    await media.step('24-close-code', '只将关闭码改为1001 / Change only the close code to 1001', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.closeCode).fill('1001');
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('25-close-forward', '核对源站修改和客户端实际关闭确认 / Verify the origin edit and the actual client close acknowledgement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      expect(await closeOutcome).toEqual({ kind: 'closed' });
      expect(webSocketTrafficRunner.latestCloseCode()).toBe(1001);
      expect(closes).toContainEqual({ code: 1000, reason: 'guide-close' });
      await expect(paused).toHaveCount(0);
    });
    // 证据：空Text产生零字节消息，Both分别放行两个方向；ping/pong与close都是真实协议帧。
    // Evidence: empty Text creates a zero-byte message; Both resolves each direction, and ping/pong/close are actual wire frames.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (await paused.count() > 0) {
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue).click();
      }
      if (client && !client.isClosed()) await client.closeGracefully(1000, 'guide-cleanup');
      await closeOutcome;
    } finally {
      await media.stop({
        path: requestPath, originalMessage: 'guide-before-empty', replacement: 'empty Text produces an empty WebSocket message',
        directions: 'Both for message and ping/pong; Sent only for close', ping: 'guide-ping',
        afterDisabled: 'guide-unpaused is delivered without any pending item',
        originalClose: '1000, guide-close', forwardedClose: '1001, guide-close',
        clientAcknowledgement: 'The client-side close acknowledgement is 1000; do not equate both connection directions',
      });
    }
  }
  // 清理：客户端正常关闭，driver验证App退出、代理、CA和8888恢复。
  // Cleanup: the client closes normally; the driver verifies App exit, proxy/CA and port 8888 restoration.
});
