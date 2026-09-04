import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import type { RuleNode } from '@interceptor/core-protocol';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { expect, test } from '../../fixtures/local-electron-driver';
import {
  submitWindowsFileDialogPath,
  type WindowsFileDialogOwner,
} from '../../fixtures/windows-file-dialog';

const IMPORT_IDS = {
  toolbar: 'rules.toolbar.import',
  dialog: 'rules.import.dialog',
  fileName: 'rules.import.file-name',
  ruleCount: 'rules.import.rule-count',
  folderCount: 'rules.import.folder-count',
  enabledCount: 'rules.import.enabled-count',
  skippedCount: 'rules.import.skipped-count',
  cancel: 'rules.import.cancel',
  confirm: 'rules.import.confirm-apply',
  busy: 'rules.import.busy',
  exportBusy: 'rules.export.busy',
} as const;

interface ExportedRuleTree {
  readonly nodes: RuleNode[];
}

function getByPublicAutomationId(
  scope: Pick<Page, 'locator'> | Pick<Locator, 'locator'>,
  automationId: string,
): Locator {
  return scope.locator(`[data-automation-id=${JSON.stringify(automationId)}]`);
}

async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  expect(automationId?.startsWith(prefix)).toBe(true);
  return automationId!.slice(prefix.length);
}

async function automationSuffixes(locator: Locator, prefix: string): Promise<string[]> {
  const automationIds = await locator.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-automation-id')));
  expect(automationIds.every((automationId) => automationId?.startsWith(prefix))).toBe(true);
  return automationIds.map((automationId) => automationId!.slice(prefix.length));
}

function flattenRuleTree(nodes: readonly RuleNode[]): RuleNode[] {
  return nodes.flatMap((node) => node.kind === 'folder'
    ? [node, ...flattenRuleTree(node.children)]
    : [node]);
}

async function completeRule(
  page: Page,
  ruleId: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill(`x-${name.toLowerCase().replaceAll(' ', '-')}`);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill('active');
  const enabledSwitch = getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled);
  if (enabled) {
    await enabledSwitch.click();
  }
  await expect(enabledSwitch).toHaveAttribute('aria-checked', String(enabled));
}

async function expandRuleFolder(page: Page, folderId: string): Promise<void> {
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(folderId));
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function chooseFile(
  page: Page,
  mainProcessOwner: WindowsFileDialogOwner,
  trigger: Locator,
  busyAutomationId: string,
  filePath: string,
): Promise<void> {
  await page.bringToFront();
  await trigger.click();
  await expect(getByPublicAutomationId(page, busyAutomationId)).toBeVisible();
  await submitWindowsFileDialogPath(mainProcessOwner, filePath);
  await page.bringToFront();
  await expect(getByPublicAutomationId(page, busyAutomationId)).toHaveCount(0);
}

test('rules.import-tree appends a product-exported tree without reusing identities', async ({
  desktopApp,
}, testInfo) => {
  test.skip(process.platform !== 'win32', '真实文件对话框 workflow 目前只在 Windows 执行。');
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.import-tree',
  });

  const transferDirectory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-rules-import-'));
  const exportPath = path.join(transferDirectory, 'rules-roundtrip.json');
  const { page } = desktopApp;
  const mainProcessOwner = desktopApp.windowsMainProcessOwner();

  try {
    // 先锁定新能力入口；旧提交必须在这里因真实产品缺口取得Red。
    // Lock the new capability first; the old commit must become Red here on the real product gap.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    const importRules = getByPublicAutomationId(page, IMPORT_IDS.toolbar);
    await expect(importRules).toBeVisible();

    // 通过真实Rules UI创建两条完整规则和一层目录，再把第二条拖入目录并Apply。
    // Build two complete Rules and one folder through the real UI, then drag the second Rule into it and Apply.
    const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
    const folderRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRow);
    const folderRename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
    const createRule = getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create);
    await createRule.click();
    await expect(ruleRows).toHaveCount(1);
    const enabledRuleId = await automationSuffix(ruleRows.first(), AUTOMATION_ID_PREFIXES.ruleRow);
    await completeRule(page, enabledRuleId, 'E2E enabled rule', true);

    await createRule.click();
    await expect(ruleRows).toHaveCount(2);
    const disabledRuleId = await automationSuffix(ruleRows.last(), AUTOMATION_ID_PREFIXES.ruleRow);
    await completeRule(page, disabledRuleId, 'E2E disabled rule', false);

    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.createFolder).click();
    await expect(folderRename).toHaveCount(1);
    const originalFolderId = await automationSuffix(
      folderRename,
      AUTOMATION_ID_PREFIXES.ruleFolderRename,
    );
    await folderRename.fill('E2E imported folder');
    await folderRename.press('Enter');
    const originalFolderTarget = getByAutomationId(
      page,
      AutomationIdFactory.ruleFolderTarget(originalFolderId),
    );
    await getByAutomationId(page, AutomationIdFactory.ruleRow(disabledRuleId))
      .dragTo(originalFolderTarget);
    await expandRuleFolder(page, originalFolderId);
    await expect(getByPublicAutomationId(
      originalFolderTarget.locator('xpath=ancestor::section[1]'),
      AutomationIdFactory.ruleRow(disabledRuleId),
    )).toHaveCount(1);

    await getByAutomationId(page, AutomationIdFactory.ruleRow(enabledRuleId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state))
      .toHaveAttribute('data-state', 'applied');
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', '1');

    // Export必须经真实Save Dialog落盘；测试只在产品写完后只读解析同一JSON。
    // Export must write through the real Save Dialog; the test only reads the same JSON after the product writes it.
    await chooseFile(
      page,
      mainProcessOwner,
      getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.exportRules),
      IMPORT_IDS.exportBusy,
      exportPath,
    );
    const exportedText = await readFile(exportPath, 'utf8');
    const exported = JSON.parse(exportedText) as ExportedRuleTree;
    const exportedNodes = flattenRuleTree(exported.nodes);
    const exportedRules = exportedNodes.filter((node) => node.kind === 'rule');
    expect(exportedNodes.map((node) => node.id)).toEqual([
      enabledRuleId,
      originalFolderId,
      disabledRuleId,
    ]);
    expect(exportedRules.map((rule) => ({ name: rule.name, enabled: rule.enabled }))).toEqual([
      { name: 'E2E enabled rule', enabled: true },
      { name: 'E2E disabled rule', enabled: false },
    ]);
    await testInfo.attach('product-exported-rules', {
      body: Buffer.from(exportedText),
      contentType: 'application/json',
    });

    // 第一次Import在确认Dialog取消，树身份、顺序与Core revision必须保持不变。
    // Cancel the first Import preview; tree identity, ordering, and Core revision must remain unchanged.
    await chooseFile(page, mainProcessOwner, importRules, IMPORT_IDS.busy, exportPath);
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toBeVisible();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.fileName))
      .toHaveText('rules-roundtrip.json');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.ruleCount)).toHaveText('2');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.folderCount)).toHaveText('1');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.enabledCount)).toHaveText('1');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.skippedCount)).toHaveText('0');
    await getByPublicAutomationId(page, IMPORT_IDS.cancel).click();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toHaveCount(0);
    expect(await automationSuffixes(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow)).toEqual([
      enabledRuleId,
      disabledRuleId,
    ]);
    expect(await automationSuffixes(folderRows, AUTOMATION_ID_PREFIXES.ruleFolderRow))
      .toEqual([originalFolderId]);
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', '1');

    // 再次Import并确认，验证追加位置、全新ID、enabled沿用、目录层级与原子持久化。
    // Import again and confirm, proving append order, fresh IDs, preserved enabled state, hierarchy, and atomic persistence.
    await chooseFile(page, mainProcessOwner, importRules, IMPORT_IDS.busy, exportPath);
    await getByPublicAutomationId(page, IMPORT_IDS.confirm).click();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toHaveCount(0);
    await expect(folderRows).toHaveCount(2);
    const folderIdsAfterImport = await automationSuffixes(
      folderRows,
      AUTOMATION_ID_PREFIXES.ruleFolderRow,
    );
    const importedFolderId = folderIdsAfterImport.find((folderId) => folderId !== originalFolderId);
    expect(importedFolderId).toBeDefined();
    await expandRuleFolder(page, importedFolderId!);
    await expect(ruleRows).toHaveCount(4);
    const ruleIdsAfterImport = await automationSuffixes(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow);
    expect(ruleIdsAfterImport.slice(0, 2)).toEqual([enabledRuleId, disabledRuleId]);
    const importedRuleIds = ruleIdsAfterImport.filter(
      (ruleId) => ruleId !== enabledRuleId && ruleId !== disabledRuleId,
    );
    expect(importedRuleIds).toHaveLength(2);
    expect(new Set([...folderIdsAfterImport, ...ruleIdsAfterImport]).size).toBe(6);
    await expect(getByAutomationId(page, AutomationIdFactory.ruleToggle(importedRuleIds[0]!)))
      .toHaveAttribute('aria-checked', 'true');
    await expect(getByAutomationId(page, AutomationIdFactory.ruleToggle(importedRuleIds[1]!)))
      .toHaveAttribute('aria-checked', 'false');
    await expect(getByPublicAutomationId(
      getByAutomationId(
        page,
        AutomationIdFactory.ruleFolderTarget(importedFolderId!),
      ).locator('xpath=ancestor::section[1]'),
      AutomationIdFactory.ruleRow(importedRuleIds[1]!),
    )).toHaveCount(1);
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', '2');

    // Reload Renderer后必须从Core恢复同一批身份；随后重复导入仍只能追加全新节点。
    // Reload Renderer to restore the same identities from Core, then repeat Import and require another fresh append.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toBeVisible();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expandRuleFolder(page, originalFolderId);
    await expandRuleFolder(page, importedFolderId!);
    expect(await automationSuffixes(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow))
      .toEqual(ruleIdsAfterImport);
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', '2');

    await chooseFile(page, mainProcessOwner, importRules, IMPORT_IDS.busy, exportPath);
    await getByPublicAutomationId(page, IMPORT_IDS.confirm).click();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toHaveCount(0);
    await expect(folderRows).toHaveCount(3);
    const finalFolderIds = await automationSuffixes(folderRows, AUTOMATION_ID_PREFIXES.ruleFolderRow);
    const repeatedFolderId = finalFolderIds.find((folderId) =>
      folderId !== originalFolderId && folderId !== importedFolderId);
    expect(repeatedFolderId).toBeDefined();
    await expandRuleFolder(page, repeatedFolderId!);
    await expect(ruleRows).toHaveCount(6);
    const finalRuleIds = await automationSuffixes(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow);
    expect(new Set([...finalFolderIds, ...finalRuleIds]).size).toBe(9);
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', '3');

    // 保存三代身份与revision证据；fixture随后负责trace、正常Close、8888释放和profile删除。
    // Save three generations of identity and revision evidence; the fixture then owns trace, normal Close, port release, and profile deletion.
    const evidencePath = testInfo.outputPath('rules-import-tree.json');
    await writeFile(evidencePath, JSON.stringify({
      exportedNodeIds: exportedNodes.map((node) => node.id),
      firstImport: {
        folderIds: folderIdsAfterImport,
        ruleIds: ruleIdsAfterImport,
      },
      repeatedImport: {
        folderIds: finalFolderIds,
        ruleIds: finalRuleIds,
      },
      revision: 3,
    }, null, 2), 'utf8');
    await testInfo.attach('rules-import-tree', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } finally {
    await rm(transferDirectory, { recursive: true, force: true });
  }
});