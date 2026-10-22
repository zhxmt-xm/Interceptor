import { writeFile } from 'node:fs/promises';

import type { Locator, Page } from '@playwright/test';

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

async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  expect(automationId?.startsWith(prefix)).toBe(true);
  return automationId!.slice(prefix.length);
}

async function openFolderMenu(page: Page, folderId: string): Promise<void> {
  await getByAutomationId(page, AutomationIdFactory.ruleFolderRow(folderId)).hover();
  await getByAutomationId(page, AutomationIdFactory.ruleFolderMenu(folderId)).click();
}

async function expandFolder(page: Page, folderId: string): Promise<void> {
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(folderId));
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test('rules.hierarchy-menus-status keeps hierarchy, validation and effects coherent', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.hierarchy-menus-status',
  });

  const { page } = desktopApp;
  const folderRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRow);
  const renameFields = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  const inspectedCaptureRowIds = new Set<string>();
  const selectCapturedRequest = async (pathname: string, method: string): Promise<Locator> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const displayPath = pathname.split('?')[0]!;
    const keyword = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
    await keyword.fill(displayPath);
    const latestRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: displayPath })
      .filter({ has: page.getByText(method, { exact: true }) })
      .last();
    await expect(latestRow).toBeVisible();
    // 相同Path的多次比较必须等待新行，不能把前一次结果当成本次反例。
    // Repeated paths must wait for a new row instead of reusing a previous comparison.
    await expect.poll(async () => {
      const rowId = await latestRow.getAttribute('data-automation-id');
      return rowId !== null && !inspectedCaptureRowIds.has(rowId);
    }).toBe(true);
    const rowId = await latestRow.getAttribute('data-automation-id');
    expect(rowId).not.toBeNull();
    const row = getByAutomationId(page, rowId!);
    if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    inspectedCaptureRowIds.add(rowId!);
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    const general = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general);
    await expect(general).toBeVisible();
    if (await general.getAttribute('aria-expanded') !== 'true') await general.click();
    await expect(general.locator('..')).toContainText(displayPath);
    await screenshotStep(`在Capture选择本次${method} ${pathname} / Select this ${method} ${pathname} request in Capture`, {
      highlights: [{ target: keyword, label: '1' }, { target: row, label: '2' }],
    });
    return row;
  };
  const openCapturedHeaders = async (phase: 'request' | 'response'): Promise<Locator> => {
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    const heading = getByAutomationId(page, phase === 'request'
      ? AUTOMATION_IDS.capture.inspector.section.requestHeaders
      : AUTOMATION_IDS.capture.inspector.section.responseHeaders);
    await expect(heading).toBeVisible();
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
    const headers = heading.locator('..');
    await headers.scrollIntoViewIfNeeded();
    return headers;
  };
  const inspectCapturedHeaders = async (
    pathname: string,
    method: string,
    phase: 'request' | 'response',
    expectedValue: string | undefined,
  ): Promise<void> => {
    const editorHeader = page.locator('[data-automation-id^="rules.action."][data-automation-id$=".0.name"]');
    await expect(editorHeader).toHaveCount(1);
    const actionId = await editorHeader.getAttribute('data-automation-id');
    const ruleIdentity = /^rules\.action\.(.+)\.0\.name$/.exec(actionId ?? '');
    expect(ruleIdentity).not.toBeNull();
    const returnRuleId = ruleIdentity![1]!;
    await selectCapturedRequest(pathname, method);
    const headers = await openCapturedHeaders(phase);
    if (expectedValue === undefined) {
      await expect(headers).not.toContainText('x-rules-e2e');
    } else {
      await expect(headers).toContainText('x-rules-e2e');
      await expect(headers).toContainText(expectedValue);
    }
    await screenshotStep(`查看${method} ${pathname}的${phase} Header结果 / Inspect ${phase} Header results for ${method} ${pathname}`, {
      highlights: [{ target: headers, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(returnRuleId)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.ruleTarget(returnRuleId)))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(getByAutomationId(page, AutomationIdFactory.ruleActionField(returnRuleId, 0, 'name')))
      .toHaveValue('x-rules-e2e');
    await screenshotStep('查看Capture结果后返回原Rule身份 / Return to the original Rule identity after inspecting Capture');
  };

  // 真实Recording让后续Rule命中同时进入Capture并产生可导航证据。
  // Real Recording lets the later Rule hit enter Capture and produce navigable evidence.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('真实Recording让后续Rule命中同时进入Capture并产生可导航证据。 / Real Recording lets the later Rule hit enter Capture and produce navigable evidence.');

  // 从根右键菜单开始，连续创建并行内命名三级目录。
  // Start from the root context menu and create three inline-renamed folder levels.
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await screenshotStep('打开根目录菜单 / Open the root menu', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.createFolder), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.createFolder).click();
  await expect(renameFields).toHaveCount(1);
  const level1Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 1');
  await screenshotStep('填写一级目录名称 / Enter the first-level folder name', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  await renameFields.press('Enter');
  await screenshotStep('确认一级目录名称 / Confirm the first-level folder name');

  await openFolderMenu(page, level1Id);
  await screenshotStep('打开一级目录菜单 / Open the first-level folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'new-folder')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level1Id, 'new-folder'),
  ).click();
  const level2Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 2');
  await screenshotStep('填写二级目录名称 / Enter the second-level folder name', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  await renameFields.press('Enter');
  await screenshotStep('确认二级目录名称 / Confirm the second-level folder name');

  await openFolderMenu(page, level2Id);
  await screenshotStep('打开二级目录菜单 / Open the second-level folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level2Id, 'new-folder')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level2Id, 'new-folder'),
  ).click();
  const level3Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 3');
  await screenshotStep('填写三级目录名称 / Enter the third-level folder name', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  await renameFields.press('Enter');
  await expect(folderRows).toHaveCount(3);
  await screenshotStep('从根右键菜单开始，连续创建并行内命名三级目录。 / Start from the root context menu and create three inline-renamed folder levels.');

  // 第三级禁止继续嵌套，但允许在该目录中新建rule。
  // The third level blocks deeper folders while still allowing a new Rule.
  await openFolderMenu(page, level3Id);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level3Id, 'new-folder'),
  )).toBeDisabled();
  await screenshotStep('三级目录不能继续新建子目录 / A third-level folder cannot add a subfolder', {
    highlights: [
      { target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level3Id, 'new-folder')), label: '1' },
      { target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level3Id, 'new-rule')), label: '2' },
    ],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level3Id, 'new-rule'),
  ).click();
  const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  await expect(ruleRows).toHaveCount(1);
  const ruleId = await automationSuffix(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow);
  await expect(getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId)))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toBeVisible();
  await screenshotStep('第三级禁止继续嵌套，但允许在该目录中新建rule。 / The third level blocks deeper folders while still allowing a new Rule.');

  // rule右键rename保持同一动态ID和打开editor。
  // Rename through the Rule context menu while retaining the same identity and editor.
  await ruleRows.click({ button: 'right' });
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(ruleId, 'show-requests'),
  )).toBeDisabled();
  await screenshotStep('无命中时打开规则菜单 / Open the Rule menu before any hits', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(ruleId, 'rename')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(ruleId, 'rename'),
  ).click();
  const ruleRename = getByAutomationId(page, AutomationIdFactory.ruleRename(ruleId));
  await expect(ruleRename).toBeVisible();
  await ruleRename.fill('E2E hierarchy rule');
  await screenshotStep('在列表中填写规则名称 / Enter the Rule name inline', {
    highlights: [{ target: ruleRename, label: '1' }],
  });
  await ruleRename.press('Enter');
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId))).toHaveCount(1);
  await screenshotStep('rule右键rename保持同一动态ID和打开editor。 / Rename through the Rule context menu while retaining the same identity and editor.');

  // invalid状态必须在Statusbar和Apply边界一致，不能把未填写字段写入Core。
  // Invalid state must agree across Statusbar and Apply, never writing missing fields to Core.
  const statusState = getByAutomationId(page, AUTOMATION_IDS.rules.status.state);
  const statusValidation = getByAutomationId(page, AUTOMATION_IDS.rules.status.validation);
  const statusEnabled = getByAutomationId(page, AUTOMATION_IDS.rules.status.enabled);
  const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);
  await expect(statusState).toHaveAttribute('data-state', 'invalid');
  await expect(statusValidation).toHaveAttribute('data-issue-count', '2');
  await expect(statusEnabled).toHaveAttribute('data-enabled', '0');
  await expect(statusEnabled).toHaveAttribute('data-total', '1');
  await expect(apply).toBeDisabled();
  await screenshotStep('invalid状态必须在Statusbar和Apply边界一致，不能把未填写字段写入Core。 / Invalid state must agree across Statusbar and Apply, never writing missing fields to Core.');

  // 填完默认host/header字段并启用rule，Statusbar转dirty且Apply恢复。
  // Complete the default host/header fields and enable the Rule; Statusbar becomes dirty and Apply recovers.
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await screenshotStep('补齐Host条件 / Complete the Host condition', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill('x-rules-e2e');
  await screenshotStep('补齐Header名称 / Complete the Header name', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill('active');
  await screenshotStep('补齐Header值 / Complete the Header value', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await expect(statusState).toHaveAttribute('data-state', 'dirty');
  await expect(statusValidation).toHaveAttribute('data-issue-count', '0');
  await expect(statusEnabled).toHaveAttribute('data-enabled', '1');
  await expect(apply).toBeEnabled();
  await screenshotStep('填完默认host/header字段并启用rule，Statusbar转dirty且Apply恢复。 / Complete the default host/header fields and enable the Rule; Statusbar becomes dirty and Apply recovers.');

  // 选择目录只改树落点，右侧仍打开同一rule；随后Apply并验证revision。
  // Folder selection changes only the tree target; the same Rule stays open before Apply and revision verification.
  const level1Target = getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(level1Id));
  await level1Target.click();
  await expect(level1Target).toHaveAttribute('aria-pressed', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName))
    .toHaveValue('E2E hierarchy rule');
  await screenshotStep('选中目录时保留正在编辑的规则 / Keep the open Rule editor when selecting a folder', {
    highlights: [{ target: level1Target, label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  const revision = getByAutomationId(page, AUTOMATION_IDS.rules.status.revision);
  await expect(revision).toHaveAttribute('data-revision', '1');
  await screenshotStep('选择目录只改树落点，右侧仍打开同一rule；随后Apply并验证revision。 / Folder selection changes only the tree target; the same Rule stays open before Apply and revision verification.');

  // Reload Renderer强制从Core重建Store，锁定树、rule身份、enabled与revision持久化。
  // Reload Renderer to rebuild the Store from Core and lock tree, identity, enabled state, and revision persistence.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expandFolder(page, level1Id);
  await expandFolder(page, level2Id);
  await expandFolder(page, level3Id);
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId))).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName))
    .toHaveValue('E2E hierarchy rule');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled))
    .toHaveAttribute('aria-checked', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
    .toHaveAttribute('data-revision', '1');
  const persistedEnabledStatus = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.status.enabled,
  );
  await expect(persistedEnabledStatus).toHaveAttribute('data-enabled', '1');
  await expect(persistedEnabledStatus).toHaveAttribute('data-total', '1');
  const persistedEnabled = await persistedEnabledStatus.getAttribute('data-enabled');
  const persistedRevision = await getByAutomationId(
    page,
    AUTOMATION_IDS.rules.status.revision,
  ).getAttribute('data-revision');
  const folderBoxes = await Promise.all([level1Id, level2Id, level3Id].map((folderId) =>
    getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(folderId)).boundingBox()));
  expect(folderBoxes.every(Boolean)).toBe(true);
  await screenshotStep('Reload Renderer强制从Core重建Store，锁定树、rule身份、enabled与revision持久化。 / Reload Renderer to rebuild the Store from Core and lock tree, identity, enabled state, and revision persistence.');

  // 真实GET经8888命中rule，origin收到header，命中数和Show requests同步变为可用。
  // A real GET through 8888 hits the Rule, reaches the origin with its header, and enables Show requests.
  const requestPath = '/e2e/rules/hierarchy-status';
  const response = await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
  );
  expect(response.statusCode).toBe(200);
  await expect.poll(
    () => loopbackLab.observation(requestPath)?.headers['x-rules-e2e'],
  ).toBe('active');
  const hitCount = getByAutomationId(page, AutomationIdFactory.ruleHitCount(ruleId));
  await expect(hitCount).toHaveAttribute('data-count', '1', { timeout: 10_000 });
  await screenshotStep('匹配请求使规则命中数变为1 / A matching request raises the Rule hit count to 1', {
    highlights: [{ target: hitCount, label: '1' }],
  });
  const persistedHitCount = await hitCount.getAttribute('data-count');
  const persistedRuleRow = getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId));
  await persistedRuleRow.click({ button: 'right' });
  const showRequests = getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(ruleId, 'show-requests'),
  );
  await expect(showRequests).toBeEnabled();
  await screenshotStep('命中后打开Show matching requests / Open Show matching requests after a hit', {
    highlights: [{ target: showRequests, label: '1' }],
  });
  await showRequests.click();
  await screenshotStep('真实GET经8888命中rule，origin收到header，命中数和Show requests同步变为可用。 / A real GET through 8888 hits the Rule, reaches the origin with its header, and enables Show requests.');

  // Rules→Capture导航必须选择同一rule facet，而非只换workspace。
  // Rules-to-Capture navigation must select the same Rule facet, not merely switch workspace.
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture))
    .toHaveAttribute('aria-current', 'page');
  const ruleFacetToggle = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetToggle('rule'),
  );
  if (await ruleFacetToggle.getAttribute('aria-expanded') !== 'true') {
    await ruleFacetToggle.click();
  }
  await expect(ruleFacetToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('rule', ruleId),
  )).toHaveAttribute('aria-pressed', 'true');
  await selectCapturedRequest(requestPath, 'GET');
  const initialHeaders = await openCapturedHeaders('request');
  const initialHeaderEffect = getByAutomationId(
    initialHeaders,
    AutomationIdFactory.captureRuleEffect(ruleId, 'set', 'x-rules-e2e'),
  );
  await expect(initialHeaders).toContainText('active');
  await expect(initialHeaderEffect).toHaveAttribute('data-effect', 'set');
  await screenshotStep('Capture中查看初始规则写入的Header和来源 / Inspect the initial Rule Header and its source in Capture', {
    highlights: [{ target: initialHeaderEffect, label: '1' }],
  });
  await screenshotStep('Rules→Capture导航必须选择同一rule facet，而非只换workspace。 / Rules-to-Capture navigation must select the same Rule facet, not merely switch workspace.');

  // 用户操作：继续编辑同一规则，补齐八类条件的真实AND正反例。
  // User actions: edit the same Rule and verify positive/negative AND cases for all eight conditions.
  await getByAutomationId(page, AutomationIdFactory.captureFacetOption('rule', ruleId)).click();
  await initialHeaderEffect.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  await expect(getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId)))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('E2E hierarchy rule');
  await screenshotStep('点击Header来源标记返回同一规则 / Follow the Header source marker back to the same Rule', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId)), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  const matcher = (index: number, name: string) =>
    getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, index, name));
  const matcherRow = (index: number) => matcher(index, 'remove').locator('..');
  const allConditionsPath = '/e2e/rules/all-conditions?case=and';
  loopbackLab.respondWith(allConditionsPath, {
    body: '{"matched":"all-conditions"}',
    headers: { 'content-type': 'application/json' },
  });
  const conditions = [
    { kind: 'method', values: ['GET'] },
    { kind: 'path', values: ['/e2e/rules/all-conditions'] },
    { kind: 'url', values: [loopbackLab.url(allConditionsPath)] },
    { kind: 'query', values: ['case', 'and'] },
    { kind: 'header', values: ['x-e2e-matcher', 'present'] },
    { kind: 'status', values: ['200', '200'] },
    { kind: 'mime', values: ['application/json'] },
  ] as const;
  for (const [offset, condition] of conditions.entries()) {
    const index = offset + 1;
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await screenshotStep(`在菜单中选择${condition.kind}条件 / Choose the ${condition.kind} condition from the menu`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption[condition.kind]), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption[condition.kind]).click();
    await screenshotStep(`新增${condition.kind}条件的初始字段 / Initial fields for the new ${condition.kind} condition`);
    if (condition.kind === 'header' || condition.kind === 'mime') {
      await matcherRow(index).getByRole('combobox').nth(1).click();
      await page.keyboard.press(condition.kind === 'header' ? 'Home' : 'End');
      await page.keyboard.press('Enter');
    }
    const inputs = matcherRow(index).locator('input:not([readonly])');
    for (const [fieldIndex, value] of condition.values.entries()) {
      await inputs.nth(fieldIndex).fill(value);
      await screenshotStep(`填写${condition.kind}条件的第${fieldIndex + 1}个值 / Enter value ${fieldIndex + 1} for the ${condition.kind} condition`, {
        highlights: [{ target: inputs.nth(fieldIndex), label: '1' }],
      });
    }
    await screenshotStep(`添加${condition.kind}条件 / Add the ${condition.kind} condition`);
  }
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
  await screenshotStep('响应条件使用响应阶段Header动作 / Use a response-phase Header action with response conditions', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await screenshotStep('保存八类AND条件 / Save all eight AND conditions', {
    highlights: [{ target: statusState, label: '1' }],
  });
  for (const method of ['GET', 'POST']) {
    const result = await loopbackLab.run('h1-json', {
      kind: 'http', protocol: 'h1', path: allConditionsPath, method,
      body: '', headers: { 'x-e2e-matcher': 'present' },
    }, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
    expect(result.response?.headers['x-rules-e2e']).toBe(method === 'GET' ? 'active' : undefined);
    await inspectCapturedHeaders(allConditionsPath, method, 'response', method === 'GET' ? 'active' : undefined);
  }
  await screenshotStep('核对全部条件共同决定是否命中 / Verify that every condition participates in the match');

  // 用户操作与断言：只保留Host和Path，逐项比较实际匹配模式与大小写。
  // User actions and assertions: retain Host/Path and compare actual matching modes and case sensitivity.
  for (let index = conditions.length; index >= 3; index -= 1) {
    await matcher(index, 'remove').click();
  }
  await matcher(1, 'remove').click();
  const casePath = '/e2e/rules/modes/Case';
  await matcher(1, 'value').fill(casePath);
  await screenshotStep('填写用于比较匹配模式的Path / Enter the Path for comparing matching modes', {
    highlights: [{ target: matcher(1, 'value'), label: '1' }],
  });
  const modes = matcher(1, 'value').locator('..').getByRole('button');
  await expect(modes).toHaveCount(3);
  const verifyMatch = async (pathname: string, matched: boolean): Promise<void> => {
    const result = await loopbackLab.run('h1-json', {
      kind: 'http', protocol: 'h1', path: pathname, method: 'GET', body: '', headers: {},
    }, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
    expect(result.response?.headers['x-rules-e2e']).toBe(matched ? 'active' : undefined);
    await inspectCapturedHeaders(pathname, 'GET', 'response', matched ? 'active' : undefined);
  };
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch('/e2e/rules/modes/case/extra', true);
  await screenshotStep('默认包含匹配忽略大小写 / Default contains matching ignores case');
  await modes.nth(0).click();
  await screenshotStep('开启Aa大小写敏感 / Enable Aa case sensitivity', {
    highlights: [{ target: modes.nth(0), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch('/e2e/rules/modes/case/extra', false);
  await screenshotStep('Aa开启后大小写必须一致 / Aa requires matching case');
  await modes.nth(1).click();
  await screenshotStep('选择精确匹配 / Select exact matching', {
    highlights: [{ target: modes.nth(1), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch(`${casePath}/extra`, false);
  await verifyMatch(casePath, true);
  await screenshotStep('精确匹配不接受多余路径 / Exact matching rejects an extra path suffix');
  await modes.nth(2).click();
  await expect(modes.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await matcher(1, 'value').fill('[');
  await screenshotStep('填写无效正则示例 / Enter the invalid regex example', {
    highlights: [{ target: matcher(1, 'value'), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch(casePath, false);
  await screenshotStep('当前Release的无效正则不产生匹配 / An invalid regex does not match in this Release');
  await matcher(1, 'value').fill(`^${casePath}/[0-9]+$`);
  await screenshotStep('填写数字路径正则 / Enter the numeric-path regex', {
    highlights: [{ target: matcher(1, 'value'), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch(`${casePath}/123`, true);
  await verifyMatch(`${casePath}/letters`, false);
  await screenshotStep('有效正则区分数字与非数字路径 / A valid regex distinguishes numeric paths');

  // 业务断言：MIME通配符由真实响应决定，不用表单存在代替网络结果。
  // Business assertions: a MIME wildcard follows the actual response, not merely the editor state.
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.mime).click();
  await matcherRow(2).getByRole('combobox').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await matcherRow(2).locator('input:not([readonly])').fill('application/*');
  await screenshotStep('填写响应MIME通配符 / Enter the response MIME wildcard', {
    highlights: [{ target: matcherRow(2).locator('input:not([readonly])'), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  for (const [suffix, contentType, matched] of [
    ['124', 'application/json', true],
    ['125', 'text/plain', false],
  ] as const) {
    loopbackLab.respondWith(`${casePath}/${suffix}`, {
      body: '{"mime":"comparison"}', headers: { 'content-type': contentType },
    });
    await verifyMatch(`${casePath}/${suffix}`, matched);
  }
  await screenshotStep('MIME通配符区分JSON与纯文本 / A MIME wildcard distinguishes JSON from plain text');

  // 顺序与目录：复用原嵌套规则，与一条真正竞争同一Header的根规则比较优先级。
  // Ordering and folders: compare the nested Rule with a root Rule that actually competes for the same Header.
  await matcher(2, 'remove').click();
  await matcher(1, 'value').fill('/e2e/rules/priority');
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.request')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('nested');
  await screenshotStep('配置嵌套规则的优先级示例 / Configure the nested Rule for the priority example', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await screenshotStep('从根菜单创建竞争规则 / Create a competing Rule from the root menu', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.create), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const rootRuleId = await automationSuffix(ruleRows.last(), AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E root priority');
  await screenshotStep('填写根规则名称 / Enter the root Rule name', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 0, 'value')).fill('127.0.0.1');
  await screenshotStep('填写根规则Host / Enter the root Rule Host', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 1, 'value')).fill('/e2e/rules/priority');
  await screenshotStep('填写根规则Path / Enter the root Rule Path', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 1, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'name')).fill('x-rules-e2e');
  await screenshotStep('填写竞争的Header名称 / Enter the competing Header name', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'name')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'value')).fill('root');
  await screenshotStep('填写根规则Header值 / Enter the root Rule Header value', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('启用根规则，准备保存顺序 / Enable the root Rule before saving the order', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  const verifyPriority = async (suffix: string, value: string) => {
    const pathname = `/e2e/rules/priority/${suffix}`;
    expect((await loopbackLab.requestThroughProxy(desktopApp.capturePort(), pathname)).statusCode).toBe(200);
    expect(loopbackLab.observation(pathname)?.headers['x-rules-e2e']).toBe(value);
    await inspectCapturedHeaders(pathname, 'GET', 'request', value);
  };
  await verifyPriority('before-drag', 'root');
  await screenshotStep('拖拽前的已保存规则顺序 / The saved Rule order before dragging');
  const rootRow = getByAutomationId(page, AutomationIdFactory.ruleRow(rootRuleId));
  const nestedRow = getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId));
  await rootRow.dragTo(nestedRow, { targetPosition: { x: 40, y: 2 } });
  await screenshotStep('将根规则拖到嵌套规则之前 / Drag the root Rule before the nested Rule', {
    highlights: [{ target: rootRow, label: '1' }],
  });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyPriority('after-drag', 'nested');
  await screenshotStep('调整规则顺序后核对真实Header覆盖 / Verify actual Header precedence after reordering Rules');
  await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('E2E root priority');
  await expect(rootRow).toBeVisible();
  await expect(nestedRow).toHaveCount(0);
  await screenshotStep('按名称搜索根规则 / Search for the root Rule by name', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.search), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('');
  await expect(nestedRow).toBeVisible();
  await openFolderMenu(page, level1Id);
  await screenshotStep('在目录菜单中选择重命名 / Choose Rename from the folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'rename')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'rename')).click();
  await renameFields.fill('E2E renamed hierarchy');
  await screenshotStep('填写目录的新名称 / Enter the new folder name', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  await renameFields.press('Enter');
  await screenshotStep('确认目录重命名 / Confirm the folder rename');
  await getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(level1Id)).click();
  await expect(nestedRow).toBeHidden();
  await screenshotStep('折叠目录隐藏子规则 / Collapse the folder to hide its child Rules', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(level1Id)), label: '1' }],
  });
  await expandFolder(page, level1Id);
  await screenshotStep('搜索和目录重命名折叠不替换规则身份 / Search, folder rename and collapse preserve Rule identities');
  await rootRow.click({ button: 'right' });
  await screenshotStep('打开非最后一条规则的删除菜单 / Open Delete for a Rule that is not the last one', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(rootRuleId, 'delete')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(rootRuleId, 'delete')).click();
  await expect(rootRow).toHaveCount(0);
  await screenshotStep('删除竞争规则后仍保留嵌套规则 / Keep the nested Rule after deleting the competing Rule');
  const rootSurface = getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface);
  const rootBounds = await rootSurface.boundingBox();
  if (!rootBounds) throw new Error('The Rules root drop surface is unavailable.');
  await nestedRow.dragTo(rootSurface, { targetPosition: { x: 20, y: rootBounds.height - 8 } });
  await screenshotStep('将保留规则移回根目录 / Move the retained Rule back to the root', {
    highlights: [{ target: nestedRow, label: '1' }],
  });
  await openFolderMenu(page, level1Id);
  await screenshotStep('打开空目录的删除菜单 / Open Delete for the empty folder', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'delete')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'delete')).click();
  await expect(folderRows).toHaveCount(0);
  await expect(nestedRow).toBeVisible();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyPriority('after-deletion', 'nested');
  await screenshotStep('删除非最后规则和空目录后保留有效规则 / Keep the valid Rule after deleting a non-last Rule and empty folders');

  // 保存层级、状态、命中与导航证据；driver随后正常Close并验证系统恢复与销毁。
  // Save hierarchy, status, hit, and navigation evidence; the driver then closes and verifies restoration.
  const evidencePath = testInfo.outputPath('rules-hierarchy-status.json');
  await writeFile(evidencePath, JSON.stringify({
    folderIds: [level1Id, level2Id, level3Id],
    folderX: folderBoxes.map((box) => box?.x ?? null),
    ruleId,
    revision: persistedRevision,
    enabled: persistedEnabled,
    hitCount: persistedHitCount,
    originHeader: loopbackLab.observation(requestPath)?.headers['x-rules-e2e'],
    matcherConditions: conditions.map((condition) => condition.kind),
    matcherModes: ['contains', 'case-sensitive', 'exact', 'invalid-regex', 'regex', 'mime-wildcard'],
  }, null, 2), 'utf8');
  await testInfo.attach('rules-hierarchy-status', {
    path: evidencePath,
    contentType: 'application/json',
  });
});