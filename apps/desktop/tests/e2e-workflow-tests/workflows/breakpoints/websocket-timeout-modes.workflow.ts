import type { Locator, Page, TestInfo } from '@playwright/test';

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
import type { WebSocketLab } from '../../fixtures/websocket-lab';

const CUSTOM_TIMEOUT_SECONDS = '1';
const WAIT_BEYOND_CUSTOM_TIMEOUT_MS = 1_500;

/** Select one public option without depending on translated labels. */
async function selectOption(
  select: Locator,
  option: Locator,
): Promise<void> {
  await select.click();
  await option.click();
}

/** Wait the complete finite-timeout window before asserting an origin message is still absent. */
async function waitBeyondCustomTimeout(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, WAIT_BEYOND_CUSTOM_TIMEOUT_MS));
}

/** Open the current connection's public WebSocket breakpoint setup. */
async function openBreakpointSetup(page: Page): Promise<void> {
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  ).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointTimeout,
  )).toBeVisible();
}

/** Attach real WebSocket origin observations for both timeout modes. */
async function attachOriginEvidence(
  webSocketLab: WebSocketLab,
  testInfo: TestInfo,
): Promise<void> {
  await testInfo.attach('websocket-timeout-origin-observations', {
    body: Buffer.from(JSON.stringify(webSocketLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
}

test('breakpoints.websocket-timeout-modes enforces explicit infinite and finite waits', async ({
  desktopApp,
  webSocketLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.websocket-timeout-modes',
  });

  // 中文：通过真实UI开始Recording，并让测试自产WebSocket连接经过8888。
  // English: Start Recording through the real UI and route a test-owned WebSocket through 8888.
  const { page } = desktopApp;
  await startRecording(desktopApp);
  const requestPath = '/e2e/websocket-timeout-modes';
  const client = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    requestPath,
  );
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await openBreakpointSetup(page);

  // 中文：Custom=0必须显示错误并阻断Enable；正整数1恢复可提交。
  // English: Custom zero must show an error and block Enable; positive integer 1 restores submission.
  const timeout = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointTimeout,
  );
  await selectOption(
    timeout,
    getByAutomationId(
      page,
      AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.custom,
    ),
  );
  const customSeconds = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointCustomTimeout,
  );
  const timeoutError = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointTimeoutError,
  );
  const enable = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointEnable,
  );
  await customSeconds.fill('0');
  await expect(customSeconds).toHaveAttribute('aria-invalid', 'true');
  await expect(timeoutError).toBeVisible();
  await expect(enable).toBeDisabled();
  await customSeconds.fill(CUSTOM_TIMEOUT_SECONDS);
  await expect(customSeconds).toHaveAttribute('aria-invalid', 'false');
  await expect(timeoutError).toHaveCount(0);
  await expect(enable).toBeEnabled();

  // 中文：改选No timeout并发送消息；超过有限时长后仍不得触达origin。
  // English: Select No timeout and send a message; it must not reach the origin after the finite window.
  await selectOption(
    timeout,
    getByAutomationId(
      page,
      AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.none,
    ),
  );
  await enable.click();
  const infiniteMessage = 'infinite-waits-for-user';
  client.sendText(infiniteMessage);
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.continueUnmodified,
  )).toBeVisible();
  await waitBeyondCustomTimeout();
  expect(webSocketLab.hasMessage(infiniteMessage)).toBe(false);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect.poll(() => webSocketLab.hasMessage(infiniteMessage)).toBe(true);

  // 中文：停用后重新配置Custom=1秒；不做人工释放时固定Continue应原样转发。
  // English: Disable and reconfigure Custom 1 second; fixed Continue must forward unchanged without user release.
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  ).click();
  await openBreakpointSetup(page);
  await selectOption(
    timeout,
    getByAutomationId(
      page,
      AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.custom,
    ),
  );
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointCustomTimeout,
  ).fill(CUSTOM_TIMEOUT_SECONDS);
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointEnable,
  ).click();
  const finiteMessage = 'finite-continues-after-timeout';
  client.sendText(finiteMessage);
  await expect.poll(() => webSocketLab.hasMessage(finiteMessage), {
    timeout: 5_000,
  }).toBe(true);

  // 中文：停用断点后再发一条消息，证明超时没有破坏当前连接或帧顺序。
  // English: Disable the breakpoint and send another message, proving timeout preserved the connection and order.
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.websocket.breakpointToggle,
  ).click();
  const afterTimeoutMessage = 'connection-remains-usable';
  client.sendText(afterTimeoutMessage);
  await expect.poll(() => webSocketLab.hasMessage(afterTimeoutMessage)).toBe(true);

  // 中文：保存真实socket证据；fixture随后负责产品Close、进程销毁和系统副作用恢复。
  // English: Save real-socket evidence; the fixture then owns product Close, teardown, and side-effect recovery.
  await attachOriginEvidence(webSocketLab, testInfo);
});
