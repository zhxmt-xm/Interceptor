import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('collection guide records nesting boundaries, separate requests, rename, cancellation and deletion', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const directory = await mkdtemp('/tmp/interceptor-guidebook-collection-tree-');
  const file = path.join(directory, 'guide-collection-tree.json');
  const folders: string[] = [];
  const requests: string[] = [];
  const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-collection');
  let completed = false;
  const folderMenu = async (id: string) => {
    await getByAutomationId(page, AutomationIdFactory.composerCollectionFolder(id)).hover();
    await getByAutomationId(page, AutomationIdFactory.composerCollectionFolderMenu(id)).click();
  };
  try {
    // 准备与操作：所有目录和请求由真实Collection UI创建，不预造输入。
    // Arrange and act: create every folder and request through real Collection UI, without seeded inputs.
    await media.step('01-open', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    });
    for (const level of [1, 2, 3]) {
      await media.step(`02-folder-${level}`, `创建 Guide level ${level} / Create Guide level ${level}`, async () => {
        if (level === 1) await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
        else {
          const parent = folders[level - 2]!;
          await folderMenu(parent);
          await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(parent, 'new-folder')).click();
        }
        const value = await rename.getAttribute('data-automation-id');
        if (!value?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename)) throw new Error('Folder has no public identity.');
        folders.push(value.slice(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename.length));
        await rename.fill(`Guide level ${level}`);
        await rename.press('Enter');
      });
    }
    const leaf = folders[2]!;
    await media.step('03-depth-limit', '检查第三级的子目录禁用 / Inspect the third-level folder limit', async () => {
      await folderMenu(leaf);
      await expect(getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(leaf, 'new-folder'))).toBeDisabled();
    });
    for (const index of [1, 2]) {
      await media.step(`04-request-${index}`, `在目录中新建 Guide request ${index} / Create Guide request ${index} in the folder`, async () => {
        if (index > 1) await folderMenu(leaf);
        await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(leaf, 'new-request')).click();
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
        const value = await row.getAttribute('data-automation-id');
        if (!value?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('Request has no public identity.');
        const id = value.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
        requests.push(id);
        await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(`/guide/collection/${index}`));
        await row.click({ button: 'right' });
        await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(id, 'rename')).click();
        await rename.fill(`Guide request ${index}`);
        await rename.press('Enter');
      });
    }
    for (const index of [1, 2]) {
      await media.step(`05-switch-${index}`, `切换并核对 request ${index} / Switch and verify request ${index}`, async () => {
        await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requests[index - 1]!)).click();
        const address = new URL(httpTrafficRunner.url(`/guide/collection/${index}`));
        await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue(`${address.host}${address.pathname}`);
      });
    }
    await media.step('06-rename-folder', '重命名 Guide saved requests / Rename the folder Guide saved requests', async () => {
      await folderMenu(leaf);
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(leaf, 'rename')).click();
      await rename.fill('Guide saved requests');
      await rename.press('Enter');
    });
    await media.step('07-reorder', '调整同级请求顺序 / Reorder sibling requests', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requests[1]!))
        .dragTo(getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requests[0]!)),
          { targetPosition: { x: 40, y: 2 } });
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).first())
        .toHaveAttribute('data-automation-id', AutomationIdFactory.composerCollectionRequest(requests[1]!));
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.exportCollection).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () =>
      media.nativeDialogStep('08-export', '保存目录示例文件 / Save the example collection file'));
    await getByAutomationId(page, AUTOMATION_IDS.composer.importCollection).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () =>
      media.nativeDialogStep('09-open-import', '选择同一导出文件 / Select the same exported file'));
    await media.step('10-cancel-preview', '取消导入不追加 / Cancel import without appending', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.import.dialog)).toBeVisible();
      await getByAutomationId(page, AUTOMATION_IDS.composer.import.cancel).click();
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest)).toHaveCount(2);
    });
    await media.step('11-delete-request', '删除本轮 request 2 / Delete this run’s request 2', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requests[1]!)).click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requests[1]!, 'delete')).click();
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest)).toHaveCount(1);
    });
    await media.step('12-delete-folder', '删除本轮目录及剩余演示请求 / Delete the owned folder and remaining demo request', async () => {
      await folderMenu(leaf);
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(leaf, 'delete')).click();
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest)).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    });
    // 证据：编辑和导入预览均没有发送请求，删除仅限本轮节点。
    // Evidence: editing/import preview never sends requests; delete only this run's owned nodes.
    expect(httpTrafficRunner.observation('/guide/collection/1')).toBeUndefined();
    expect(httpTrafficRunner.observation('/guide/collection/2')).toBeUndefined();
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({ folderOne: 'Guide level 1', folderTwo: 'Guide level 2', folderThree: 'Guide level 3',
      renamedFolder: 'Guide saved requests', requestOne: 'Guide request 1', requestTwo: 'Guide request 2',
      urlOne: httpTrafficRunner.url('/guide/collection/1'), urlTwo: httpTrafficRunner.url('/guide/collection/2'),
      fileName: 'guide-collection-tree.json', requestsSent: '0' });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：标准fixture正常关闭App并验证Core、8888与宿主恢复。
  // Cleanup: the standard fixture closes the App and verifies Core, port and host restoration.
});
