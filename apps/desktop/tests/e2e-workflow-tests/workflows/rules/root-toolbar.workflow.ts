import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { expect, test } from '../../fixtures/local-electron-driver';

test('rules.root-toolbar exposes the root commands end to end', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.root-toolbar',
  });

  const { page } = desktopApp;

  // 进入 Rules 工作区；driver 已完成冷启动 readiness 收敛。
  // Enter Rules after the driver has settled cold-start proxy readiness.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();

  // 锁定空树初态，避免把残留 profile 数据误判为 toolbar 行为。
  // Lock the empty-tree baseline so persisted profile data cannot mask the flow.
  const ruleRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleRow,
  );
  const folderRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleFolderRow,
  );
  const folderRename = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleFolderRename,
  );
  await expect(ruleRows).toHaveCount(0);
  await expect(folderRows).toHaveCount(0);

  // 验证三个根级命令及空树导出状态，不依赖当前语言文案。
  // Verify all root commands and the empty-tree export state without localized text.
  const createRule = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.create,
  );
  const createFolder = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.createFolder,
  );
  const exportRules = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.exportRules,
  );
  await expect(createRule).toBeVisible();
  await expect(createFolder).toBeVisible();
  await expect(exportRules).toBeDisabled();

  // 新建 rule 后应打开其 editor，并允许导出当前非空草稿树。
  // Creating a rule opens its editor and enables export for the non-empty draft tree.
  await createRule.click();
  await expect(ruleRows).toHaveCount(1);
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.rules.editorName,
  )).toBeVisible();
  await expect(exportRules).toBeEnabled();

  // 新建 folder 不得替换或删除刚创建的 rule。
  // Creating a folder must preserve the rule created in the previous step.
  await createFolder.click();
  await expect(folderRename).toBeVisible();
  await folderRename.press('Enter');
  await expect(folderRows).toHaveCount(1);
  await expect(ruleRows).toHaveCount(1);
});