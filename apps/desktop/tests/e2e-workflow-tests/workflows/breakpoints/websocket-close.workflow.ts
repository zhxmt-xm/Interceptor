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

test('breakpoints.websocket-close forwards a close-code-only edit end to end', async ({
  desktopApp,
  webSocketTrafficRunner: webSocketLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.websocket-close',
  });

  const { page } = desktopApp;
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
  await row.click();
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
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointEnable,
  ).click();

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

  // 暂停行必须由同一层flex负责居中，不以中心坐标或字形像素容差替代布局规则。
  // The pause row uses flex centering; geometry and glyph tolerances do not replace the layout contract.
  const pauseContext = getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).locator('xpath=ancestor::div[1]');
  await expect(pauseContext).toHaveCSS('display', 'flex');
  await expect(pauseContext).toHaveCSS('align-items', 'center');
  await expect(pauseContext.locator(':scope > span').first()).toHaveCSS('align-items', 'center');

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
  await collapseReplacement.click();
  await expect(replacementBlocks).toHaveCount(2);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('websocket-pause-layout.png') });
  await closeCode.fill('1001');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();

  await expect.poll(() => webSocketLab.latestCloseCode()).toBe(1001);
  await testInfo.attach('websocket-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
