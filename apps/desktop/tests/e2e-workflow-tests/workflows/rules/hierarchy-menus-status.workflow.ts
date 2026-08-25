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
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

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
  loopbackLab,
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
  }, null, 2), 'utf8');
  await testInfo.attach('rules-hierarchy-status', {
    path: evidencePath,
    contentType: 'application/json',
  });
});