import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules guide records a narrow header rewrite and its actual wire effect', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const requestPath = '/guide/rules/order';
  const headerName = 'x-interceptor-guide';
  const headerValue = 'rules-demo';
  let ruleId = '';
  const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);

  // 准备：正式UI开启录制并限制展示范围，源站只接受本轮无凭据测试数据。
  // Arrange: enable Recording through UI and restrict the visible list to owned test traffic.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/rules');
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules');
  try {
    // 用户操作：从空规则到完整条件与动作，每步保留实际截图。
    // User actions: build conditions and actions from an empty Rule, capturing every step.
    await media.step('01-open', '打开 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create)).toBeVisible();
    });
    await media.step('02-create', '新建规则 / Create a Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
      const id = await row.getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Rule row has no public identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await expect(apply).toBeDisabled();
    });
    await media.step('03-name', '命名 Guide test header / Name the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide test header');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Guide test header');
    });
    await media.step('04-host', '限制 Host 为 127.0.0.1 / Restrict the host', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('05-path-condition', '添加 Path 条件 / Add a Path matcher', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'))).toBeVisible();
    });
    await media.step('06-path', '填写 /guide/rules/order / Enter the test path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(requestPath);
    });
    await media.step('07-header-name', '填写 x-interceptor-guide / Enter the header name', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill(headerName);
    });
    await media.step('08-header-value', '填写 rules-demo / Enter the header value', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill(headerValue);
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.validation)).toHaveAttribute('data-issue-count', '0');
    });
    await media.step('09-enable', '启用规则 / Enable the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('10-apply', '应用规则 / Apply the Rule', async () => {
      await apply.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('11-hit', '发送匹配请求 / Send a matching request', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect.poll(() => httpTrafficRunner.observation(requestPath)?.headers[headerName]).toBe(headerValue);
      await expect(getByAutomationId(page, AutomationIdFactory.ruleHitCount(ruleId))).toHaveAttribute('data-count', '1');
    });
    await media.step('12-capture', '在 Capture 核对实际结果 / Inspect the actual Capture result', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(page.locator('body')).toContainText(headerValue);
    });
    await media.step('13-nonmatching', '核对非匹配请求不受影响 / Verify an unmatched request', async () => {
      const otherPath = '/guide/rules/other';
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), otherPath)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(otherPath)?.headers[headerName]).toBeUndefined();
      await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: otherPath }).click();
    });
    await media.step('14-disable', '停用规则并 Apply / Disable and Apply', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await apply.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    // 业务断言与证据：源站确实收到改写值，非匹配请求保持原状。
    // Assert and evidence: the origin received the rewrite; an unmatched request remained unchanged.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ ruleName: 'Guide test header', host: '127.0.0.1', path: requestPath,
      url: httpTrafficRunner.url(requestPath), headerName, headerValue });
  }
  // 清理：复用真实退出与宿主恢复，不留下录屏、App或代理。
  // Cleanup: reuse normal shutdown and host verification for the recorder, App and proxy.
});
