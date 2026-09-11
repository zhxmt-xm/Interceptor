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
  await closeCode.fill('1001');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();

  await expect.poll(() => webSocketLab.latestCloseCode()).toBe(1001);
  await testInfo.attach('websocket-origin-observation', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
