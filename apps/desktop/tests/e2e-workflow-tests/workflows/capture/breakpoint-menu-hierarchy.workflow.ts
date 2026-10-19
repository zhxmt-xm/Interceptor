import { writeFile } from 'node:fs/promises';

import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** 从公开Capture row automation ID提取Core exchange ID。 */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

test('capture.breakpoint-menu-hierarchy aligns Block and Breakpoint labels', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.breakpoint-menu-hierarchy',
  });

  const { page } = desktopApp;

  // 真实Recording与显式代理请求创建一个可打开右键菜单的Capture行。
  // Create one Capture row for a real context-menu interaction through Recording and an explicit proxy request.
  await startRecording(desktopApp);
  const requestPath = '/e2e/capture/breakpoint-menu-hierarchy';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
  )).resolves.toMatchObject({ statusCode: 200 });

  const row = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: requestPath }).last();
  await expect(row).toBeVisible();
  const capturedExchangeId = await exchangeId(row);
  await row.click({ button: 'right' });
  await screenshotStep('真实Recording与显式代理请求创建一个可打开右键菜单的Capture行。 / Create one Capture row for a real context-menu interaction through Recording and an explicit proxy request.');

  // 直接比较语义label左缘；不同DOM层级会稳定暴露约7.4px偏移，不能用截图肉眼代替。
  // Compare semantic-label left edges directly; distinct DOM levels expose the stable ~7.4 px offset without visual guessing.
  const block = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'block'),
  );
  const breakpoint = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'breakpoint'),
  );
  await expect(block).toBeVisible();
  await expect(breakpoint).toBeVisible();
  let blockBox = await block.boundingBox();
  let breakpointBox = await breakpoint.boundingBox();
  await expect.poll(async () => {
    blockBox = await block.boundingBox();
    breakpointBox = await breakpoint.boundingBox();
    return blockBox && breakpointBox
      ? Math.abs(blockBox.x - breakpointBox.x)
      : Number.POSITIVE_INFINITY;
  }, {
    message: 'Block and Breakpoint labels did not settle on the same left edge.',
  }).toBeLessThan(1);
  expect(blockBox).not.toBeNull();
  expect(breakpointBox).not.toBeNull();
  const labelLeftDelta = Math.abs(blockBox!.x - breakpointBox!.x);
  await screenshotStep('直接比较语义label左缘；不同DOM层级会稳定暴露约7.4px偏移，不能用截图肉眼代替。 / Compare semantic-label left edges directly; distinct DOM levels expose the stable ~7.4 px offset without visual guessing.');

  // 同组重排不能破坏Ant原生hover submenu；endpoint项仍由公开动态ID定位。
  // Regrouping must preserve Ant's native hover submenu and its public endpoint identity.
  await breakpoint.hover();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint'),
  )).toBeVisible();
  await page.keyboard.press('Escape');
  await screenshotStep('同组重排不能破坏Ant原生hover submenu；endpoint项仍由公开动态ID定位。 / Regrouping must preserve Ant\'s native hover submenu and its public endpoint identity.');

  // 保存几何证据；fixture随后正常Close并验证Main/Core、8888与系统代理恢复。
  // Save geometry evidence; the fixture then verifies normal Close, Main/Core, port 8888, and proxy restoration.
  const evidencePath = testInfo.outputPath('capture-breakpoint-menu-hierarchy.json');
  await writeFile(evidencePath, JSON.stringify({
    exchangeId: capturedExchangeId,
    blockLeft: blockBox!.x,
    breakpointLeft: breakpointBox!.x,
    labelLeftDelta,
  }, null, 2), 'utf8');
  await testInfo.attach('capture-breakpoint-menu-hierarchy', {
    path: evidencePath,
    contentType: 'application/json',
  });
});