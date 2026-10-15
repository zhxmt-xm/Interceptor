import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoints guide records edit, unmodified continuation and Drop on real traffic', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const prefix = '/guide/breakpoints';
  const original = '{"message":"original"}';
  const replacement = '{"message":"edited-by-guide"}';
  let ruleId = '';
  const send = (requestPath: string) => httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath, {
    method: 'POST', body: original, headers: { 'content-type': 'application/json' },
  }).then(result => ({ kind: 'response' as const, result }),
    error => ({ kind: 'error' as const, message: error instanceof Error ? error.message : String(error) }));
  let pending: ReturnType<typeof send> | undefined;

  // 准备：真实代理与自产路径筛选，不读取或设置任何内部Store。
  // Arrange: use the real proxy and filter owned paths without internal Store access.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints');
  try {
    // 用户操作：逐步骤创建狭窄请求断点，保留每次操作后的画面。
    // User actions: build a scoped request breakpoint and retain every step.
    await media.step('01-rules', '打开 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('02-create', '新建断点规则 / Create the breakpoint Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing new Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    });
    await media.step('03-name', '填写 Guide request breakpoint / Name the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide request breakpoint');
    });
    await media.step('04-host', '设置本机测试 Host / Set the local test Host', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('05-path-condition', '添加 Path 条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('06-path', '限制 /guide/breakpoints / Restrict the breakpoint path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
    });
    await media.step('07-remove-header', '移除默认 Header 动作 / Remove the default Header action', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).click();
    });
    await media.step('08-add-breakpoint', '添加 Breakpoint 动作 / Add a Breakpoint action', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
    });
    await media.step('09-enable', '启用断点规则 / Enable the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('10-apply', 'Apply 生效 / Apply the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('11-capture', '回到 Capture / Return to Capture', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    });
    await media.step('12-pending', '发出并选中挂起请求 / Send and select the paused request', async () => {
      pending = send(`${prefix}/edited`);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: `${prefix}/edited` });
      await expect(row).toBeVisible();
      await row.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
    });
    await media.step('13-text', '选择 Text 替换 / Choose Text replacement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeVisible();
    });
    await media.step('14-replacement', '输入 edited-by-guide / Enter the replacement body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(replacement);
    });
    await media.step('15-forward', 'Forward edited 并核对源站 / Forward edited and verify the origin', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      expect(await pending).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
      expect(httpTrafficRunner.observation(`${prefix}/edited`)?.body.toString('utf8')).toBe(replacement);
    });
    await media.step('16-next', '发出下一条请求 / Send the next request', async () => {
      pending = send(`${prefix}/original`);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: `${prefix}/original` });
      await expect(row).toBeVisible();
      await row.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    });
    await media.step('17-unmodified', '原样放行 / Continue unmodified', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      expect(await pending).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
      expect(httpTrafficRunner.observation(`${prefix}/original`)?.body.toString('utf8')).toBe(original);
    });
    await media.step('18-drop-target', '选中要丢弃的测试请求 / Select a disposable request', async () => {
      pending = send(`${prefix}/drop`);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: `${prefix}/drop` });
      await expect(row).toBeVisible();
      await row.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop)).toBeVisible();
    });
    await media.step('19-drop', 'Drop 并核对客户端错误 / Drop and inspect the client error', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop).click();
      expect(await pending).toMatchObject({ kind: 'error' });
      expect(httpTrafficRunner.observation(`${prefix}/drop`)).toBeUndefined();
    });
    await media.step('20-disable', '停用测试规则 / Disable the test Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('21-apply-disabled', '保存停用 / Apply the disabled state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    // 证据：三种决定分别以源站或客户端真实结果核对，而不是只看按钮消失。
    // Evidence: each decision is verified by real client/origin facts, not disappearing controls.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ ruleName: 'Guide request breakpoint', host: '127.0.0.1', path: prefix,
      url: httpTrafficRunner.url(`${prefix}/edited`), original, replacement });
  }
  // 清理：driver关闭真实App并验证代理、进程和8888全部恢复。
  // Cleanup: the driver closes the real App and verifies proxy/process/port restoration.
});
