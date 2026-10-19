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
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  expect(automationId?.startsWith(prefix)).toBe(true);
  return automationId!.slice(prefix.length);
}

async function openFolderMenu(page: Page, folderId: string): Promise<void> {
  await getByAutomationId(page, AutomationIdFactory.ruleFolderRow(folderId)).hover();
  await getByAutomationId(page, AutomationIdFactory.ruleFolderMenu(folderId)).click();
}

async function addAction(page: Page, optionAutomationId: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, optionAutomationId).click();
}

test('rules.action-tag-overflow keeps row actions compact and fully accessible', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.action-tag-overflow',
  });

  const { page } = desktopApp;
  const folderRename = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleFolderRename,
  );

  // 通过真实Rules菜单创建三级目录，锁定最窄的合法Rule row宽度。
  // Create three folder levels through real Rules menus to lock the narrowest legal Rule row.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.createFolder).click();
  const level1Id = await dynamicId(folderRename, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await folderRename.fill('E2E action tags level 1');
  await folderRename.press('Enter');

  await openFolderMenu(page, level1Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level1Id, 'new-folder'),
  ).click();
  const level2Id = await dynamicId(folderRename, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await folderRename.fill('E2E action tags level 2');
  await folderRename.press('Enter');

  await openFolderMenu(page, level2Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level2Id, 'new-folder'),
  ).click();
  const level3Id = await dynamicId(folderRename, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await folderRename.fill('E2E action tags level 3');
  await folderRename.press('Enter');
  await screenshotStep('通过真实Rules菜单创建三级目录，锁定最窄的合法Rule row宽度。 / Create three folder levels through real Rules menus to lock the narrowest legal Rule row.');

  // 在第三级目录创建Rule，并按真实用户顺序添加四类可区分chip的action。
  // Create a Rule in the third-level folder and add four distinct chip categories in user order.
  await openFolderMenu(page, level3Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleNodeAction(level3Id, 'new-rule'),
  ).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  await expect(ruleRow).toHaveCount(1);
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName)
    .fill('E2E ordered action tags');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await addAction(page, AUTOMATION_IDS.rules.actionOption.mapLocal);
  await addAction(page, AUTOMATION_IDS.rules.actionOption.header);
  await addAction(page, AUTOMATION_IDS.rules.actionOption.delay);
  await addAction(page, AUTOMATION_IDS.rules.actionOption.breakpoint);
  const level3Target = getByAutomationId(
    page,
    AutomationIdFactory.ruleFolderTarget(level3Id),
  );
  const ruleTarget = getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId));
  await level3Target.click();
  await expect(level3Target).toHaveAttribute('aria-pressed', 'true');
  await expect(ruleTarget).toHaveAttribute('aria-pressed', 'false');
  await screenshotStep('在第三级目录创建Rule，并按真实用户顺序添加四类可区分chip的action。 / Create a Rule in the third-level folder and add four distinct chip categories in user order.');

  // 行内必须只有前两个chip；省略入口与hit count不重叠，整行不得横向溢出。
  // Only the first two chips stay inline; overflow and hit count cannot overlap or widen the row.
  const overflow = getByAutomationId(
    page,
    AutomationIdFactory.ruleActionOverflow(ruleId),
  );
  await expect(overflow).toBeVisible();
  const inlineChips = [0, 1].map((index) => getByAutomationId(
    page,
    AutomationIdFactory.ruleInlineActionChip(ruleId, index),
  ));
  await Promise.all(inlineChips.map((chip) => expect(chip).toBeVisible()));
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.ruleInlineActionChip(ruleId, 2),
  )).toHaveCount(0);
  const inlineKinds = await Promise.all(inlineChips.map((chip) =>
    chip.getAttribute('data-chip-kind')));
  expect(inlineKinds).toEqual(['map', 'rewrite']);
  const [firstTagBox, secondTagBox, overflowBox, hitBox] = await Promise.all([
    inlineChips[0]!.boundingBox(),
    inlineChips[1]!.boundingBox(),
    overflow.boundingBox(),
    getByAutomationId(page, AutomationIdFactory.ruleHitCount(ruleId)).boundingBox(),
  ]);
  expect(firstTagBox).not.toBeNull();
  expect(secondTagBox).not.toBeNull();
  expect(overflowBox).not.toBeNull();
  expect(hitBox).not.toBeNull();
  expect(firstTagBox!.height).toBeLessThan(overflowBox!.height);
  expect(secondTagBox!.height).toBeLessThan(overflowBox!.height);
  const overflowCenter = overflowBox!.y + overflowBox!.height / 2;
  expect(Math.abs(firstTagBox!.y + firstTagBox!.height / 2 - overflowCenter))
    .toBeLessThan(0.5);
  expect(Math.abs(secondTagBox!.y + secondTagBox!.height / 2 - overflowCenter))
    .toBeLessThan(0.5);
  expect(overflowBox!.x + overflowBox!.width).toBeLessThanOrEqual(hitBox!.x);
  expect(await ruleRow.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await screenshotStep('行内必须只有前两个chip；省略入口与hit count不重叠，整行不得横向溢出。 / Only the first two chips stay inline; overflow and hit count cannot overlap or widen the row.');

  // Mouse hover与keyboard focus都展示完整有序Tooltip，入口本身不改变Rule状态。
  // Mouse hover and keyboard focus both reveal the full ordered Tooltip without changing Rule state.
  await overflow.hover();
  const overflowChips = [0, 1, 2, 3].map((index) => getByAutomationId(
    page,
    AutomationIdFactory.ruleOverflowActionChip(ruleId, index),
  ));
  await Promise.all(overflowChips.map((chip) => expect(chip).toBeVisible()));
  expect(await Promise.all(overflowChips.map((chip) =>
    chip.getAttribute('data-chip-kind')))).toEqual(['map', 'rewrite', 'flow', 'brk']);
  await page.mouse.move(0, 0);
  await Promise.all(overflowChips.map((chip) => expect(chip).toBeHidden()));
  await overflow.focus();
  await Promise.all(overflowChips.map((chip) => expect(chip).toBeVisible()));
  await overflow.press('Enter');
  await expect(level3Target).toHaveAttribute('aria-pressed', 'true');
  await expect(ruleTarget).toHaveAttribute('aria-pressed', 'false');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName))
    .toHaveValue('E2E ordered action tags');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled))
    .toHaveAttribute('aria-checked', 'false');
  await screenshotStep('Mouse hover与keyboard focus都展示完整有序Tooltip，入口本身不改变Rule状态。 / Mouse hover and keyboard focus both reveal the full ordered Tooltip without changing Rule state.');

  // 保存结构、顺序与几何事实；driver随后验证正常销毁及系统副作用恢复。
  // Save structure, order, and geometry facts; the driver then verifies teardown and restoration.
  const evidencePath = testInfo.outputPath('rules-action-tag-overflow.json');
  await writeFile(evidencePath, JSON.stringify({
    folderIds: [level1Id, level2Id, level3Id],
    ruleId,
    inlineKinds,
    overflowKinds: ['map', 'rewrite', 'flow', 'brk'],
    inlineTagBoxes: [firstTagBox, secondTagBox],
    overflowBox,
    hitBox,
    rowClientWidth: await ruleRow.evaluate((element) => element.clientWidth),
    rowScrollWidth: await ruleRow.evaluate((element) => element.scrollWidth),
    folderSelected: await level3Target.getAttribute('aria-pressed'),
    ruleSelected: await ruleTarget.getAttribute('aria-pressed'),
    editorName: await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).inputValue(),
    ruleEnabled: await getByAutomationId(
      page,
      AUTOMATION_IDS.rules.editorEnabled,
    ).getAttribute('aria-checked'),
  }, null, 2), 'utf8');
  await testInfo.attach('rules-action-tag-overflow', {
    path: evidencePath,
    contentType: 'application/json',
  });
  await screenshotStep('保存结构、顺序与几何事实；driver随后验证正常销毁及系统副作用恢复。 / Save structure, order, and geometry facts; the driver then verifies teardown and restoration.');
});