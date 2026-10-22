import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('breakpoints.websocket-close forwards a close-code-only edit end to end', async ({
  desktopApp,
  webSocketTrafficRunner: webSocketLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.websocket-close',
  });

  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/websocket-');
  const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
  for (let index = 0; index < await facetToggles.count(); index += 1) {
    const toggle = facetToggles.nth(index);
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  }
  await startRecording(desktopApp);
  const requestPath = '/e2e/websocket-close';
  const client = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    requestPath,
  );

  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.tab.messages,
  ).click();

  // 建立真实历史消息，验证38px分隔行和暂停后的内部滚动，而不是裁掉历史内容。
  // Create real history frames to verify 38px rows and scrolling while a frame is paused.
  for (const index of [0, 1, 2, 3]) {
    const message = `${requestPath}/history-${index}`;
    webSocketLab.sendFromOrigin(message);
    await client.waitForText(message);
  }
  const historyRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.websocketFrame);
  await expect(historyRows).toHaveCount(4);
  for (const historyRow of await historyRows.all()) {
    await expect(historyRow).toHaveCSS('height', '38px');
  }
  const frameScroll = historyRows.first().locator('..').locator('..').locator('..');

  const breakpointToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  );
  const toggleScreenshot = testInfo.outputPath('websocket-breakpoint-toggle.png');
  await page.screenshot({ path: toggleScreenshot });
  await testInfo.attach('websocket-breakpoint-toggle', { path: toggleScreenshot, contentType: 'image/png' });
  await expect(breakpointToggle).toHaveCSS('width', '30px');
  await expect(breakpointToggle).toHaveCSS('height', '30px');
  const border = await breakpointToggle.evaluate((button) => ({
    width: Number.parseFloat(getComputedStyle(button).borderTopWidth),
    pixelRatio: window.devicePixelRatio,
  }));
  expect(border.width * border.pixelRatio).toBeCloseTo(Math.max(1, Math.floor(border.pixelRatio)), 4);
  await expect(breakpointToggle).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await screenshotStep('在Messages打开WebSocket断点设置 / Open WebSocket breakpoint settings from Messages', {
    highlights: [{ target: breakpointToggle, label: '1' }],
  });
  await breakpointToggle.click();
  const messageFrame = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointFrame.message,
  );
  const closeFrame = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointFrame.close,
  );
  await expect(messageFrame).toHaveAttribute('aria-pressed', 'true');
  await messageFrame.click();
  await closeFrame.click();
  await expect(closeFrame).toHaveAttribute('aria-pressed', 'true');
  await screenshotStep('选择Close帧并准备启用 / Select Close frames before enabling', {
    highlights: [
      { target: closeFrame, label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable), label: '2' },
    ],
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointEnable,
  ).click();
  await screenshotStep('建立真实历史消息，验证38px分隔行和暂停后的内部滚动，而不是裁掉历史内容。 / Create real history frames to verify 38px rows and scrolling while a frame is paused.');

  // 已启用按钮的hover必须保留黄色状态，不被共享图标按钮的默认反馈覆盖。
  // An armed button keeps its warning appearance on hover instead of inheriting the generic icon feedback.
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable)).toBeHidden();
  await page.mouse.move(0, 0);
  const armedStyle = await breakpointToggle.evaluate((button) => {
    const computed = getComputedStyle(button);
    return { color: computed.color, background: computed.backgroundColor };
  });
  await breakpointToggle.hover();
  await expect(breakpointToggle).toHaveCSS('color', armedStyle.color);
  await expect(breakpointToggle).toHaveCSS('background-color', armedStyle.background);

  client.sendCloseFrame(1000);
  const closeCode = getByAutomationId(page, AUTOMATION_IDS.breakpoints.closeCode);
  await expect(closeCode).toBeVisible();
  await expect(closeCode).toHaveValue('1000');
  await expect(frameScroll.locator('..')).toHaveCSS('height', '126px');
  await frameScroll.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => frameScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const pausedFrame = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending);
  await expect(pausedFrame).toHaveCount(1);
  await expect(pausedFrame).toBeInViewport({ ratio: 0.9 });
  await pausedFrame.click();
  await screenshotStep('选中挂起的Close帧并读取关闭码 / Select the paused Close frame and inspect its code', {
    highlights: [{ target: closeCode, label: '1' }],
  });
  await screenshotStep('已启用按钮的hover必须保留黄色状态，不被共享图标按钮的默认反馈覆盖。 / An armed button keeps its warning appearance on hover instead of inheriting the generic icon feedback.');

  // 暂停行必须由同一层flex负责居中，不以中心坐标或字形像素容差替代布局规则。
  // The pause row uses flex centering; geometry and glyph tolerances do not replace the layout contract.
  const pauseContext = getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).locator('xpath=ancestor::div[1]');
  await expect(pauseContext).toHaveCSS('display', 'flex');
  await expect(pauseContext).toHaveCSS('align-items', 'center');
  await expect(pauseContext.locator(':scope > span').first()).toHaveCSS('align-items', 'center');
  await screenshotStep('暂停行必须由同一层flex负责居中，不以中心坐标或字形像素容差替代布局规则。 / The pause row uses flex centering; geometry and glyph tolerances do not replace the layout contract.');

  // 替换标题由模式控件决定高度，折叠图标不得用30px按钮把它撑高。
  // The mode control sets the replacement heading height; the collapse icon must not enlarge it.
  const replacementHeader = getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.replacement.off,
  ).locator('..').locator('..');
  await expect(replacementHeader).toHaveCSS('height', '36px');
  const collapseReplacement = replacementHeader.locator(':scope > button');
  await expect(collapseReplacement).toHaveCSS('width', '13px');
  await expect(collapseReplacement).toHaveCSS('height', '13px');
  const replacementBlocks = replacementHeader.locator('..').locator(':scope > div');
  await expect(replacementBlocks).toHaveCount(2);
  await collapseReplacement.click();
  await expect(replacementBlocks).toHaveCount(1);
  await screenshotStep('收起Replacement区域 / Collapse the Replacement section');
  await collapseReplacement.click();
  await expect(replacementBlocks).toHaveCount(2);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('websocket-pause-layout.png') });
  await closeCode.fill('1001');
  await screenshotStep('只修改关闭码后Forward edited / Forward an edit that changes only the close code', {
    highlights: [
      { target: closeCode, label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  const sentCloseId = await pausedFrame.getAttribute('data-automation-id');
  if (sentCloseId === null) throw new Error('The paused Close frame has no public identifier.');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();

  await expect.poll(() => webSocketLab.latestCloseCode()).toBe(1001);
  await testInfo.attach('websocket-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
  await screenshotStep('替换标题由模式控件决定高度，折叠图标不得用30px按钮把它撑高。 / The mode control sets the replacement heading height; the collapse icon must not enlarge it.');

  // Release the returning Close before moving the active configuration to another connection.
  // 将活动配置移到另一连接前，先放行返回方向的Close。
  await expect(pausedFrame).toHaveCount(1);
  await expect(pausedFrame).not.toHaveAttribute('data-automation-id', sentCloseId);
  await expect(closeCode).toHaveValue('1001');
  await screenshotStep('Both中的返回Close仍需单独放行 / Continue the returning Close separately in Both mode', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect(pausedFrame).toHaveCount(0);
  await screenshotStep('两个Close方向均已处理 / Both Close directions have been resolved');

  // 用户操作：另一真实连接使用Both，补充空Text和ping/pong，不重跑关闭码场景。
  // User actions: use Both on another real connection to verify empty Text and ping/pong without repeating close-code coverage.
  const controlPath = '/e2e/websocket-controls';
  const controlClient = await webSocketLab.openThroughProxy(desktopApp.capturePort(), controlPath);
  const pongs: string[] = [];
  controlClient.on('pong', (bytes: Buffer) => pongs.push(bytes.toString('utf8')));
  await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: controlPath }).last().click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await breakpointToggle.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.both).click();
  for (const kind of ['message', 'ping', 'pong'] as const) {
    const option = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame[kind]);
    if (await option.getAttribute('aria-pressed') !== 'true') await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }
  await screenshotStep('为Both方向启用Message、Ping和Pong / Enable Message, Ping and Pong in Both directions', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.both), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  controlClient.sendText('e2e-before-empty');
  await expect(pausedFrame).toHaveCount(1);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('');
  await screenshotStep('WebSocket明确使用空Text替换 / Explicitly replace a WebSocket message with empty Text', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '2' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '3' },
    ],
  });
  const sentId = await pausedFrame.getAttribute('data-automation-id');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect.poll(() => webSocketLab.hasMessage('')).toBe(true);
  expect(webSocketLab.hasMessage('e2e-before-empty')).toBe(false);
  await expect(pausedFrame).toHaveCount(1);
  await expect(pausedFrame).not.toHaveAttribute('data-automation-id', sentId!);
  expect(controlClient.hasText('')).toBe(false);
  await screenshotStep('Both的返回方向仍独立暂停 / The return direction remains independently paused in Both mode');
  await screenshotStep('单独放行返回方向的消息 / Continue the return-direction message separately', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await controlClient.waitForText('');
  await expect(pausedFrame).toHaveCount(0);
  controlClient.sendPing('e2e-control-ping');
  await expect(pausedFrame).toHaveCount(1);
  await expect(pausedFrame).toContainText('ping', { ignoreCase: true });
  expect(pongs).toEqual([]);
  await screenshotStep('ping控制帧等待明确放行 / The ping control frame waits for an explicit continue', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect(pausedFrame).toHaveCount(1);
  await expect(pausedFrame).toContainText('pong', { ignoreCase: true });
  expect(pongs).toEqual([]);
  await screenshotStep('Pong仍需独立放行 / Pong still requires its own Continue', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect.poll(() => pongs).toEqual(['e2e-control-ping']);
  await expect(pausedFrame).toHaveCount(0);
  await screenshotStep('依次放行ping和pong后核对客户端 / Verify the client after continuing ping and pong in order');
  await breakpointToggle.click();
  controlClient.sendText('e2e-controls-disabled');
  await controlClient.waitForText('e2e-controls-disabled');
  await expect(pausedFrame).toHaveCount(0);
  await screenshotStep('停用WebSocket断点后新消息直接通过 / New messages pass directly after WebSocket breakpoints are disabled');

  // Exercise normal text frames in each direction with real delivery barriers after Drop.
  // 分别操作两个方向的普通文本帧，并在Drop后用真实送达消息确认未误转发。
  for (const direction of ['sent', 'received'] as const) {
    await breakpointToggle.click();
    const directionControl = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection[direction]);
    await directionControl.click();
    for (const kind of ['message', 'ping', 'pong', 'close'] as const) {
      const frameControl = getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointFrame[kind]);
      const selected = await frameControl.getAttribute('aria-pressed') === 'true';
      if (selected !== (kind === 'message')) await frameControl.click();
    }
    await screenshotStep(`为${direction}方向配置普通Message断点 / Configure ${direction} Message breakpoints`, {
      highlights: [
        { target: directionControl, label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
    const send = (text: string): void => {
      if (direction === 'sent') controlClient.sendText(text);
      else webSocketLab.sendFromOrigin(text);
    };
    const original = `e2e-${direction}-original`;
    send(original);
    await expect(pausedFrame).toHaveCount(1);
    await pausedFrame.click();
    await screenshotStep(`原样放行${direction}文本 / Continue ${direction} text unchanged`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
    await controlClient.waitForText(original);
    await expect(pausedFrame).toHaveCount(0);
    await screenshotStep(`${direction}原文已送达 / The original ${direction} text is delivered`);

    const beforeEdit = `e2e-${direction}-before-edit`;
    const edited = `e2e-${direction}-edited`;
    send(beforeEdit);
    await expect(pausedFrame).toHaveCount(1);
    await pausedFrame.click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(edited);
    await screenshotStep(`编辑${direction}文本并准备转发 / Edit ${direction} text before forwarding`, {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text), label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '2' },
        { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '3' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    await controlClient.waitForText(edited);
    expect(controlClient.hasText(beforeEdit)).toBe(false);
    if (direction === 'sent') {
      expect(webSocketLab.hasMessage(edited)).toBe(true);
      expect(webSocketLab.hasMessage(beforeEdit)).toBe(false);
    }
    await expect(pausedFrame).toHaveCount(0);
    await screenshotStep(`${direction}替换内容已送达 / The replacement ${direction} text is delivered`);

    const dropped = `e2e-${direction}-drop`;
    send(dropped);
    await expect(pausedFrame).toHaveCount(1);
    await pausedFrame.click();
    await screenshotStep(`丢弃当前${direction}文本帧 / Drop the current ${direction} text frame`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop).click();
    await expect(pausedFrame).toHaveCount(0);
    await breakpointToggle.click();
    const barrier = `e2e-${direction}-after-disable`;
    send(barrier);
    await controlClient.waitForText(barrier);
    expect(controlClient.hasText(dropped)).toBe(false);
    if (direction === 'sent') expect(webSocketLab.hasMessage(dropped)).toBe(false);
    await screenshotStep(`停用${direction}拦截后新消息正常通过 / New ${direction} messages pass after disabling the breakpoint`);
  }
  await testInfo.attach('websocket-message-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
