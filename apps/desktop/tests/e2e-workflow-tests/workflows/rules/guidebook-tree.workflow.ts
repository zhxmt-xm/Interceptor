import type { Locator } from '@playwright/test';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules guide records validation, folder boundaries, effect navigation and non-last deletion', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/rule-tree';
  const header = 'x-guide-tree';
  const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  const folderRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRow);
  const renameFields = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  const identity = async (locator: Locator, idPrefix: string): Promise<string> => {
    const id = await locator.getAttribute('data-automation-id');
    if (!id?.startsWith(idPrefix)) throw new Error(`Missing tree identity: ${idPrefix}`);
    return id.slice(idPrefix.length);
  };
  const folderMenu = async (id: string): Promise<void> => {
    await getByAutomationId(page, AutomationIdFactory.ruleFolderRow(id)).hover();
    await getByAutomationId(page, AutomationIdFactory.ruleFolderMenu(id)).click();
  };
  let rootFolder = '';
  let middleFolder = '';
  let leafFolder = '';
  let nestedRule = '';
  let rootRule = '';
  // 准备：两条规则真实比较遍历顺序，最后只删除其中一条，不绕过空树Apply限制。
  // Arrange: use two real precedence Rules and delete only one, without bypassing the empty-tree Apply limitation.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-tree');
  try {
    await media.step('01-rules', '打开 Rules / Open Rules', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click(); });
    await media.step('02-root-folder', '新建根目录 / Create a root folder', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.createFolder).click();
      rootFolder = await identity(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
    });
    await media.step('03-root-name', '命名 Guide hierarchy / Name it Guide hierarchy', async () => {
      await renameFields.fill('Guide hierarchy');
      await renameFields.press('Enter');
    });
    await media.step('04-child-folder', '通过目录菜单新建子目录 / Create a child through the folder menu', async () => {
      await folderMenu(rootFolder);
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(rootFolder, 'new-folder')).click();
      middleFolder = await identity(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
    });
    await media.step('05-child-name', '命名 Guide API / Name it Guide API', async () => {
      await renameFields.fill('Guide API');
      await renameFields.press('Enter');
    });
    await media.step('06-third-folder', '新建第三级目录 / Create the third folder level', async () => {
      await folderMenu(middleFolder);
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(middleFolder, 'new-folder')).click();
      leafFolder = await identity(renameFields, AUTOMATION_ID_PREFIXES.ruleFolderRename);
    });
    await media.step('07-third-name', '命名 Guide final / Name it Guide final', async () => {
      await renameFields.fill('Guide final');
      await renameFields.press('Enter');
    });
    await media.step('08-depth-limit', '核对不能继续新建第四级目录 / Verify a fourth folder level is unavailable', async () => {
      await folderMenu(leafFolder);
      await expect(getByAutomationId(page, AutomationIdFactory.ruleNodeAction(leafFolder, 'new-folder'))).toBeDisabled();
    });
    await media.step('09-nested-rule', '在第三级新建规则 / Create a Rule in the third-level folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(leafFolder, 'new-rule')).click();
      nestedRule = await identity(ruleRows, AUTOMATION_ID_PREFIXES.ruleRow);
    });
    await media.step('10-invalid', '检查未填写字段与Apply禁用 / Inspect missing fields and disabled Apply', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'invalid');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.validation)).toHaveAttribute('data-issue-count', '2');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    });
    await media.step('11-rule-name', '命名 Guide nested priority / Name the Rule Guide nested priority', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide nested priority');
    });
    await media.step('12-host', '限定Host为127.0.0.1 / Restrict Host to 127.0.0.1', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(nestedRule, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('13-path-condition', '添加Path条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('14-path', '限定本轮规则路径 / Restrict this run’s Rule path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(nestedRule, 1, 'value')).fill(prefix);
    });
    await media.step('15-header', '填写x-guide-tree / Enter x-guide-tree', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(nestedRule, 0, 'name')).fill(header);
    });
    await media.step('16-header-value', '填写nested / Enter nested', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(nestedRule, 0, 'value')).fill('nested');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.validation)).toHaveAttribute('data-issue-count', '0');
    });
    await media.step('17-enable', '启用完整规则 / Enable the completed Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('18-apply', 'Apply目录与规则 / Apply the folders and Rule', apply);
    await media.step('19-rename-folder', '在菜单中重命名目录 / Rename the folder through its menu', async () => {
      await folderMenu(middleFolder);
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(middleFolder, 'rename')).click();
    });
    await media.step('20-folder-name', '将Guide API改为Guide routes / Rename Guide API to Guide routes', async () => {
      await renameFields.fill('Guide routes');
      await renameFields.press('Enter');
    });
    await media.step('21-apply-rename', 'Apply目录名称 / Apply the folder name', apply);
    await media.step('22-folder-search', '按目录名称搜索 / Search by folder name', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('Guide routes');
      await expect(getByAutomationId(page, AutomationIdFactory.ruleFolderRow(middleFolder))).toBeVisible();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule))).toBeVisible();
    });
    await media.step('23-search-clear', '清空Rules搜索 / Clear Rules search', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill(''); });
    await media.step('24-collapse', '折叠根目录 / Collapse the root folder', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(rootFolder)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule))).toBeHidden();
    });
    await media.step('25-expand', '展开原来的目录 / Expand the same folder again', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleFolderToggle(rootFolder)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule))).toBeVisible();
    });
    await media.step('26-request', '发送匹配请求核对nested / Send a matching request and verify nested', async () => {
      const requestPath = `${prefix}/nested`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(requestPath)?.headers[header]).toBe('nested');
      await expect(getByAutomationId(page, AutomationIdFactory.ruleHitCount(nestedRule))).toHaveAttribute('data-count', '1');
    });
    await media.step('27-rule-menu', '打开命中规则的菜单 / Open the matched Rule menu', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule)).click({ button: 'right' });
      await expect(getByAutomationId(page, AutomationIdFactory.ruleNodeAction(nestedRule, 'show-requests'))).toBeEnabled();
    });
    await media.step('28-show-requests', '跳转到这条规则的请求 / Navigate to this Rule’s requests', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(nestedRule, 'show-requests')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture)).toHaveAttribute('aria-current', 'page');
    });
    await media.step('28a-rule-facet', '展开并核对已选规则分组 / Expand and verify the selected Rule facet', async () => {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle('rule'));
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetOption('rule', nestedRule))).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('29-select-request', '检查导航选中的匹配请求 / Inspect the matched request selected by navigation', async () => {
      const close = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close);
      if (!await close.isVisible()) {
        await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: `${prefix}/nested` }).click();
      }
      await expect(close).toBeVisible();
      await expect(close.locator('..')).toContainText(`${prefix}/nested`);
    });
    await media.step('30-header-effect', '查看Header设置标记 / Inspect the Header set marker', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(getByAutomationId(page, AutomationIdFactory.captureRuleEffect(nestedRule, 'set', header))).toBeVisible();
    });
    await media.step('31-return-rule', '点击标记返回同一规则 / Follow the marker to the same Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureRuleEffect(nestedRule, 'set', header)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Guide nested priority');
    });

    // 用户操作：增加真正参与覆盖顺序的根级规则，再明确只删除非最后一条。
    // User actions: add a root Rule that actually participates in precedence, then explicitly delete only the non-last Rule.
    await media.step('32-root-menu', '打开根级菜单 / Open the root-level menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
    });
    await media.step('33-root-rule', '从根菜单新建顺序对照规则 / Create a precedence comparison Rule at the root', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
      rootRule = await identity(ruleRows.last(), AUTOMATION_ID_PREFIXES.ruleRow);
    });
    await media.step('34-root-name', '命名Guide root priority / Name it Guide root priority', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide root priority');
    });
    await media.step('35-root-host', '填写同一Host / Enter the same Host', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRule, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('36-root-path-condition', '为根规则添加Path / Add Path to the root Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('37-root-path', '填写同一测试路径 / Enter the same example path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(rootRule, 1, 'value')).fill(prefix);
    });
    await media.step('38-root-header', '填写同一Header / Enter the same Header', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRule, 0, 'name')).fill(header);
    });
    await media.step('39-root-value', '填写root作为后写值 / Enter root as the later value', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(rootRule, 0, 'value')).fill('root');
    });
    await media.step('40-root-enable', '启用根级顺序规则 / Enable the root precedence Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('41-root-apply', 'Apply两条规则 / Apply both Rules', apply);
    await media.step('42-precedence', '核对根规则最后覆盖为root / Verify the root Rule writes root last', async () => {
      const requestPath = `${prefix}/precedence`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(requestPath)?.headers[header]).toBe('root');
    });
    await media.step('43-delete-nested-menu', '打开非最后一条规则的删除菜单 / Open deletion for the non-last Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule)).click({ button: 'right' });
    });
    await media.step('44-delete-nested', '只删除Guide nested priority / Delete only Guide nested priority', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(nestedRule, 'delete')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(nestedRule))).toHaveCount(0);
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(rootRule))).toBeVisible();
    });
    await media.step('45-apply-deletion', 'Apply非最后一条删除 / Apply the non-last deletion', apply);
    await media.step('46-delete-folder-menu', '打开空目录的删除菜单 / Open deletion for the empty folder tree', async () => { await folderMenu(rootFolder); });
    await media.step('47-delete-folders', '删除已空的三级目录 / Delete the empty three-level folder tree', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(rootFolder, 'delete')).click();
      await expect(folderRows).toHaveCount(0);
      await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(rootRule))).toBeVisible();
    });
    await media.step('48-apply-folders', 'Apply空目录删除 / Apply empty-folder deletion', apply);
    await media.step('49-after-delete', '核对剩余规则仍正常命中 / Verify the remaining Rule still matches', async () => {
      const requestPath = `${prefix}/after-delete`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(requestPath)?.headers[header]).toBe('root');
    });
    await media.step('50-disable', '保留并停用最后一条规则 / Retain and disable the last Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(rootRule)).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('51-apply-disabled', 'Apply停用状态 / Apply the disabled state', apply);
    // 证据：目录边界、缺失输入、真实命中与非最后删除分别验证，不宣称空树保存成功。
    // Evidence: verify depth, invalid input, actual hits and non-last deletion separately, without claiming empty-tree persistence.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      host: '127.0.0.1', path: prefix, header, nestedRule: 'Guide nested priority',
      rootRule: 'Guide root priority', initialFolders: 'Guide hierarchy > Guide API > Guide final',
      renamedFolder: 'Guide routes', firstValue: 'nested', laterValue: 'root',
      deletionScope: 'One of two precedence Rules and the emptied folder tree; the last Rule remains disabled',
    });
  }
  // 清理：真实Close与宿主guard核对系统代理、CA、进程及8888。
  // Cleanup: real Close and the host guard verify system proxy/CA, processes and port 8888.
});
