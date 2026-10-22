import { writeFile } from 'node:fs/promises';

import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
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
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
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
  const sourceRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(capturedExchangeId));
  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();
  await row.click({
    button: 'right',
    position: {
      x: Math.max(1, rowBox!.width - 2),
      y: Math.max(1, rowBox!.height / 2),
    },
  });
  await screenshotStep('在原请求右边界打开菜单 / Open the original request menu at the right edge', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.contextMenu.root), label: '1' }],
  });

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
  const endpointItem = endpoint.locator('xpath=ancestor::*[@role="menuitem"][1]');
  await screenshotStep('Endpoint子菜单在边界内展开 / Open Endpoint within the window boundary', {
    highlights: [{ target: endpointItem, label: '1' }],
  });

  // 指针可进入二级菜单；回到根菜单只关闭二级，再次hover可重新打开。
  // The pointer can enter the child; returning to the parent closes only the child, and hover reopens it.
  await block.hover();
  await expect(breakpointSubmenu).not.toBeVisible();
  await expect(rootMenu).toBeVisible();
  await breakpointTrigger.hover();
  await expect(endpoint).toBeVisible();
  await screenshotStep('再次hover重新展开Endpoint / Hover again to reopen Endpoint', {
    highlights: [{ target: endpointItem, label: '1' }],
  });

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
  await screenshotStep('关闭菜单后仍保留原记录 / Dismissing the menu retains the original record', {
    highlights: [{ target: sourceRow, label: '1' }],
  });

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

  const managerTrigger = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager);
  const globalToggle = getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle);
  const manager = page.getByRole('dialog').filter({ has: globalToggle });
  const createdMessage = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.root);
  const ruleState = getByAutomationId(page, AUTOMATION_IDS.rules.status.state);
  const ownRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath });
  const headerNames = page.locator('[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]');
  const readHeaderNames = () => headerNames.evaluateAll(elements =>
    elements.map(element => (element as HTMLInputElement).value.toLowerCase()));
  let activeRequest: ReturnType<typeof loopbackLab.startAbortableRequestThroughProxy> | null = null;
  let cleanupComplete = false;
  const requestEvidence: Array<Record<string, unknown>> = [];
  const openManager = async (): Promise<void> => {
    if (await managerTrigger.getAttribute('aria-expanded') !== 'true') await managerTrigger.click();
    await expect(managerTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(globalToggle).toBeVisible();
  };
  const closeManager = async (): Promise<void> => {
    if (await managerTrigger.getAttribute('aria-expanded') === 'true') await managerTrigger.click();
    await expect(managerTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(manager).toBeHidden();
  };
  const sendUnpausedRequest = async (action: string): Promise<void> => {
    const previousRows = await ownRows.count();
    const originCount = loopbackLab.evidence().length;
    activeRequest = loopbackLab.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
    let settled = false;
    const outcome = activeRequest.result.then(response => ({ response }), error => ({ error }))
      .finally(() => { settled = true; });
    await expect.poll(() => settled).toBe(true);
    expect(await outcome).toMatchObject({ response: { statusCode: 200 } });
    activeRequest = null;
    expect(loopbackLab.evidence()).toHaveLength(originCount + 1);
    await expect(ownRows).toHaveCount(previousRows + 1);
    const completedRow = ownRows.last();
    await expect(completedRow).not.toHaveAttribute('data-breakpoint-id');
    await expect(completedRow).toContainText('200');
    await screenshotStep(`${action}：新请求直接完成200 / ${action}: a new request completes directly with 200`, {
      highlights: [{ target: completedRow, label: '1' }],
    });
    requestEvidence.push({ action, exchangeId: await exchangeId(completedRow), paused: false, originCount: loopbackLab.evidence().length });
  };
  const continueMatchedRequest = async (action: string): Promise<string> => {
    const originCount = loopbackLab.evidence().length;
    activeRequest = loopbackLab.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
    let settled = false;
    const outcome = activeRequest.result.then(response => ({ response }), error => ({ error }))
      .finally(() => { settled = true; });
    const head = ownRows.and(page.locator('[data-breakpoint-state="head"]'));
    await expect(head).toHaveCount(1);
    const id = await exchangeId(head);
    expect(id).not.toBe(capturedExchangeId);
    const pendingRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(id));
    if (await pendingRow.getAttribute('aria-pressed') !== 'true') await pendingRow.click();
    await expect(pendingRow).toHaveAttribute('aria-pressed', 'true');
    const ruleId = await pendingRow.getAttribute('data-rule-id');
    const requestBreakpointId = await pendingRow.getAttribute('data-breakpoint-id');
    if (!ruleId || !requestBreakpointId) throw new Error('Missing manager request-phase identity.');
    await expect.poll(readHeaderNames).toContain('host');
    expect(loopbackLab.evidence()).toHaveLength(originCount);
    expect(settled).toBe(false);
    const continueUnmodified = getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified);
    await screenshotStep(`${action}：request阶段原样放行 / ${action}: continue the request phase unmodified`, {
      highlights: [{ target: continueUnmodified, label: '1' }],
    });
    await continueUnmodified.click();
    await expect.poll(async () => {
      const current = await pendingRow.getAttribute('data-breakpoint-id');
      return Boolean(current && current !== requestBreakpointId);
    }).toBe(true);
    const responseBreakpointId = await pendingRow.getAttribute('data-breakpoint-id');
    if (!responseBreakpointId) throw new Error('Missing manager response-phase identity.');
    await expect(pendingRow).toHaveAttribute('data-rule-id', ruleId);
    await expect.poll(readHeaderNames).toContain('x-interceptor-e2e');
    expect(loopbackLab.evidence()).toHaveLength(originCount + 1);
    expect(settled).toBe(false);
    await screenshotStep(`${action}：response阶段再次原样放行 / ${action}: continue the response phase separately`, {
      highlights: [{ target: continueUnmodified, label: '1' }],
    });
    await continueUnmodified.click();
    expect(await outcome).toMatchObject({ response: { statusCode: 200 } });
    activeRequest = null;
    await expect(pendingRow).not.toHaveAttribute('data-breakpoint-id');
    requestEvidence.push({
      action, exchangeId: id, ruleId, requestBreakpointId, responseBreakpointId,
      paused: true, originCount: loopbackLab.evidence().length,
    });
    return ruleId;
  };
  const abortPendingClient = async (): Promise<void> => {
    const request = activeRequest;
    if (!request) return;
    request.abort();
    const outcome = await request.result.then(
      response => ({ status: 'fulfilled', response }),
      (error: unknown) => ({ status: 'rejected', error: error instanceof Error ? error.message : String(error) }),
    );
    await testInfo.attach('manager-owned-client-cleanup', {
      body: Buffer.from(JSON.stringify(outcome, null, 2)),
      contentType: 'application/json',
    });
    activeRequest = null;
  };

  try {
    // Endpoint与逐规则开关：先证明创建即应用，再从Manager自动保存开关并检查新请求效果。
    // Endpoint and per-rule control: prove immediate application first, then verify Manager's automatic saves against new traffic.
    expect(loopbackLab.evidence()).toHaveLength(1);
    await sourceRow.click({ button: 'right' });
    await breakpointTrigger.hover();
    await endpointItem.click();
    await expect(createdMessage).toBeVisible();
    await createdMessage.hover();
    await screenshotStep('从Endpoint创建Manager中的实际规则 / Create the actual Manager rule from Endpoint', {
      highlights: [{ target: createdMessage, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.close).click();
    const endpointRuleId = await continueMatchedRequest('Endpoint已应用 / Endpoint applied');
    await openManager();
    const summary = manager.locator('code').filter({ hasText: requestPath });
    await expect(summary).toHaveCount(1);
    const managedRow = summary.locator('xpath=ancestor::*[./*[@role="switch"]][1]');
    const ruleToggle = managedRow.getByRole('switch');
    const viewRule = managedRow.getByRole('button');
    await expect(ruleToggle).toHaveCount(1);
    await expect(viewRule).toHaveCount(1);
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'true');
    await expect(globalToggle).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('Manager显示实际Endpoint规则与独立全局开关 / Manager shows the Endpoint rule and its separate global switch', {
      highlights: [{ target: ruleToggle, label: '1' }, { target: globalToggle, label: '2' }],
    });
    await ruleToggle.click();
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('在Manager中停用这一条规则 / Disable this rule in Manager', {
      highlights: [{ target: ruleToggle, label: '1' }],
    });
    await viewRule.click();
    await expect(getByAutomationId(page, AutomationIdFactory.ruleTarget(endpointRuleId))).toHaveAttribute('aria-pressed', 'true');
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await screenshotStep('View rule定位同一规则，停用已自动保存 / View rule locates the same rule with its disabled state already saved', {
      highlights: [{ target: ruleState, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await sendUnpausedRequest('逐规则停用 / Rule disabled');
    await openManager();
    await ruleToggle.click();
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('在Manager中重新启用这一条规则 / Re-enable this rule in Manager', {
      highlights: [{ target: ruleToggle, label: '1' }],
    });
    await viewRule.click();
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    expect(await continueMatchedRequest('逐规则启用 / Rule enabled')).toBe(endpointRuleId);

    // 全局开关：无pending时关闭/开启，只改变新断点匹配，不切换Recording或系统代理。
    // Global control: disable and enable with no pending items, changing future breakpoint matching rather than Recording or the system proxy.
    await openManager();
    await globalToggle.click();
    await expect(globalToggle).toHaveAttribute('aria-checked', 'false');
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('关闭全局Break on match，但保留规则启用状态 / Disable global Break on match while retaining the enabled rule', {
      highlights: [{ target: globalToggle, label: '1' }],
    });
    await closeManager();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'true');
    await sendUnpausedRequest('全局停用 / Global matching disabled');
    await openManager();
    await globalToggle.click();
    await expect(globalToggle).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('重新开启全局Break on match / Re-enable global Break on match', {
      highlights: [{ target: globalToggle, label: '1' }],
    });
    await closeManager();

    // 客户端取消只结束所属HTTP等待项，后续请求必须取得新ID。
    // Client cancellation ends only its HTTP wait; a later request must get a new ID.
    const beforeAbort = loopbackLab.evidence().length;
    activeRequest = loopbackLab.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
    const abortedOutcome = activeRequest.result.then(response => ({ response }), error => ({ error }));
    const abortingHead = ownRows.and(page.locator('[data-breakpoint-state="head"]'));
    await expect(abortingHead).toHaveCount(1);
    const abortedExchangeId = await exchangeId(abortingHead);
    const abortedRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(abortedExchangeId));
    const abortedBreakpointId = await abortedRow.getAttribute('data-breakpoint-id');
    if (!abortedBreakpointId) throw new Error('Missing client-aborted breakpoint ID.');
    if (await abortedRow.getAttribute('aria-pressed') !== 'true') await abortedRow.click();
    await expect.poll(readHeaderNames).toContain('host');
    await screenshotStep('客户端取消前核对HTTP请求队首 / Inspect the HTTP request head before client cancellation', {
      highlights: [{ target: abortedRow, label: '1' }],
    });
    activeRequest.abort();
    await expect(abortedOutcome).resolves.toHaveProperty('error');
    activeRequest = null;
    await expect(abortedRow).not.toHaveAttribute('data-breakpoint-id');
    await expect(managerTrigger).toHaveText('');
    expect(loopbackLab.evidence()).toHaveLength(beforeAbort);
    await screenshotStep('客户端取消后HTTP等待项解除 / Client cancellation removes the HTTP pending item', {
      highlights: [{ target: managerTrigger, label: '1' }],
    });
    requestEvidence.push({ action: 'client-aborted', exchangeId: abortedExchangeId, abortedBreakpointId, originCount: beforeAbort });
    expect(await continueMatchedRequest('全局启用 / Global matching enabled')).toBe(endpointRuleId);
    expect(requestEvidence.at(-1)?.requestBreakpointId).not.toBe(abortedBreakpointId);

    // Undo：停用原管理规则后另建一个真实Endpoint，仅撤销新规则，保留原规则身份。
    // Undo: create another real Endpoint after disabling the managed rule, then remove only the new rule and preserve the original identity.
    await openManager();
    await ruleToggle.click();
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'false');
    await viewRule.click();
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await sourceRow.click({ button: 'right' });
    await breakpointTrigger.hover();
    await endpointItem.click();
    await expect(createdMessage).toBeVisible();
    await createdMessage.hover();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await createdMessage.hover();
    const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
    await expect(ruleRows).toHaveCount(2);
    const beforeUndoIds = await ruleRows.evaluateAll(elements => elements.map(element =>
      element.getAttribute('data-automation-id')!.slice('rules.row.'.length)));
    expect(beforeUndoIds).toContain(endpointRuleId);
    const addedRuleIds = beforeUndoIds.filter(id => id !== endpointRuleId);
    expect(addedRuleIds).toHaveLength(1);
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    const undo = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.undo);
    await screenshotStep('Undo前确认新规则已应用，原停用规则仍在 / Before Undo, confirm the new rule is applied and the disabled original remains', {
      highlights: [{ target: undo, label: '1' }],
    });
    await undo.click();
    await expect(createdMessage).toBeHidden();
    await expect(ruleRows).toHaveCount(1);
    await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(endpointRuleId))).toBeVisible();
    const remainingToggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(endpointRuleId));
    await expect(remainingToggle).toHaveAttribute('aria-checked', 'false');
    await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(addedRuleIds[0]!))).toHaveCount(0);
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await screenshotStep('Undo只删除刚创建的规则，原规则仍停用 / Undo removes only the new rule and leaves the original disabled', {
      highlights: [{ target: remainingToggle, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await openManager();
    await expect(globalToggle).toHaveAttribute('aria-checked', 'true');
    await expect(summary).toHaveCount(1);
    await expect(ruleToggle).toHaveAttribute('aria-checked', 'false');
    await closeManager();
    await sendUnpausedRequest('Undo完成 / Undo completed');
    expect(loopbackLab.evidence()).toHaveLength(7);
    cleanupComplete = true;
    const managerEvidence = testInfo.outputPath('capture-breakpoint-manager-actions.json');
    await writeFile(managerEvidence, JSON.stringify({
      url: loopbackLab.url(requestPath), sourceExchangeId: capturedExchangeId, endpointRuleId,
      removedRuleId: addedRuleIds[0], requestEvidence, globalMatchingRestored: true,
      remainingRuleDisabled: true, undoRemovedOnlyNewRule: true,
    }, null, 2), 'utf8');
    await testInfo.attach('capture-breakpoint-manager-actions', { path: managerEvidence, contentType: 'application/json' });
  } finally {
    // 失败清理仍走真实UI，不借翻译文案或内部状态解除等待与改写规则。
    // Failure cleanup still uses real UI, never translated labels or injected state to release waits or rewrite rules.
    await abortPendingClient();
    if (!cleanupComplete) {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await openManager();
      if (await globalToggle.getAttribute('aria-checked') === 'false') {
        await globalToggle.click();
        await expect(globalToggle).toHaveAttribute('aria-checked', 'true');
      }
      await closeManager();
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      const ids = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).evaluateAll(elements =>
        elements.map(element => element.getAttribute('data-automation-id')!.slice('rules.row.'.length)));
      for (const id of ids) {
        const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(id));
        if (await toggle.getAttribute('aria-checked') === 'true') {
          await getByAutomationId(page, AutomationIdFactory.ruleTarget(id)).click();
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-checked', 'false');
        }
      }
      const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);
      if (await apply.isVisible() && await apply.isEnabled()) await apply.click();
      await expect(ruleState).toHaveAttribute('data-state', 'applied');
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    }
  }
});