import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

test('breakpoints.websocket-close forwards a close-code-only edit end to end', async ({
  desktopApp,
  webSocketLab,
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

  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  ).click();
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

  client.sendClose(1000);
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
