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

  // 真实Recording让后续Rule命中同时进入Capture并产生可导航证据。
  // Real Recording lets the later Rule hit enter Capture and produce navigable evidence.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('真实Recording让后续Rule命中同时进入Capture并产生可导航证据。 / Real Recording lets the later Rule hit enter Capture and produce navigable evidence.');

  // 从根右键菜单开始，连续创建并行内命名三级目录。
  // Start from the root context menu and create three inline-renamed folder levels.
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.createFolder).click();
  await expect(renameFields).toHaveCount(1);
  const level1Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 1');
  await renameFields.press('Enter');

  await openFolderMenu(page, level1Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level1Id, 'new-folder'),
  ).click();
  const level2Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 2');
  await renameFields.press('Enter');

  await openFolderMenu(page, level2Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level2Id, 'new-folder'),
  ).click();
  const level3Id = await automationSuffix(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await renameFields.fill('E2E rules level 3');
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
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(ruleId, 'rename'),
  ).click();
  const ruleRename = getByAutomationId(page, AutomationIdFactory.ruleRename(ruleId));
  await expect(ruleRename).toBeVisible();
  await ruleRename.fill('E2E hierarchy rule');
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
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill('x-rules-e2e');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill('active');
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
  const persistedHitCount = await hitCount.getAttribute('data-count');
  const persistedRuleRow = getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId));
  await persistedRuleRow.click({ button: 'right' });
  const showRequests = getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(ruleId, 'show-requests'),
  );
  await expect(showRequests).toBeEnabled();
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
  await screenshotStep('Rules→Capture导航必须选择同一rule facet，而非只换workspace。 / Rules-to-Capture navigation must select the same Rule facet, not merely switch workspace.');

  // 用户操作：继续编辑同一规则，补齐八类条件的真实AND正反例。
  // User actions: edit the same Rule and verify positive/negative AND cases for all eight conditions.
  await getByAutomationId(page, AutomationIdFactory.captureFacetOption('rule', ruleId)).click();
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
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption[condition.kind]).click();
    if (condition.kind === 'header' || condition.kind === 'mime') {
      await matcherRow(index).getByRole('combobox').nth(1).click();
      await page.keyboard.press(condition.kind === 'header' ? 'Home' : 'End');
      await page.keyboard.press('Enter');
    }
    const inputs = matcherRow(index).locator('input:not([readonly])');
    for (const [fieldIndex, value] of condition.values.entries()) {
      await inputs.nth(fieldIndex).fill(value);
    }
    await screenshotStep(`添加${condition.kind}条件 / Add the ${condition.kind} condition`);
  }
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  for (const method of ['GET', 'POST']) {
    const result = await loopbackLab.run('h1-json', {
      kind: 'http', protocol: 'h1', path: allConditionsPath, method,
      body: '', headers: { 'x-e2e-matcher': 'present' },
    }, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
    expect(result.response?.headers['x-rules-e2e']).toBe(method === 'GET' ? 'active' : undefined);
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
  const modes = matcher(1, 'value').locator('..').getByRole('button');
  await expect(modes).toHaveCount(3);
  const verifyMatch = async (pathname: string, matched: boolean): Promise<void> => {
    const result = await loopbackLab.run('h1-json', {
      kind: 'http', protocol: 'h1', path: pathname, method: 'GET', body: '', headers: {},
    }, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
    expect(result.response?.headers['x-rules-e2e']).toBe(matched ? 'active' : undefined);
  };
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch('/e2e/rules/modes/case/extra', true);
  await screenshotStep('默认包含匹配忽略大小写 / Default contains matching ignores case');
  await modes.nth(0).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch('/e2e/rules/modes/case/extra', false);
  await screenshotStep('Aa开启后大小写必须一致 / Aa requires matching case');
  await modes.nth(1).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch(`${casePath}/extra`, false);
  await verifyMatch(casePath, true);
  await screenshotStep('精确匹配不接受多余路径 / Exact matching rejects an extra path suffix');
  await modes.nth(2).click();
  await expect(modes.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await matcher(1, 'value').fill('[');
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyMatch(casePath, false);
  await screenshotStep('当前Release的无效正则不产生匹配 / An invalid regex does not match in this Release');
  await matcher(1, 'value').fill(`^${casePath}/[0-9]+$`);
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
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const rootRuleId = await automationSuffix(ruleRows.last(), AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E root priority');
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 0, 'value')).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRuleId, 1, 'value')).fill('/e2e/rules/priority');
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'name')).fill('x-rules-e2e');
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRuleId, 0, 'value')).fill('root');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  const verifyPriority = async (suffix: string, value: string) => {
    const pathname = `/e2e/rules/priority/${suffix}`;
    expect((await loopbackLab.requestThroughProxy(desktopApp.capturePort(), pathname)).statusCode).toBe(200);
    expect(loopbackLab.observation(pathname)?.headers['x-rules-e2e']).toBe(value);
  };
  await verifyPriority('before-drag', 'root');
  const rootRow = getByAutomationId(page, AutomationIdFactory.ruleRow(rootRuleId));
  const nestedRow = getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId));
  await rootRow.dragTo(nestedRow, { targetPosition: { x: 40, y: 2 } });
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await verifyPriority('after-drag', 'nested');
  await screenshotStep('调整规则顺序后核对真实Header覆盖 / Verify actual Header precedence after reordering Rules');
  await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('E2E root priority');
  await expect(rootRow).toBeVisible();
  await expect(nestedRow).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('');
  await expect(nestedRow).toBeVisible();
  await openFolderMenu(page, level1Id);
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(level1Id, 'rename')).click();
  await renameFields.fill('E2E renamed hierarchy');
  await renameFields.press('Enter');
  await getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(level1Id)).click();
  await expect(nestedRow).toBeHidden();
  await expandFolder(page, level1Id);
  await screenshotStep('搜索和目录重命名折叠不替换规则身份 / Search, folder rename and collapse preserve Rule identities');
  await rootRow.click({ button: 'right' });
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(rootRuleId, 'delete')).click();
  await expect(rootRow).toHaveCount(0);
  const rootSurface = getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface);
  const rootBounds = await rootSurface.boundingBox();
  if (!rootBounds) throw new Error('The Rules root drop surface is unavailable.');
  await nestedRow.dragTo(rootSurface, { targetPosition: { x: 20, y: rootBounds.height - 8 } });
  await openFolderMenu(page, level1Id);
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