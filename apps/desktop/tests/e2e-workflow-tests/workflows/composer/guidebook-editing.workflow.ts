import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('composer editing guide records body modes, credential-free Auth controls and Collection file operations', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const requestPath = '/guide/composer/edit';
  const jsonPath = `${requestPath}/json`;
  const textPath = `${requestPath}/text`;
  const formPath = `${requestPath}/form`;
  const jsonBody = '{"message":"Hello JSON","orderId":"guide-001"}';
  const textBody = 'Hello text';
  const formBody = 'name=Interceptor&ready=true';
  const directory = await mkdtemp('/tmp/interceptor-guidebook-collection-');
  const filePath = path.join(directory, 'guide-collection.json');
  let requestId = '';
  let folderId = '';
  let completed = false;
  for (const route of [jsonPath, textPath, formPath]) {
    httpTrafficRunner.respondWith(route, { body: '{"message":"received"}',
      headers: { 'content-type': 'application/json' } });
  }
  const bodyMode = getByAutomationId(page, AUTOMATION_IDS.composer.bodyType);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-editing');
  try {
    // 准备与操作：全部请求由正式Composer直接发出，认证只看空字段不录入任何凭据。
    // Arrange and act: send through real Composer; inspect empty Auth controls without entering credentials.
    await media.step('01-open', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    });
    await media.step('02-new', '新建请求 / Create the request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('Missing Collection request identity.');
      requestId = id.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
    });
    await media.step('03-url', '填写演示 URL / Enter the demo URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(jsonPath));
    });
    await media.step('04-method', '选择 POST / Choose POST', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.method).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('POST');
    });
    await media.step('05-json-header', '填写 JSON Content-Type / Set the JSON Content-Type', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('Content-Type');
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('application/json');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    });
    await media.step('06-body', '打开 Body / Open Body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
    });
    await media.step('07-json', '选择 JSON / Choose JSON', async () => {
      await bodyMode.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.body)).toBeVisible();
    });
    await media.step('08-json-input', '输入 Hello JSON / Enter the JSON body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.body).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(jsonBody);
    });
    await media.step('09-json-send', '发送并核对完整 JSON / Send and verify the complete JSON', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(jsonPath)?.body.toString('utf8')).toBe(jsonBody);
      expect(httpTrafficRunner.observation(jsonPath)?.headers['content-type']).toBe('application/json');
    });
    await media.step('10-text', '选择 Text / Choose Text', async () => {
      await bodyMode.locator('..').getByRole('radio').nth(2).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.body).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(textBody);
    });
    await media.step('11-text-header', '设置 text/plain / Set text/plain', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await page.locator('input[value="application/json"]').fill('text/plain');
    });
    await media.step('11a-text-url', '使用独立文本测试地址 / Use the separate text endpoint', async () => {
      const url = new URL(httpTrafficRunner.url(textPath));
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${url.host}${url.pathname}`);
    });
    await media.step('12-text-send', '发送并核对文本 / Send and verify text', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(textPath)?.body.toString('utf8')).toBe(textBody);
      expect(httpTrafficRunner.observation(textPath)?.headers['content-type']).toBe('text/plain');
    });
    await media.step('13-form', '选择 Form / Choose Form', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyFormType).click();
    });
    await media.step('14-form-name', '添加 name=Interceptor / Add name=Interceptor', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.name).fill('name');
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.value).fill('Interceptor');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addForm).click();
    });
    await media.step('15-form-ready', '添加 ready=true / Add ready=true', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.name).fill('ready');
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.value).fill('true');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addForm).click();
    });
    await media.step('16-form-header', '设置表单 Content-Type / Set the form Content-Type', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await page.locator('input[value="text/plain"]').fill('application/x-www-form-urlencoded');
    });
    await media.step('16a-form-url', '使用独立表单测试地址 / Use the separate form endpoint', async () => {
      const url = new URL(httpTrafficRunner.url(formPath));
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${url.host}${url.pathname}`);
    });
    await media.step('17-form-send', '发送并核对表单字节 / Send and verify form bytes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(formPath)?.body.toString('utf8')).toBe(formBody);
    });
    await media.step('18-auth', '打开 Auth / Open Auth', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
    });
    await media.step('19-bearer', '查看 Bearer 输入位置，不填真实Key / Inspect Bearer input without a real key', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.authType).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toHaveValue('');
    });
    await media.step('20-basic', '查看 Basic 输入位置 / Inspect Basic inputs', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.authType).click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.username)).toHaveValue('');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.password)).toHaveValue('');
    });
    await media.step('21-none', '恢复 None / Restore None', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.authType).click();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.username)).toHaveCount(0);
    });
    await media.step('22-rename', '重命名 Guide form request / Rename the request', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)).click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename')).click();
      const rename = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(requestId));
      await rename.fill('Guide form request');
      await rename.press('Enter');
    });
    await media.step('23-folder', '新建 Guide collection / Create the collection folder', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
      const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
      const id = await rename.getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename)) throw new Error('Missing folder identity.');
      folderId = id.slice(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename.length);
      await rename.fill('Guide collection');
      await rename.press('Enter');
    });
    await media.step('24-move', '把请求移入目录 / Move the request into the folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId))
        .dragTo(getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(folderId)));
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.exportCollection).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath, () =>
      media.nativeDialogStep('25-export', '导出 guide-collection.json / Export the collection'));
    await media.step('26-exported', '核对实际导出内容 / Verify the exported collection', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.exportBusy)).toHaveCount(0);
      const exported: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      expect(exported).toMatchObject({ nodes: [
        { kind: 'folder', name: 'Guide collection', children: [{ kind: 'request', name: 'Guide form request', method: 'POST', bodyType: 'form' }] },
      ] });
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.importCollection).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath, () =>
      media.nativeDialogStep('27-import', '选择同一个集合文件 / Select the same exported file'));
    await media.step('28-preview', '检查导入预览 / Review import preview', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.import.dialog)).toBeVisible();
    });
    await media.step('29-confirm', '确认追加而不覆盖 / Confirm append without overwrite', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.import.confirm).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.import.dialog)).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    });
    // 证据：全部正文以真实源站字节核对，导入文件确实来自产品Export。
    // Evidence: verify all bodies at the origin and import only the product-created file.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({ jsonUrl: httpTrafficRunner.url(jsonPath), textUrl: httpTrafficRunner.url(textPath),
      formUrl: httpTrafficRunner.url(formPath), method: 'POST', jsonBody, textBody,
      formBody, requestName: 'Guide form request', folderName: 'Guide collection',
      exportedFile: 'guide-collection.json', credentialsEntered: 'none' });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：既有fixture关闭App并验证Core、8888、文件任务和系统设置恢复。
  // Cleanup: the fixture verifies App/Core/port/file-task shutdown and host restoration.
});
