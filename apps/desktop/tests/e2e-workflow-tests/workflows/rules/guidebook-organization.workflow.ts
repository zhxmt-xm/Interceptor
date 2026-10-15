import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('rules organization guide records order effects, folders and product-created imports', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const requestPath = '/guide/rule-order';
  const directory = await mkdtemp('/tmp/interceptor-guidebook-rules-');
  const file = path.join(directory, 'guide-rules.json');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  const folders = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRow);
  let finished = false;
  // 准备：限定真实演示流量，规则文件只由本轮Export生成。
  // Arrange: scope real example traffic and obtain the file only through this run's Export.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-organization');
  const create = async (name: 'first' | 'second'): Promise<string> => {
    let id = '';
    await media.step(`${name}-01-new`, `新建 Guide ${name} / Create Guide ${name}`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const value = await rows.last().getAttribute('data-automation-id');
      if (!value?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing Rule identity.');
      id = value.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(`Guide ${name}`);
    });
    await media.step(`${name}-02-host`, '填写 Host / Enter Host', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(id, 0, 'value')).fill('127.0.0.1');
    });
    await media.step(`${name}-03-path`, '限制演示 Path / Restrict the example Path', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(id, 1, 'value')).fill(requestPath);
    });
    await media.step(`${name}-04-header`, '填写 x-guide-order / Enter x-guide-order', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(id, 0, 'name')).fill('x-guide-order');
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(id, 0, 'value')).fill(name);
    });
    await media.step(`${name}-05-enable`, '启用当前规则 / Enable this Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    return id;
  };
  try {
    // 用户操作：两条规则修改同一Header，用真实源站结果说明后写覆盖和可见顺序。
    // User actions: two Rules edit one Header; real origin values demonstrate order and later-write precedence.
    await media.step('01-open', '打开 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    const first = await create('first');
    const second = await create('second');
    await media.step('02-apply', '应用两条规则 / Apply both Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('03-before', '验证 second 后写覆盖 / Verify second wins initially', async () => {
      const route = `${requestPath}?order=before`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), route)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(route)?.headers['x-guide-order']).toBe('second');
    });
    await media.step('04-reorder', '把 second 拖到 first 前面 / Drag second before first', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(second))
        .dragTo(getByAutomationId(page, AutomationIdFactory.ruleRow(first)), { targetPosition: { x: 40, y: 2 } });
      await expect(rows.first()).toHaveAttribute('data-automation-id', AutomationIdFactory.ruleRow(second));
    });
    await media.step('05-apply-order', 'Apply 新顺序 / Apply the new order', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('06-after', '验证 first 变为最后写入 / Verify first now wins', async () => {
      const route = `${requestPath}?order=after`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), route)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(route)?.headers['x-guide-order']).toBe('first');
    });
    let folder = '';
    await media.step('07-folder', '新建 Guide rules 目录 / Create the Guide rules folder', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.createFolder).click();
      const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
      const value = await rename.getAttribute('data-automation-id');
      if (!value?.startsWith(AUTOMATION_ID_PREFIXES.ruleFolderRename)) throw new Error('Missing Rule folder identity.');
      folder = value.slice(AUTOMATION_ID_PREFIXES.ruleFolderRename.length);
      await rename.fill('Guide rules');
      await rename.press('Enter');
    });
    await media.step('08-move-second', '将 second 移入目录 / Move second into the folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(second))
        .dragTo(getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(folder)));
    });
    await media.step('09-move-first', '将 first 移入目录 / Move first into the folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(first))
        .dragTo(getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(folder)));
    });
    await media.step('10-apply-folder', '保存目录结构 / Apply the folder structure', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.exportRules).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () =>
      media.nativeDialogStep('11-export', '保存 guide-rules.json / Save guide-rules.json'));
    await media.step('12-exported', '核对产品导出的规则树 / Verify the product-exported tree', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.exportBusy)).toHaveCount(0);
      const value: unknown = JSON.parse(await readFile(file, 'utf8'));
      expect(value).toMatchObject({ nodes: [{ kind: 'folder', name: 'Guide rules',
        children: [{ name: 'Guide second' }, { name: 'Guide first' }] }] });
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.importRules).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () =>
      media.nativeDialogStep('13-import-file', '选择刚导出的规则 / Select the exported Rules file'));
    await media.step('14-preview', '检查已启用规则的导入警告 / Inspect the enabled-rule import warning', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.import.dialog)).toBeVisible();
    });
    await media.step('15-cancel', '取消预览保持原树 / Cancel and retain the original tree', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.import.cancel).click();
      await expect(folders).toHaveCount(1);
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.importRules).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () =>
      media.nativeDialogStep('16-import-again', '重新选择同一文件 / Select the same file again'));
    await media.step('17-confirm', '确认追加，不覆盖 / Confirm append without overwrite', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.import.confirm).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.import.dialog)).toHaveCount(0);
      await expect(folders).toHaveCount(2);
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.enabled)).toHaveAttribute('data-total', '4');
    });
    // 证据：规则顺序有源站事实，导入纯追加的数量和保留身份均由实际UI确认。
    // Evidence: origin facts confirm precedence; actual UI confirms appended counts.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    finished = true;
  } finally {
    await media.stop({ firstRule: 'Guide first', secondRule: 'Guide second', host: '127.0.0.1',
      path: requestPath, header: 'x-guide-order', firstValue: 'first', secondValue: 'second',
      folder: 'Guide rules', exportFile: 'guide-rules.json' });
    if (finished) await rm(directory, { recursive: true, force: true });
  }
  // 清理：正常Close并验证系统代理、Core、worker与8888恢复。
  // Cleanup: normal Close verifies proxy, Core/worker and port recovery.
});
