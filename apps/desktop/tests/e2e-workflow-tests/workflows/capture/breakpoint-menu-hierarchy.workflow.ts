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
  await sourceRow.click();
  await screenshotStep('选中创建快捷控制所用的原请求 / Select the original request used to create shortcut controls', {
    highlights: [{ target: sourceRow, label: '1' }],
  });
  await row.click({ button: 'right' });

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
  const blockItem = block.locator('xpath=ancestor::*[@role="menuitem"][1]');
  await screenshotStep('在Control分组查看Block入口 / Inspect Block in the Control group', {
    highlights: [{ target: blockItem, label: '1' }],
  });

  // 同组重排不能破坏Ant原生hover submenu；endpoint项仍由公开动态ID定位。
  // Regrouping must preserve Ant's native hover submenu and its public endpoint identity.
  await breakpoint.hover();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint'),
  )).toBeVisible();
  const endpoint = getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint'));
  const endpointItem = endpoint.locator('xpath=ancestor::*[@role="menuitem"][1]');
  await screenshotStep('展开Breakpoint并查看Endpoint入口 / Expand Breakpoint and inspect Endpoint', {
    highlights: [{ target: endpointItem, label: '1' }],
  });
  await page.keyboard.press('Escape');

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

  const createdRuleIds: string[] = [];
  let activeRequest: ReturnType<typeof loopbackLab.startAbortableRequestThroughProxy> | null = null;
  let rulesDisabled = false;
  const ruleState = getByAutomationId(page, AUTOMATION_IDS.rules.status.state);
  const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);
  const disableTestRules = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
    const ids = await ruleRows.evaluateAll(elements => elements.map(element =>
      element.getAttribute('data-automation-id')!.slice('rules.row.'.length)));
    for (const id of ids) {
      const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(id));
      if (await toggle.getAttribute('aria-checked') === 'true') {
        await getByAutomationId(page, AutomationIdFactory.ruleTarget(id)).click();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
        await screenshotStep('停用本轮快捷创建的规则 / Disable this workflow’s shortcut-created rule', {
          highlights: [{ target: toggle, label: '1' }],
        });
      }
    }
    if (await apply.isVisible() && await apply.isEnabled()) await apply.click();
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await screenshotStep('保存已停用的快捷规则 / Save the disabled shortcut rules', {
      highlights: [{ target: ruleState, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  };

  try {
    // Block操作：真正创建、命名、启用、Save，再以新请求证明reset与停用恢复。
    // Block actions: actually create, name, enable and Save, then prove reset and disabled recovery with new requests.
    await sourceRow.click({ button: 'right' });
    await blockItem.click();
    const draft = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    await expect(draft).toBeVisible();
    const draftAutomationId = await draft.getAttribute('data-automation-id');
    if (!draftAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing shortcut Block rule identity.');
    const blockRuleId = draftAutomationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    createdRuleIds.push(blockRuleId);
    const blockToggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(blockRuleId));
    await expect(blockToggle).toHaveAttribute('aria-checked', 'false');
    await expect(ruleState).toHaveAttribute('data-state', 'dirty');
    await screenshotStep('Block创建未启用、未保存的草稿 / Block creates a disabled unsaved draft', {
      highlights: [{ target: blockToggle, label: '1' }],
    });
    const name = getByAutomationId(page, AUTOMATION_IDS.rules.editorName);
    await name.fill('Capture quick block');
    await screenshotStep('命名Capture quick block / Name Capture quick block', {
      highlights: [{ target: name, label: '1' }],
    });
    await blockToggle.click();
    await expect(blockToggle).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('启用Block草稿，仍需Save / Enable the Block draft before Save', {
      highlights: [{ target: blockToggle, label: '1' }],
    });
    await apply.click();
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await screenshotStep('Save使Block规则生效 / Save applies the Block rule', {
      highlights: [{ target: ruleState, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const originalOriginCount = loopbackLab.evidence().length;
    expect(originalOriginCount).toBe(1);
    await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), requestPath)).rejects.toThrow();
    expect(loopbackLab.evidence()).toHaveLength(originalOriginCount);
    const newRequestRow = (...previousIds: string[]) => getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ has: page.getByText(requestPath, { exact: true }) })
      .and(page.locator(previousIds.map(id => `:not([data-automation-id="${AutomationIdFactory.captureRequestRow(id)}"])`).join('')));
    const blockedRow = newRequestRow(capturedExchangeId);
    await expect(blockedRow).toHaveCount(1);
    await expect(blockedRow).toBeVisible();
    const blockedExchangeId = await exchangeId(blockedRow);
    expect(blockedExchangeId).not.toBe(capturedExchangeId);
    await expect(blockedRow).not.toHaveAttribute('data-breakpoint-id');
    await blockedRow.click();
    await screenshotStep('新请求被Block重置，未到达源站 / Block resets a new request before it reaches the origin', {
      highlights: [{ target: blockedRow, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleTarget(blockRuleId)).click();
    await blockToggle.click();
    await expect(blockToggle).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用Capture quick block / Disable Capture quick block', {
      highlights: [{ target: blockToggle, label: '1' }],
    });
    await apply.click();
    await expect(ruleState).toHaveAttribute('data-state', 'applied');
    await screenshotStep('Save保存Block停用状态 / Save the disabled Block state', {
      highlights: [{ target: ruleState, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), requestPath)).resolves.toMatchObject({ statusCode: 200 });
    expect(loopbackLab.evidence()).toHaveLength(originalOriginCount + 1);
    const recoveredRow = newRequestRow(capturedExchangeId, blockedExchangeId);
    await expect(recoveredRow).toHaveCount(1);
    const recoveredExchangeId = await exchangeId(recoveredRow);
    await expect(recoveredRow).toContainText('200');
    await screenshotStep('停用Block后的新请求恢复200 / A new request returns 200 after disabling Block', {
      highlights: [{ target: recoveredRow, label: '1' }],
    });

    // Endpoint操作：只从原历史请求点击快捷入口，不补手动Enable/Save，两阶段均须真正暂停。
    // Endpoint actions: use only the original history shortcut, without manual Enable/Save, and require both phases to pause.
    await sourceRow.click({ button: 'right' });
    await breakpoint.hover();
    await screenshotStep('从原请求选择Endpoint快捷断点 / Choose the Endpoint breakpoint from the original request', {
      highlights: [{ target: endpointItem, label: '1' }],
    });
    await endpointItem.click();
    const createdMessage = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.root);
    await expect(createdMessage).toBeVisible();
    await createdMessage.hover();
    await screenshotStep('Endpoint已创建并立即应用 / Endpoint is created and immediately applied', {
      highlights: [{ target: createdMessage, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.close).click();
    await expect(createdMessage).toBeHidden();
    await expect(sourceRow).not.toHaveAttribute('data-breakpoint-id');
    const beforeBreakpointOriginCount = loopbackLab.evidence().length;
    activeRequest = loopbackLab.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
    let clientSettled = false;
    const clientOutcome = activeRequest.result.then(response => ({ response }), error => ({ error }))
      .finally(() => { clientSettled = true; });
    const pending = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: requestPath }).and(page.locator('[data-breakpoint-state="head"]'));
    await expect(pending).toHaveCount(1);
    const pendingExchangeId = await exchangeId(pending);
    expect(pendingExchangeId).not.toBe(capturedExchangeId);
    const pendingRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(pendingExchangeId));
    await pendingRow.click();
    const endpointRuleId = await pendingRow.getAttribute('data-rule-id');
    const requestBreakpointId = await pendingRow.getAttribute('data-breakpoint-id');
    if (!endpointRuleId || !requestBreakpointId) throw new Error('Endpoint omitted request-phase identities.');
    expect(endpointRuleId).not.toBe(blockRuleId);
    createdRuleIds.push(endpointRuleId);
    const headerNames = page.locator('[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]');
    const readHeaderNames = () => headerNames.evaluateAll(elements =>
      elements.map(element => (element as HTMLInputElement).value.toLowerCase()));
    await expect.poll(readHeaderNames).toContain('host');
    expect(loopbackLab.evidence()).toHaveLength(beforeBreakpointOriginCount);
    expect(clientSettled).toBe(false);
    const continueUnmodified = getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified);
    await screenshotStep('Endpoint先暂停新请求，等待request Continue / Endpoint first pauses the new request for request-phase Continue', {
      highlights: [{ target: continueUnmodified, label: '1' }],
    });
    await continueUnmodified.click();
    await expect.poll(async () => {
      const id = await pendingRow.getAttribute('data-breakpoint-id');
      return Boolean(id && id !== requestBreakpointId);
    }).toBe(true);
    const responseBreakpointId = await pendingRow.getAttribute('data-breakpoint-id');
    await expect(pendingRow).toHaveAttribute('data-rule-id', endpointRuleId);
    await expect.poll(readHeaderNames).toContain('x-interceptor-e2e');
    expect(loopbackLab.evidence()).toHaveLength(beforeBreakpointOriginCount + 1);
    expect(clientSettled).toBe(false);
    await screenshotStep('同一请求再暂停于response，需第二次Continue / The same exchange pauses again in response and needs a second Continue', {
      highlights: [{ target: continueUnmodified, label: '1' }],
    });
    await continueUnmodified.click();
    expect(await clientOutcome).toMatchObject({ response: { statusCode: 200 } });
    activeRequest = null;
    await expect(pendingRow).not.toHaveAttribute('data-breakpoint-id');
    await expect(pendingRow).toContainText('200');
    await screenshotStep('两阶段原样放行后请求完成200 / Both unmodified continuations complete the request with 200', {
      highlights: [{ target: pendingRow, label: '1' }],
    });
    await disableTestRules();
    rulesDisabled = true;
    activeRequest = loopbackLab.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
    await expect(activeRequest.result).resolves.toMatchObject({ statusCode: 200 });
    activeRequest = null;
    expect(loopbackLab.evidence()).toHaveLength(4);
    const finalRow = newRequestRow(capturedExchangeId, blockedExchangeId, recoveredExchangeId, pendingExchangeId);
    await expect(finalRow).toHaveCount(1);
    await expect(finalRow).toContainText('200');
    await expect(finalRow).not.toHaveAttribute('data-breakpoint-id');
    await screenshotStep('停用快捷断点后，新请求直接完成 / A new request completes directly after disabling the shortcut breakpoint', {
      highlights: [{ target: finalRow, label: '1' }],
    });
    const actionsEvidence = testInfo.outputPath('capture-shortcut-actions.json');
    await writeFile(actionsEvidence, JSON.stringify({
      url: loopbackLab.url(requestPath), sourceExchangeId: capturedExchangeId, blockedExchangeId,
      blockRuleId, endpointRuleId, pendingExchangeId, requestBreakpointId, responseBreakpointId,
      originalOriginCount, finalOriginCount: loopbackLab.evidence().length,
      blockedBeforeOrigin: true, restoredAfterDisable: true, bothPhasesContinued: true, rulesDisabled,
    }, null, 2), 'utf8');
    await testInfo.attach('capture-shortcut-actions', { path: actionsEvidence, contentType: 'application/json' });
  } finally {
    // 清理只中止本轮客户端并停用本profile规则；fixture负责正常App退出及宿主恢复。
    // Cleanup aborts only this client and disables this profile's rules; the fixture owns normal App exit and host restoration.
    if (activeRequest) {
      activeRequest.abort();
      await activeRequest.result.catch(() => undefined);
    }
    if (!rulesDisabled && createdRuleIds.length > 0) await disableTestRules();
  }
});
