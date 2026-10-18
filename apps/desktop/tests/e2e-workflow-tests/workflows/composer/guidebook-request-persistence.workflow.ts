import { writeFile } from 'node:fs/promises';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer guide preserves deep request fields across real App generations without replay', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  const initialLanguage = await page.locator('html').getAttribute('lang');
  if (!initialLanguage) throw new Error('The ready App has no declared language.');
  const folderNames = ['Guide persistence 1', 'Guide persistence 2', 'Guide persistence 3'];
  const folderIds: string[] = [];
  const requestName = 'Guide persisted fields';
  const requestPath = '/guide/persisted-request';
  const url = `${httpTrafficRunner.url(requestPath)}?guide=url`;
  const expectedPath = `${requestPath}?guide=url&scope=retained`;
  const body = '{"message":"persisted-fields","count":2}';
  const publicToken = 'public-persistence-example';
  let requestId = '';
  let restarted: LocalElectronApplicationDriver | undefined;
  let after: GuidebookMedia | undefined;

  // 准备：目录通过UI建立但不重复目录管理教程，首段仅录完整请求字段。
  // Arrange: create folders through UI without repeating the folder-management guide; record the request fields separately.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  for (const [index, name] of folderNames.entries()) {
    const parent = folderIds.at(-1);
    if (parent) {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionFolder(parent)).hover();
      await getByAutomationId(page, AutomationIdFactory.composerCollectionFolderMenu(parent)).click();
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(parent, 'new-folder')).click();
    } else {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
    }
    const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
    const identity = await rename.getAttribute('data-automation-id');
    if (!identity?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename)) {
      throw new Error(`Folder ${index + 1} omitted its public identity.`);
    }
    folderIds.push(identity.slice(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename.length));
    await rename.fill(name);
    await rename.press('Enter');
  }
  const leaf = folderIds.at(-1);
  if (!leaf) throw new Error('The three UI-created folders are missing.');
  const before = await GuidebookMedia.start(desktopApp, testInfo, 'composer-persistence-save');
  try {
    // 用户操作：填入公开示例字段并等待保存；不在第一代发送任何请求。
    // User actions: enter public example fields and wait for saving; never send in the first App generation.
    await before.step('01-new-request', '在第三级目录新建请求 / Create a request in the third-level folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionFolder(leaf)).hover();
      await getByAutomationId(page, AutomationIdFactory.composerCollectionFolderMenu(leaf)).click();
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(leaf, 'new-request')).click();
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest);
      await expect(row).toHaveCount(1);
      const identity = await row.getAttribute('data-automation-id');
      if (!identity?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) {
        throw new Error('The created request omitted its public identity.');
      }
      requestId = identity.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
    });
    await before.step('02-name', '命名Guide persisted fields / Name it Guide persisted fields', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)).click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename')).click();
      const rename = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(requestId));
      await rename.fill(requestName);
      await rename.press('Enter');
    });
    await before.step('03-url', '填写带Query的自有地址 / Enter the owned URL with its Query', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url);
    });
    await before.step('04-method', '选择POST / Select POST', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.method).click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('POST');
    });
    await before.step('05-protocol', '固定HTTP/1.1 / Select HTTP/1.1 explicitly', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1)).toHaveAttribute('aria-checked', 'true');
    });
    for (const [name, value] of [['x-guide-persist', 'retained'], ['x-guide-disabled', 'omitted']] as const) {
      await before.step(`06-header-${name}`, `添加Header ${name} / Add Header ${name}`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill(name);
        await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(value);
        await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
      });
    }
    await before.step('07-disable-header', '停用但保留第二个Header / Disable but retain the second Header', async () => {
      const row = page.locator('input[value="x-guide-disabled"]').locator('..');
      await row.getByRole('checkbox').click();
      await expect(row.getByRole('checkbox')).not.toBeChecked();
    });
    await before.step('08-query', '添加scope=retained / Add scope=retained', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('scope');
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill('retained');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
    });
    await before.step('09-json', '保存本次JSON正文 / Save this JSON body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).click();
      const editor = getByAutomationId(page, AUTOMATION_IDS.composer.body);
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(body);
      await expect(editor).toContainText('persisted-fields');
    });
    await before.step('10-auth', '保存公开演示Bearer字段 / Save the public demonstration Bearer field', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
      const combo = getByAutomationId(page, AUTOMATION_IDS.composer.authType).getByRole('combobox');
      await combo.click();
      await combo.press('ArrowDown');
      await combo.press('Enter');
      await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(publicToken);
    });
    await before.step('11-saved', '确认真正保存且尚未Send / Confirm saved state without sending', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
      expect(httpTrafficRunner.evidence()).toHaveLength(0);
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).focus();
    });
  } finally {
    await before.stop({
      folders: folderNames.join(' > '), requestName, url,
      method: 'POST', protocol: 'http/1.1',
      enabledHeader: 'x-guide-persist: retained', disabledHeader: 'x-guide-disabled: omitted',
      query: 'scope=retained', body, auth: 'Bearer with the deliberately public example value',
      publicToken, sentBeforeClose: '0',
      closeImage: 'Saved state before actual Close; shutdown is independently verified by the driver',
    });
  }
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();

  try {
    // 重启：同一profile通过真实UI回载，先离开Capture再开始第二段取景。
    // Restart: reload the same profile through UI and leave Capture before recording the second generation.
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'composer-reopened',
    });
    await restarted.waitUntilReady();
    const current = restarted.page;
    await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.composer).click();
    after = await GuidebookMedia.start(restarted, testInfo, 'composer-persistence-restart');
    for (const [index, folderId] of folderIds.entries()) {
      await after.step(`01-folder-${index + 1}`, `检查保留的第${index + 1}级目录 / Inspect retained folder level ${index + 1}`, async () => {
        const toggle = getByAutomationId(current, AutomationIdFactory.composerCollectionFolderToggle(folderId));
        await expect(getByAutomationId(current, AutomationIdFactory.composerCollectionFolder(folderId))).toContainText(folderNames[index]!);
        if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      });
    }
    await after.step('02-select', '打开同一个保存请求 / Open the same saved request', async () => {
      const row = getByAutomationId(current, AutomationIdFactory.composerCollectionRequest(requestId));
      await expect(row).toContainText(requestName);
      await row.click();
      const address = new URL(url);
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.url)).toHaveValue(`${address.host}${address.pathname}${address.search}`);
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.method)).toContainText('POST');
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.protocol.h1)).toHaveAttribute('aria-checked', 'true');
      expect(httpTrafficRunner.evidence()).toHaveLength(0);
    });
    await after.step('03-headers', '核对Header值与启停状态 / Verify Header values and enabled states', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.tab.headers).click();
      const enabled = current.locator('input[value="x-guide-persist"]').locator('..');
      const disabled = current.locator('input[value="x-guide-disabled"]').locator('..');
      await expect(enabled.locator('input[value="retained"]')).toBeVisible();
      await expect(enabled.getByRole('checkbox')).toBeChecked();
      await expect(disabled.locator('input[value="omitted"]')).toBeVisible();
      await expect(disabled.getByRole('checkbox')).not.toBeChecked();
    });
    await after.step('04-query', '核对未重填的Query行 / Verify the Query row without refilling it', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.tab.query).click();
      const row = current.locator('input[value="scope"]').locator('..');
      await expect(row.locator('input[value="retained"]')).toBeVisible();
      await expect(row.getByRole('checkbox')).toBeChecked();
    });
    await after.step('05-body', '核对实际回载的JSON正文 / Verify the actually restored JSON body', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.tab.body).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.body)).toContainText('persisted-fields');
    });
    await after.step('06-auth', '核对实际回载的公开Auth字段 / Verify the restored public Auth field', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.tab.auth).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.bearerToken)).toHaveValue(publicToken);
    });
    await after.step('07-send', '仅在重启后Send一次核对实际字节 / Send once after restart and verify actual bytes', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(expectedPath)?.method).toBe('POST');
      const observation = httpTrafficRunner.observation(expectedPath);
      expect(observation?.headers['x-guide-persist']).toBe('retained');
      expect(observation?.headers['x-guide-disabled']).toBeUndefined();
      expect(observation?.headers.authorization).toBe(`Bearer ${publicToken}`);
      expect(observation?.body.toString('utf8')).toBe(body);
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
    });
    await after.step('08-clear-auth', '清空演示Auth值 / Clear the demonstration Auth value', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.composer.bearerToken).fill('');
    });
    await after.step('09-none', '恢复Auth None并等待保存 / Restore Auth None and wait for saving', async () => {
      const combo = getByAutomationId(current, AUTOMATION_IDS.composer.authType).getByRole('combobox');
      await combo.click();
      await combo.press('ArrowUp');
      await combo.press('Enter');
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.bearerToken)).toHaveCount(0);
      await expect(getByAutomationId(current, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    });

    // 证据：字段来自保存与回载，唯一网络请求由第二代真实Send产生。
    // Evidence: fields come from persistence; the only network request is the real Send in the second generation.
    await expect(current.locator('html')).toHaveAttribute('lang', initialLanguage);
    expect(restarted.rendererPageErrors()).toEqual([]);
    const evidence = testInfo.outputPath('composer-persisted-fields.json');
    await writeFile(evidence, JSON.stringify({
      folderNames, folderIds, requestId, requestName, url, expectedPath,
      body, method: 'POST', protocol: 'http/1.1',
      retainedHeader: true, disabledHeaderOmitted: true, authValueRetained: true,
      requestsBeforeUserSend: 0, totalRequests: httpTrafficRunner.evidence().length,
      credentialsArePublicDemonstrationValues: true,
    }, null, 2), 'utf8');
    await testInfo.attach('composer-persisted-fields.json', { path: evidence, contentType: 'application/json' });
  } finally {
    try {
      if (after) await after.stop({
        folders: folderNames.join(' > '), requestName, url,
        method: 'POST', protocol: 'http/1.1', expectedPath, body,
        enabledHeader: 'x-guide-persist: retained', disabledHeader: 'x-guide-disabled: omitted',
        publicToken, sentAfterRestart: 'One explicit UI Send; no automatic replay',
        evidenceGeneration: 'composer-reopened',
      });
    } finally {
      // 清理：第二代正常Close与宿主恢复，原fixture继续检查整条生命周期。
      // Cleanup: close the second generation normally and let the existing fixture verify the complete lifecycle.
      if (restarted) {
        try {
          await restarted.captureFinalScreenshot(testInfo);
          await restarted.stopTrace(testInfo);
          await restarted.closeGracefully();
          await restarted.writeEvidence(testInfo);
        } finally {
          await restarted.forceCleanup();
        }
      }
    }
  }
});
