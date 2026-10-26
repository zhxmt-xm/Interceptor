import { writeFile } from 'node:fs/promises';

import type { TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('rules.create-edit-delete creates, renames and deletes a Rule through the editor', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.create-edit-delete',
  });
  const { page } = desktopApp;
  const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);
  const statusState = getByAutomationId(page, AUTOMATION_IDS.rules.status.state);

  /** Create one complete enabled Rule and apply it. */
  const createRule = async (name: string): Promise<string> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    const row = ruleRows.last();
    await expect(row).toBeVisible();
    const automationId = await row.getAttribute('data-automation-id');
    if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) {
      throw new Error('The created Rule omitted its public identity.');
    }
    const ruleId = automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
    ).fill('127.0.0.1');
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
    ).fill('x-e2e-crud');
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
    ).fill('created');
    const enabled = getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled);
    if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click();
    await expect(enabled).toHaveAttribute('aria-checked', 'true');
    await apply.click();
    await expect(statusState).toHaveAttribute('data-state', 'applied');
    return ruleId;
  };

  // 准备：进入Rules并锁定空树。
  // Arrange: open Rules and lock the empty tree.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(ruleRows).toHaveCount(0);
  await screenshotStep('Rules空树 / The empty Rules tree');

  // 用户操作：新建并启用A。
  // User actions: create and enable Rule A.
  const ruleA = await createRule('E2E create-edit-delete');
  await screenshotStep('新建并启用规则A / Create and enable Rule A');

  // 用户操作：改名A并重新Apply。
  // User actions: rename Rule A and apply again.
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleA)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E create-edit-delete renamed');
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleA)))
    .toContainText('E2E create-edit-delete renamed');
  await screenshotStep('改名A并Apply / Rename Rule A and apply');

  // 准备第二条规则B，保证删除A后编辑器仍有可Apply的规则。
  // Create Rule B so the editor still has a Rule to apply after deleting A.
  const ruleB = await createRule('E2E delete keeps sibling');

  // 用户操作：选中A并从Editor删除，B保留；Apply后Core只剩B。
  // User actions: select A, delete it from the editor, keep B, then apply; Core keeps only B.
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleA)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.delete).click();
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleA))).toHaveCount(0);
  await expect(ruleRows).toHaveCount(1);
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleB)).click();
  await apply.click();
  await expect(statusState).toHaveAttribute('data-state', 'applied');
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleB))).toBeVisible();
  await screenshotStep('删除A并Apply，B保留 / Delete A, apply, and keep B');

  // 业务断言：切换workspace后Core仍只返回B。
  // Assert: after a workspace round trip, Core still returns only B.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(ruleRows).toHaveCount(1);
  await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleB))).toBeVisible();
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  const evidencePath = testInfo.outputPath('rules-create-edit-delete.json');
  await writeFile(evidencePath, JSON.stringify({
    createdRuleId: ruleA,
    renamed: 'E2E create-edit-delete renamed',
    keptRuleId: ruleB,
    deleted: true,
  }, null, 2), 'utf8');
  await testInfo.attach('rules-create-edit-delete.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
