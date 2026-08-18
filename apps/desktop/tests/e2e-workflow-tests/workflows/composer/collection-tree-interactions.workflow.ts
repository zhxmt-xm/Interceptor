import { writeFile } from 'node:fs/promises';

import type { Locator, Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { COLLECTION_SAVE_DELAY_MS } from '../../../../src/renderer/features/composer/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { expect, test } from '../../fixtures/local-electron-driver';

async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  expect(automationId?.startsWith(prefix)).toBe(true);
  return automationId!.slice(prefix.length);
}

async function openFolderMenu(page: Page, folderId: string): Promise<void> {
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolder(folderId),
  ).hover();
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolderMenu(folderId),
  ).click();
}

test('composer.collection.tree-interactions keeps tree intent and layout independent', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.collection.tree-interactions',
  });

  const { page } = desktopApp;
  const folderRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionFolder,
  );
  const renameFields = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );

  // 通过toolbar与目录菜单连续创建三级目录，每次都走同一行内rename流程。
  // Create three folder levels through the toolbar and folder menus, using the same inline rename flow.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
  await expect(renameFields).toHaveCount(1);
  const level1Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 1');
  await renameFields.press('Enter');

  await openFolderMenu(page, level1Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level1Id, 'new-folder'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  const level2Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 2');
  await renameFields.press('Enter');

  await openFolderMenu(page, level2Id);
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level2Id, 'new-folder'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  const level3Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 3');
  await renameFields.press('Enter');
  await expect(folderRows).toHaveCount(3);

  // 第三层菜单必须禁用继续嵌套，但仍允许在该目录中新建request。
  // The third-level menu must disable deeper nesting while still allowing request creation.
  await openFolderMenu(page, level3Id);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-folder'),
  )).toBeDisabled();
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-request'),
  ).click();
  const requestRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionRequest,
  );
  await expect(requestRows).toHaveCount(1);
  const requestId = await automationSuffix(
    requestRows,
    AUTOMATION_ID_PREFIXES.composerCollectionRequest,
  );
  const requestUrl = 'collection.e2e.invalid/request';
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  await url.fill(requestUrl);

  // request右键菜单进入同一行内rename，提交后节点身份与打开文档保持。
  // Use the request context menu for inline rename while preserving node identity and the open document.
  await requestRows.click({ button: 'right' });
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  await expect(renameFields).toHaveAttribute(
    'data-automation-id',
    AutomationIdFactory.composerCollectionFolderRename(requestId),
  );
  await renameFields.fill('E2E renamed request');
  await renameFields.press('Enter');

  // 在节流保存触发前立即卸载Composer，返回后必须由Core恢复最新rename与URL。
  // Unmount Composer before the debounce fires; remount must restore the latest rename and URL from Core.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  const persistedRequest = getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionRequest(requestId),
  );
  await page.waitForTimeout(COLLECTION_SAVE_DELAY_MS * 2);
  const persistedRequestCount = await persistedRequest.count();
  const remountPersistence = {
    count: persistedRequestCount,
    name: persistedRequestCount ? await persistedRequest.textContent() : null,
    url: await url.count() ? await url.inputValue() : null,
  };
  expect(remountPersistence).toMatchObject({
    count: 1,
    name: expect.stringContaining('E2E renamed request'),
    url: requestUrl,
  });

  // 目录选择和空白取消只改变新建落点，不得关闭或替换当前request。
  // Folder selection and whitespace clearing change only the creation target, never the active request.
  const level1Target = getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolderTarget(level1Id),
  );
  await level1Target.click();
  await expect(level1Target).toHaveAttribute('aria-pressed', 'true');
  await expect(url).toHaveValue(requestUrl);
  const collectionTree = getByAutomationId(page, AUTOMATION_IDS.composer.collectionTree);
  const treeBox = await collectionTree.boundingBox();
  expect(treeBox).not.toBeNull();
  await collectionTree.click({ position: { x: 12, y: treeBox!.height - 8 } });
  await expect(level1Target).toHaveAttribute('aria-pressed', 'false');
  await expect(url).toHaveValue(requestUrl);

  // 拖动Collection splitter只改变左栏宽度，树与当前文档仍保持可用。
  // Drag the Collection splitter to change only layout while preserving the tree and active document.
  const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
  const splitter = getByAutomationId(page, AUTOMATION_IDS.composer.collectionSplitter);
  const widthBefore = (await collection.boundingBox())!.width;
  const splitterBox = await splitter.boundingBox();
  expect(splitterBox).not.toBeNull();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + 80, splitterBox!.y + 100);
  await page.mouse.up();
  const widthAfter = (await collection.boundingBox())!.width;
  expect(widthAfter).toBeGreaterThan(widthBefore + 60);
  await expect(folderRows).toHaveCount(3);
  await expect(url).toHaveValue(requestUrl);

  // 保存动态ID、层级几何与splitter证据；driver随后负责trace和完整销毁。
  // Save dynamic IDs, nesting geometry, and splitter evidence; the driver owns trace and teardown.
  const folderBoxes = await Promise.all([level1Id, level2Id, level3Id].map((folderId) =>
    getByAutomationId(
      page,
      AutomationIdFactory.composerCollectionFolderTarget(folderId),
    ).boundingBox()));
  expect(folderBoxes.every(Boolean)).toBe(true);
  expect(folderBoxes[1]!.x).toBeGreaterThan(folderBoxes[0]!.x);
  expect(folderBoxes[2]!.x).toBeGreaterThan(folderBoxes[1]!.x);
  const evidencePath = testInfo.outputPath('collection-tree-state.json');
  await writeFile(evidencePath, JSON.stringify({
    folderIds: [level1Id, level2Id, level3Id],
    requestId,
    folderX: folderBoxes.map((box) => box!.x),
    requestUrl,
    remountPersistence,
    widthBefore,
    widthAfter,
  }, null, 2), 'utf8');
  await testInfo.attach('collection-tree-state', {
    path: evidencePath,
    contentType: 'application/json',
  });
});