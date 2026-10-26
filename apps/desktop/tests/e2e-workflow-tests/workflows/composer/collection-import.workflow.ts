import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import type {
  CollectionNode,
  CollectionRequest,
  ComposerFieldRow,
} from '@interceptor/core-protocol';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { COLLECTION_SAVE_DELAY_MS } from '../../../../src/renderer/features/composer/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { WorkflowProcessIdentity } from '../../fixtures/safety/workflow-host-safety-guard';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

const IMPORT_IDS = {
  toolbar: 'composer.collection.import',
  dialog: 'composer.import.dialog',
  fileName: 'composer.import.file-name',
  requestCount: 'composer.import.request-count',
  folderCount: 'composer.import.folder-count',
  skippedCount: 'composer.import.skipped-count',
  cancel: 'composer.import.cancel',
  confirm: 'composer.import.confirm-apply',
  busy: 'composer.import.busy',
  exportBusy: 'composer.export.busy',
  queryDraftName: 'composer.query.draft.name',
  queryDraftValue: 'composer.query.draft.value',
  queryDraftConfirm: 'composer.query.add',
  headerDraftName: 'composer.header.draft.name',
  headerDraftValue: 'composer.header.draft.value',
  headerDraftConfirm: 'composer.header.add',
} as const;

interface ExportedCollectionTree {
  readonly nodes: CollectionNode[];
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

function flattenCollection(nodes: readonly CollectionNode[]): CollectionNode[] {
  return nodes.flatMap((node) => node.kind === 'folder'
    ? [node, ...flattenCollection(node.children)]
    : [node]);
}

function fieldRowIds(request: CollectionRequest): string[] {
  return [...request.query, ...request.headers, ...request.bodyForm]
    .map((row: ComposerFieldRow) => row.id);
}

async function expandFolder(page: Page, folderId: string): Promise<void> {
  const toggle = getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolderToggle(folderId),
  );
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function chooseFile(
  page: Page,
  mainProcessOwner: WorkflowProcessIdentity,
  trigger: Locator,
  busyAutomationId: string,
  filePath: string,
): Promise<void> {
  await trigger.click();
  await expect(getByPublicAutomationId(page, busyAutomationId)).toBeVisible();
  await submitFileDialogPath(mainProcessOwner, filePath);
  await expect(getByPublicAutomationId(page, busyAutomationId)).toHaveCount(0);
}

async function selectMethod(page: Page, method: string): Promise<void> {
  const methodSelect = getByAutomationId(page, AUTOMATION_IDS.composer.method);
  expect(method).toBe('POST');
  await methodSelect.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(methodSelect).toContainText(method);
  await screenshotStep('选择POST方法，尚未发送 / Select POST without sending the request', {
    highlights: [{ target: methodSelect, label: '1' }],
  });
}

async function addDraftRow(
  page: Page,
  nameAutomationId: string,
  valueAutomationId: string,
  confirmAutomationId: string,
  name: string,
  value: string,
): Promise<void> {
  await getByPublicAutomationId(page, nameAutomationId).fill(name);
  await screenshotStep(`填写字段名称${name} / Enter the field name ${name}`, {
    highlights: [{ target: getByPublicAutomationId(page, nameAutomationId), label: '1' }],
  });
  await getByPublicAutomationId(page, valueAutomationId).fill(value);
  await screenshotStep(`填写${name}的值，尚未添加 / Enter the ${name} value before adding the row`, {
    highlights: [{ target: getByPublicAutomationId(page, valueAutomationId), label: '1' }],
  });
  await getByPublicAutomationId(page, confirmAutomationId).click();
  await screenshotStep(`添加并启用字段${name} / Add and enable the ${name} field`, {
    highlights: [{ target: page.locator(`input[value=${JSON.stringify(name)}]`).locator('..'), label: '1' }],
  });
}

async function countInputsWithValue(page: Page, expectedValue: string): Promise<number> {
  return page.locator('input').evaluateAll(
    (inputs, value) => inputs.filter(
      (input) => (input as HTMLInputElement).value === value,
    ).length,
    expectedValue,
  );
}

test('composer.collection.import appends product-exported requests with fresh identities', async ({
  desktopApp,
}, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native file dialog workflow requires Windows or macOS.');
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.collection.import',
  });

  const transferDirectory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-composer-import-'));
  const exportPath = path.join(transferDirectory, 'collection-roundtrip.json');
  const { page } = desktopApp;
  const mainProcessOwner = desktopApp.nativeFileDialogOwner();

  try {
    // 先锁定新能力入口；旧提交必须在这里因真实产品缺口取得Red。
    // Lock the new capability first; the old commit must become Red here on the real product gap.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    const importCollection = getByPublicAutomationId(page, IMPORT_IDS.toolbar);
    await expect(importCollection).toBeVisible();
    await screenshotStep('先锁定新能力入口；旧提交必须在这里因真实产品缺口取得Red。 / Lock the new capability first; the old commit must become Red here on the real product gap.');

    // 通过真实Composer UI创建两个带字段的请求和一层目录，并把第二个请求拖入目录。
    // Create two requests with fields and one folder through the real Composer UI, then drag the second request into it.
    const requestRows = getByAutomationIdPrefix(
      page,
      AUTOMATION_ID_PREFIXES.composerCollectionRequest,
    );
    const folderRows = getByAutomationIdPrefix(
      page,
      AUTOMATION_ID_PREFIXES.composerCollectionFolder,
    );
    const renameFields = getByAutomationIdPrefix(
      page,
      AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
    );
    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await expect(requestRows).toHaveCount(1);
    await screenshotStep('新建第一条Collection请求 / Create the first Collection request', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
    });
    const firstRequestId = await automationSuffix(
      requestRows.first(),
      AUTOMATION_ID_PREFIXES.composerCollectionRequest,
    );
    await selectMethod(page, 'POST');
    await getByAutomationId(page, AUTOMATION_IDS.composer.url)
      .fill('collection.e2e.invalid/first?existing=1');
    await screenshotStep('填写第一条请求的URL与已有Query / Enter the first request URL with its existing query', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
    await screenshotStep('打开Query表格，URL参数不变为表格行 / Open Query without turning URL parameters into table rows', {
      highlights: [{ target: getByPublicAutomationId(page, IMPORT_IDS.queryDraftName), label: '1' }],
    });
    await addDraftRow(
      page,
      IMPORT_IDS.queryDraftName,
      IMPORT_IDS.queryDraftValue,
      IMPORT_IDS.queryDraftConfirm,
      'source',
      'first',
    );
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await addDraftRow(
      page,
      IMPORT_IDS.headerDraftName,
      IMPORT_IDS.headerDraftValue,
      IMPORT_IDS.headerDraftConfirm,
      'x-collection-e2e',
      'first',
    );

    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await expect(requestRows).toHaveCount(2);
    await screenshotStep('新建独立的第二条请求 / Create a separate second request', {
      highlights: [{ target: requestRows.last(), label: '1' }],
    });
    const secondRequestId = await automationSuffix(
      requestRows.last(),
      AUTOMATION_ID_PREFIXES.composerCollectionRequest,
    );
    await getByAutomationId(page, AUTOMATION_IDS.composer.url)
      .fill('collection.e2e.invalid/second');
    await screenshotStep('填写第二条请求自己的URL / Enter the second request URL', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await addDraftRow(
      page,
      IMPORT_IDS.headerDraftName,
      IMPORT_IDS.headerDraftValue,
      IMPORT_IDS.headerDraftConfirm,
      'x-collection-e2e',
      'second',
    );

    await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
    await expect(renameFields).toHaveCount(1);
    await screenshotStep('新建Collection目录并编辑名称 / Create a Collection folder and edit its name', {
      highlights: [{ target: renameFields, label: '1' }],
    });
    const originalFolderId = await automationSuffix(
      renameFields,
      AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
    );
    await renameFields.fill('E2E collection folder');
    await renameFields.press('Enter');
    const originalFolderTarget = getByAutomationId(
      page,
      AutomationIdFactory.composerCollectionFolderTarget(originalFolderId),
    );
    await screenshotStep('保存目录名称，尚未移入请求 / Save the folder name before moving a request into it', {
      highlights: [{ target: originalFolderTarget, label: '1' }],
    });
    await getByAutomationId(
      page,
      AutomationIdFactory.composerCollectionRequest(secondRequestId),
    ).dragTo(originalFolderTarget);
    await expandFolder(page, originalFolderId);
    await expect(getByAutomationId(
      originalFolderTarget.locator('xpath=ancestor::section[1]'),
      AutomationIdFactory.composerCollectionRequest(secondRequestId),
    )).toHaveCount(1);
    await screenshotStep('将第二条请求移入新目录 / Move the second request into the new folder', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(secondRequestId)), label: '1' }],
    });
    await page.waitForTimeout(COLLECTION_SAVE_DELAY_MS * 2);
    await screenshotStep('通过真实Composer UI创建两个带字段的请求和一层目录，并把第二个请求拖入目录。 / Create two requests with fields and one folder through the real Composer UI, then drag the second request into it.');

    // Export经真实Save Dialog生成唯一导入文件；测试只读确认请求字段与目录层级。
    // Export creates the only Import input through the real Save Dialog; the test only reads fields and hierarchy.
    await chooseFile(
      page,
      mainProcessOwner,
      getByAutomationId(page, AUTOMATION_IDS.composer.exportCollection),
      IMPORT_IDS.exportBusy,
      exportPath,
    );
    const exportedText = await readFile(exportPath, 'utf8');
    const exported = JSON.parse(exportedText) as ExportedCollectionTree;
    const exportedNodes = flattenCollection(exported.nodes);
    const exportedRequests = exportedNodes.filter(
      (node): node is CollectionRequest => node.kind === 'request',
    );
    expect(exportedNodes.map((node) => node.id)).toEqual([
      firstRequestId,
      originalFolderId,
      secondRequestId,
    ]);
    expect(exportedRequests.map((request) => ({
      method: request.method,
      url: request.url,
      query: request.query.map(({ name, value, enabled }) => ({ name, value, enabled })),
      headers: request.headers.map(({ name, value, enabled }) => ({ name, value, enabled })),
    }))).toEqual([
      {
        method: 'POST',
        url: 'collection.e2e.invalid/first?existing=1',
        query: expect.arrayContaining([{ name: 'source', value: 'first', enabled: true }]),
        headers: expect.arrayContaining([
          { name: 'x-collection-e2e', value: 'first', enabled: true },
        ]),
      },
      {
        method: 'GET',
        url: 'collection.e2e.invalid/second',
        query: [],
        headers: expect.arrayContaining([
          { name: 'x-collection-e2e', value: 'second', enabled: true },
        ]),
      },
    ]);
    const exportedNodeIds = exportedNodes.map((node) => node.id);
    const exportedFieldIds = exportedRequests.flatMap(fieldRowIds);
    await testInfo.attach('product-exported-collection', {
      body: Buffer.from(exportedText),
      contentType: 'application/json',
    });
    await screenshotStep('Export经真实Save Dialog生成唯一导入文件；测试只读确认请求字段与目录层级。 / Export creates the only Import input through the real Save Dialog; the test only reads fields and hierarchy.');

    // 第一次Import取消，树、打开文档、目录落点和Core持久化内容必须全部不变。
    // Cancel the first Import; tree, active document, target folder, and persisted content must all remain unchanged.
    await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(firstRequestId))
      .click();
    await originalFolderTarget.click();
    await expect(originalFolderTarget).toHaveAttribute('aria-pressed', 'true');
    // Capture the selected folder after the pointer has left its hover-only actions.
    await getByAutomationId(page, AUTOMATION_IDS.app.statusbar).hover();
    await screenshotStep('导入前保留当前请求与目录落点 / Retain the active request and target folder before importing', {
      highlights: [{ target: originalFolderTarget, label: '1' }],
    });
    await chooseFile(page, mainProcessOwner, importCollection, IMPORT_IDS.busy, exportPath);
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toBeVisible();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.fileName))
      .toHaveText('collection-roundtrip.json');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.requestCount)).toHaveText('2');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.folderCount)).toHaveText('1');
    await expect(getByPublicAutomationId(page, IMPORT_IDS.skippedCount)).toHaveText('0');
    await screenshotStep('检查导入预览，准备取消 / Inspect the import preview before cancelling', {
      highlights: [
        { target: getByPublicAutomationId(page, IMPORT_IDS.dialog), label: '1' },
        { target: getByPublicAutomationId(page, IMPORT_IDS.cancel), label: '2' },
      ],
    });
    await getByPublicAutomationId(page, IMPORT_IDS.cancel).click();
    await expect(requestRows).toHaveCount(2);
    await expect(folderRows).toHaveCount(1);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url))
      .toHaveValue('collection.e2e.invalid/first?existing=1');
    await expect(originalFolderTarget).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep('第一次Import取消，树、打开文档、目录落点和Core持久化内容必须全部不变。 / Cancel the first Import; tree, active document, target folder, and persisted content must all remain unchanged.');

    // 确认Import后，节点与字段行ID全部重生成，内容与层级保留且当前文档/落点不变。
    // Confirm Import; regenerate every node and field-row ID while preserving content, hierarchy, active document, and target.
    await chooseFile(page, mainProcessOwner, importCollection, IMPORT_IDS.busy, exportPath);
    await screenshotStep('重新打开同一文件，检查确认前的导入预览 / Reopen the same file and inspect the preview before confirming', {
      highlights: [
        { target: getByPublicAutomationId(page, IMPORT_IDS.dialog), label: '1' },
        { target: getByPublicAutomationId(page, IMPORT_IDS.confirm), label: '2' },
      ],
    });
    await getByPublicAutomationId(page, IMPORT_IDS.confirm).click();
    await expect(getByPublicAutomationId(page, IMPORT_IDS.dialog)).toHaveCount(0);
    await expect(folderRows).toHaveCount(2);
    const folderIdsAfterImport = await automationSuffixes(
      folderRows,
      AUTOMATION_ID_PREFIXES.composerCollectionFolder,
    );
    const importedFolderId = folderIdsAfterImport.find((id) => id !== originalFolderId);
    expect(importedFolderId).toBeDefined();
    await expandFolder(page, importedFolderId!);
    await expect(requestRows).toHaveCount(4);
    await screenshotStep('确认导入后展开追加的Collection / Expand the appended Collection after confirming import', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(importedFolderId!)), label: '1' }],
    });
    const requestIdsAfterImport = await automationSuffixes(
      requestRows,
      AUTOMATION_ID_PREFIXES.composerCollectionRequest,
    );
    const importedRequestIds = requestIdsAfterImport.filter(
      (id) => id !== firstRequestId && id !== secondRequestId,
    );
    expect(importedRequestIds).toHaveLength(2);
    expect(new Set([...folderIdsAfterImport, ...requestIdsAfterImport]).size).toBe(6);
    expect(exportedNodeIds).not.toContain(importedFolderId);
    expect(importedRequestIds.every((id) => !exportedNodeIds.includes(id))).toBe(true);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url))
      .toHaveValue('collection.e2e.invalid/first?existing=1');
    await expect(originalFolderTarget).toHaveAttribute('aria-pressed', 'true');

    const importedFirstRow = getByAutomationId(
      page,
      AutomationIdFactory.composerCollectionRequest(importedRequestIds[0]!),
    );
    await importedFirstRow.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url))
      .toHaveValue('collection.e2e.invalid/first?existing=1');
    await screenshotStep('打开导入的请求，检查保留的URL / Open an imported request and inspect its retained URL', {
      highlights: [
        { target: importedFirstRow, label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
    await expect.poll(() => countInputsWithValue(page, 'source')).toBe(1);
    await screenshotStep('检查导入后保留的Query行 / Inspect the imported Query row', {
      highlights: [{ target: page.locator('input[value="source"]').locator('..'), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await expect.poll(() => countInputsWithValue(page, 'x-collection-e2e')).toBe(1);
    await screenshotStep('确认Import后，节点与字段行ID全部重生成，内容与层级保留且当前文档/落点不变。 / Confirm Import; regenerate every node and field-row ID while preserving content, hierarchy, active document, and target.');

    // 切出再返回必须从Core恢复同一导入身份；导出快照中的字段ID不得在新树出现。
    // Remount through Core with the same imported identities; exported field IDs must never reappear.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    await page.waitForTimeout(COLLECTION_SAVE_DELAY_MS * 2);
    await expandFolder(page, originalFolderId);
    await expandFolder(page, importedFolderId!);
    expect(await automationSuffixes(requestRows, AUTOMATION_ID_PREFIXES.composerCollectionRequest))
      .toEqual(requestIdsAfterImport);
    await screenshotStep('切回Composer后保留原集合与导入集合 / Retain both original and imported Collections after returning to Composer', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(importedFolderId!)), label: '1' }],
    });
    const persistedExportPath = path.join(transferDirectory, 'collection-persisted.json');
    await chooseFile(
      page,
      mainProcessOwner,
      getByAutomationId(page, AUTOMATION_IDS.composer.exportCollection),
      IMPORT_IDS.exportBusy,
      persistedExportPath,
    );
    const persisted = JSON.parse(await readFile(persistedExportPath, 'utf8')) as ExportedCollectionTree;
    const persistedRequests = flattenCollection(persisted.nodes).filter(
      (node): node is CollectionRequest => node.kind === 'request',
    );
    const persistedImportedRequests = persistedRequests.filter((request) =>
      importedRequestIds.includes(request.id));
    expect(persistedImportedRequests).toHaveLength(2);
    expect(persistedImportedRequests.flatMap(fieldRowIds).some((id) =>
      exportedFieldIds.includes(id))).toBe(false);
    await screenshotStep('切出再返回必须从Core恢复同一导入身份；导出快照中的字段ID不得在新树出现。 / Remount through Core with the same imported identities; exported field IDs must never reappear.');

    // 保存原始/导入节点与字段身份；fixture随后负责trace、正常Close、8888释放和profile删除。
    // Save original/imported node and field identities; the fixture then owns trace, normal Close, port release, and profile deletion.
    const evidencePath = testInfo.outputPath('composer-collection-import.json');
    await writeFile(evidencePath, JSON.stringify({
      exportedNodeIds,
      exportedFieldIds,
      importedFolderId,
      importedRequestIds,
      importedFieldIds: persistedImportedRequests.flatMap(fieldRowIds),
    }, null, 2), 'utf8');
    await testInfo.attach('composer-collection-import', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } finally {
    await rm(transferDirectory, { recursive: true, force: true });
  }
});
