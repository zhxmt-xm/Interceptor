import { writeFile } from 'node:fs/promises';

import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

interface GeometryBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Extract the stable Core exchange ID exposed by one public Capture row ID. */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

/** Return a non-zero content rectangle when Ant gives the label wrapper no box. */
async function visibleContentBox(locator: Locator): Promise<GeometryBox | null> {
  const boxes = await locator.evaluateAll((elements) => elements.flatMap((element) => (
    [element, ...element.querySelectorAll('*')]
  )).map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  return boxes.find((box) => box.width > 0 && box.height > 0) ?? null;
}

test('capture breakpoint submenu preserves its parent lifecycle', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.breakpoint-submenu-lifecycle',
  });

  // 准备真实Capture行，并在行右边界打开context menu以强制测试贴边翻转。
  // Arrange a real Capture row and open its context menu at the right edge to force overflow flipping.
  const { page } = desktopApp;
  await startRecording(desktopApp);
  const requestPath = '/e2e/capture/breakpoint-submenu-lifecycle';
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
  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();
  await row.click({
    button: 'right',
    position: {
      x: Math.max(1, rowBox!.width - 2),
      y: Math.max(1, rowBox!.height / 2),
    },
  });
  await screenshotStep('准备真实Capture行，并在行右边界打开context menu以强制测试贴边翻转。 / Arrange a real Capture row and open its context menu at the right edge to force overflow flipping.');

  // Hover展开时父菜单和二级菜单必须共存；二级菜单在右边界向左翻转且不越界。
  // Hover must keep parent and child mounted together; the child flips left at the right boundary without overflow.
  const rootMenu = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.contextMenu.root,
  );
  const breakpointTrigger = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'breakpoint'),
  );
  const block = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'block'),
  );
  const breakpointSubmenu = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.contextMenu.breakpointSubmenu,
  );
  const endpoint = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint'),
  );
  await expect(rootMenu).toBeVisible();
  await breakpointTrigger.hover();
  await expect(breakpointSubmenu).toBeVisible();
  await expect(endpoint).toBeVisible();
  await expect(rootMenu).toBeVisible();
  await endpoint.hover();
  await expect(rootMenu).toBeVisible();

  const appBox = await getByAutomationId(
    page,
    AUTOMATION_IDS.app.root,
  ).boundingBox();
  const triggerBox = await breakpointTrigger.boundingBox();
  const endpointBox = await visibleContentBox(endpoint);
  expect(appBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(endpointBox).not.toBeNull();
  expect(endpointBox!.x).toBeLessThan(triggerBox!.x);
  for (const box of [triggerBox!, endpointBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(appBox!.x);
    expect(box.y).toBeGreaterThanOrEqual(appBox!.y);
    expect(box.x + box.width).toBeLessThanOrEqual(appBox!.x + appBox!.width);
    expect(box.y + box.height).toBeLessThanOrEqual(appBox!.y + appBox!.height);
  }
  await screenshotStep('Hover展开时父菜单和二级菜单必须共存；二级菜单在右边界向左翻转且不越界。 / Hover must keep parent and child mounted together; the child flips left at the right boundary without overflow.');

  // 指针可进入二级菜单；回到根菜单只关闭二级，再次hover可重新打开。
  // The pointer can enter the child; returning to the parent closes only the child, and hover reopens it.
  await block.hover();
  await expect(breakpointSubmenu).not.toBeVisible();
  await expect(rootMenu).toBeVisible();
  await breakpointTrigger.hover();
  await expect(endpoint).toBeVisible();
  await screenshotStep('指针可进入二级菜单；回到根菜单只关闭二级，再次hover可重新打开。 / The pointer can enter the child; returning to the parent closes only the child, and hover reopens it.');

  // Escape与outside click都必须销毁整棵菜单，而不是留下任一portal。
  // Escape and outside click must dismiss the whole menu tree without leaving either portal.
  await page.keyboard.press('Escape');
  await expect(rootMenu).not.toBeVisible();
  await expect(breakpointSubmenu).not.toBeVisible();

  await row.click({ button: 'right' });
  await breakpointTrigger.hover();
  await expect(endpoint).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.app.statusbar).click();
  await expect(rootMenu).not.toBeVisible();
  await expect(breakpointSubmenu).not.toBeVisible();
  await screenshotStep('Escape与outside click都必须销毁整棵菜单，而不是留下任一portal。 / Escape and outside click must dismiss the whole menu tree without leaving either portal.');

  // 保存语言无关的共存与翻转证据；fixture随后验证销毁和系统代理恢复。
  // Save language-neutral coexistence and flip evidence; the fixture then verifies teardown and proxy restoration.
  const evidencePath = testInfo.outputPath('capture-breakpoint-submenu-lifecycle.json');
  await writeFile(evidencePath, JSON.stringify({
    exchangeId: capturedExchangeId,
    breakpointTrigger: triggerBox,
    endpointItem: endpointBox,
    flippedLeft: endpointBox!.x < triggerBox!.x,
    escapeDismissed: true,
    outsideClickDismissed: true,
  }, null, 2), 'utf8');
  await testInfo.attach('capture-breakpoint-submenu-lifecycle', {
    path: evidencePath,
    contentType: 'application/json',
  });
});