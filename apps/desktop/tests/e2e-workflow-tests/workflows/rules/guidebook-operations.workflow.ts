import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules operation guide verifies remove, append, request-body replacement and search', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const prefix = '/guide/rule-operations';
  let ruleId = '';
  const field = (name: string) => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, name));
  const apply = async () => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  // 准备：自产路径与公开Header，所有修改只作用于本轮示例。
  // Arrange: own the test paths and public Header values; changes apply only to this example.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-operations');
  try {
    await media.step('01-rules', '打开 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('02-new', '创建 Guide operations / Create Guide operations', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide operations');
    });
    await media.step('03-scope', '限制 Host 与 Path / Restrict Host and Path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
    });
    await media.step('04-header-name', '填写 x-guide-list / Enter x-guide-list', async () => { await field('name').fill('x-guide-list'); });
    await media.step('05-append', '选择 append / Choose append', async () => {
      await field('operation').click();
      await field('operation-option.append').click();
      await field('value').fill('two');
    });
    await media.step('06-enable', '启用规则 / Enable the Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('07-apply', 'Apply append / Apply append', apply);
    await media.step('08-appended', '核对保留 one 并追加 two / Verify one is retained and two appended', async () => {
      const route = `${prefix}/append`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), route, { headers: { 'x-guide-list': 'one' } })).statusCode).toBe(200);
      const values = httpTrafficRunner.observation(route)?.headers['x-guide-list'];
      expect(Array.isArray(values) ? values : values?.split(/,\s*/)).toEqual(['one', 'two']);
    });
    await media.step('09-remove', '选择 remove / Choose remove', async () => {
      await field('operation').click();
      await field('operation-option.remove').click();
      await expect(field('value')).toHaveCount(0);
    });
    await media.step('10-apply-remove', 'Apply remove / Apply remove', apply);
    await media.step('11-removed', '核对Header已移除 / Verify the Header was removed', async () => {
      const route = `${prefix}/remove`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), route, { headers: { 'x-guide-list': 'one' } })).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(route)?.headers['x-guide-list']).toBeUndefined();
    });
    await media.step('12-query-action', '改为 Query 动作 / Switch to a Query action', async () => {
      await field('remove').click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.query).click();
    });
    await media.step('13-query-remove', '移除 guide 参数 / Remove the guide parameter', async () => {
      const card = field('remove').locator('../..');
      await card.getByRole('combobox').click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await card.locator('input:not([readonly])').fill('guide');
    });
    await media.step('14-apply-query', 'Apply Query remove / Apply Query removal', apply);
    await media.step('15-query-result', '核对参数被移除 / Verify the parameter is removed', async () => {
      const route = `${prefix}/query`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${route}?guide=remove-me`)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(route)?.method).toBe('GET');
      expect(httpTrafficRunner.observation(`${route}?guide=remove-me`)).toBeUndefined();
    });
    await media.step('16-body-action', '改为请求 Body 动作 / Switch to request Body replacement', async () => {
      await field('remove').click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
      await field('phase').click();
      await field('phase-option.request').click();
    });
    await media.step('17-body-value', '填写 request-edited / Enter request-edited', async () => {
      await field('content').fill('{"message":"request-edited"}');
    });
    await media.step('18-apply-body', 'Apply 请求正文 / Apply request-body replacement', apply);
    await media.step('19-body-result', '核对源站收到完整替换 / Verify the complete replacement at the origin', async () => {
      const route = `${prefix}/body`;
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), route,
        { method: 'POST', body: '{"message":"original"}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(route)?.body.toString('utf8')).toBe('{"message":"request-edited"}');
    });
    await media.step('20-rename', '重命名为 Guide operations done / Rename the Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide operations done');
      await apply();
    });
    await media.step('21-search', '按名称搜索 / Search by name', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('operations done');
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow)).toHaveCount(1);
    });
    await media.step('22-disable', '保留但停用演示规则 / Retain and disable the demo Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.search).fill('');
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('23-apply-disabled', 'Apply 停用状态 / Apply the disabled state', async () => {
      await apply();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    // 证据：删除、覆盖和追加有实际源站结果，不以相似截图代替。
    // Evidence: actual origin observations distinguish removal, replacement and append.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ host: '127.0.0.1', path: prefix, header: 'x-guide-list',
      originalHeader: 'one', appendedHeader: 'two', removedQuery: 'guide=remove-me',
      originalBody: '{"message":"original"}', replacementBody: '{"message":"request-edited"}',
      initialName: 'Guide operations', renamed: 'Guide operations done',
      deletionLimit: 'The released empty Rules tree has no Apply entry; this recording does not claim a saved last-rule deletion.' });
  }
  // 清理：正式Close与宿主guard核对全部进程和代理恢复。
  // Cleanup: normal Close and the host guard verify process and proxy restoration.
});
