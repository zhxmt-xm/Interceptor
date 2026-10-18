import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules guide records contains, exact, regex validation, case and MIME wildcard matching', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  const prefix = '/guide/matching';
  const pathValue = `${prefix}/Case`;
  const header = 'x-guide-mode';
  let ruleId = '';
  const field = (index: number, name: string) => getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, index, name));
  const pathModes = () => field(1, 'value').locator('..').getByRole('button');
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  // 准备：仅匹配本机演示路径，所有正反例都实际经过代理并在Capture核对。
  // Arrange: match only owned loopback paths and verify positive/negative requests through the proxy and Capture.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-matching-modes');
  const inspect = async (caseName: string, pathname: string, matched: boolean, phase: 'request' | 'response' = 'request'): Promise<void> => {
    const requestPath = pathname;
    await media.step(`${caseName}-capture`, '返回Capture检查输入 / Return to Capture to inspect the input', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    });
    await media.step(`${caseName}-request`, `发送${caseName}请求 / Send the ${caseName} request`, async () => {
      const result = await httpTrafficRunner.run('h1-json', {
        kind: 'http', protocol: 'h1', method: 'GET', path: requestPath, body: '',
        headers: { 'x-guide-case': caseName },
      }, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      const value = phase === 'request' ? result.request?.headers[header] : result.response?.headers[header];
      expect(value).toBe(matched ? 'matched' : undefined);
    });
    await media.step(`${caseName}-headers`, matched ? '查看实际命中的Header / Inspect the actually matched Header' : '确认此输入没有改写Header / Verify this input did not rewrite the Header', async () => {
      await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: pathname }).last().click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      const requestHeader = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.requestHeaders);
      if (await requestHeader.getAttribute('aria-expanded') !== 'true') await requestHeader.click();
      const requestContent = await requestHeader.getAttribute('aria-controls');
      if (!requestContent) throw new Error('Request Headers omitted its controlled content.');
      await expect(page.locator(`[id="${requestContent}"]`)).toContainText(caseName);
      const section = getByAutomationId(page, phase === 'request'
        ? AUTOMATION_IDS.capture.inspector.section.requestHeaders : AUTOMATION_IDS.capture.inspector.section.responseHeaders);
      if (await section.getAttribute('aria-expanded') !== 'true') await section.click();
      const content = await section.getAttribute('aria-controls');
      if (!content) throw new Error('The selected Header section omitted its controlled content.');
      if (matched) await expect(page.locator(`[id="${content}"]`)).toContainText(header);
      else await expect(page.locator(`[id="${content}"]`)).not.toContainText(header);
    });
    await media.step(`${caseName}-rules`, '返回同一规则 / Return to the same Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    });
  };
  try {
    await media.step('01-rules', '打开Rules / Open Rules', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click(); });
    await media.step('02-create', '创建匹配模式规则 / Create the matching-mode Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing matching-mode Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    });
    await media.step('03-name', '命名Guide matching modes / Name it Guide matching modes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide matching modes');
    });
    await media.step('04-host', '填写127.0.0.1 / Enter 127.0.0.1', async () => { await field(0, 'value').fill('127.0.0.1'); });
    await media.step('05-path-condition', '添加Path条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('06-path-value', '填写区分大小写的示例Path / Enter the example Path with mixed case', async () => {
      await field(1, 'value').fill(pathValue);
      await expect(pathModes()).toHaveCount(3);
    });
    await media.step('07-header', '填写x-guide-mode / Enter x-guide-mode', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill(header);
    });
    await media.step('08-value', '填写matched / Enter matched', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('matched');
    });
    await media.step('09-enable', '启用规则 / Enable the Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('10-contains', 'Apply默认包含模式 / Apply the default contains mode', async () => {
      for (const button of await pathModes().all()) await expect(button).toHaveAttribute('aria-pressed', 'false');
      await apply();
    });
    await inspect('contains', `${prefix}/case/extra`, true);
    await media.step('11-case-sensitive', '开启Aa区分大小写 / Enable Aa case sensitivity', async () => {
      await pathModes().nth(0).click();
      await expect(pathModes().nth(0)).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('12-apply-case', 'Apply大小写设置 / Apply the case setting', apply);
    await inspect('case-sensitive', `${prefix}/case/extra`, false);
    await media.step('13-exact', '开启精确匹配 / Enable exact matching', async () => {
      await pathModes().nth(1).click();
      await expect(pathModes().nth(1)).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('14-apply-exact', 'Apply精确匹配 / Apply exact matching', apply);
    await inspect('exact-negative', `${pathValue}/extra`, false);
    await inspect('exact-positive', pathValue, true);
    await media.step('15-regex', '切换到正则模式 / Switch to regex mode', async () => {
      await pathModes().nth(2).click();
      await expect(pathModes().nth(2)).toHaveAttribute('aria-pressed', 'true');
      await expect(pathModes().nth(1)).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('16-invalid-regex', '填写无效正则 / Enter an invalid regex', async () => {
      await field(1, 'value').fill('[');
      await expect(field(1, 'value')).toHaveValue('[');
    });
    await media.step('16a-apply-invalid', '核对当前版本仍允许Apply / Observe that this release still allows Apply', async () => {
      const revision = await getByAutomationId(page, AUTOMATION_IDS.rules.status.revision).getAttribute('data-revision');
      await apply();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision)).not.toHaveAttribute('data-revision', revision!);
    });
    await inspect('invalid-regex', `${prefix}/READY`, false);
    await media.step('17-valid-regex', '修正为只匹配大写段的正则 / Fix the regex to match an uppercase segment', async () => {
      await field(1, 'value').fill(`^${prefix}/[A-Z]+$`);
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.validation)).toHaveAttribute('data-issue-count', '0');
    });
    await media.step('18-apply-regex', 'Apply有效正则 / Apply the valid regex', apply);
    await inspect('regex-positive', `${prefix}/READY`, true);
    await inspect('regex-negative', `${prefix}/ready`, false);
    await media.step('19-ignore-case', '关闭Aa使正则不区分大小写 / Disable Aa for case-insensitive regex', async () => {
      await pathModes().nth(0).click();
      await expect(pathModes().nth(0)).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('20-apply-ignore-case', 'Apply正则大小写设置 / Apply the regex case setting', apply);
    await inspect('regex-ignore-case', `${prefix}/ready`, true);
    await media.step('21-response-action', '将Header动作改为Response / Change the Header action to Response', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
    });
    await media.step('22-mime-condition', '添加响应MIME条件 / Add a response MIME condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.mime).click();
    });
    await media.step('23-mime-wildcard', '填写application/*通配 / Enter the application/* wildcard', async () => {
      const row = field(2, 'remove').locator('..');
      await row.getByRole('textbox').fill('application/*');
    });
    await media.step('24-apply-mime', 'Apply响应MIME条件 / Apply the response MIME condition', apply);
    httpTrafficRunner.respondWith(`${prefix}/ready`, { body: '{"type":"json"}', headers: { 'content-type': 'application/json' } });
    await inspect('mime-json', `${prefix}/ready`, true, 'response');
    httpTrafficRunner.respondWith(`${prefix}/ready`, { body: 'plain text', headers: { 'content-type': 'text/plain' } });
    await inspect('mime-text', `${prefix}/ready`, false, 'response');
    await media.step('25-disable', '停用演示规则 / Disable the demonstration Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('26-apply-disabled', 'Apply停用状态 / Apply the disabled state', apply);
    // 证据：逐项核对实际匹配；当前版本允许保存坏正则但恒不匹配，不伪造语法诊断。
    // Evidence: verify actual matching; this release saves invalid regex as non-matching, without a fabricated syntax diagnostic.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      ruleName: 'Guide matching modes', host: '127.0.0.1', path: pathValue, header: `${header}: matched`,
      containsInput: `${prefix}/case/extra`, exactInput: pathValue, regex: `^${prefix}/[A-Z]+$`,
      regexUpper: `${prefix}/READY`, regexLower: `${prefix}/ready`, mime: 'application/*',
      positiveMime: 'application/json', negativeMime: 'text/plain', invalidRegex: '[',
      invalidRegexLimit: 'This release permits Apply but the invalid regex never matches; fix the expression rather than trusting the applied label',
    });
  }
  // 清理：正式Close核对系统代理、CA、进程及8888恢复。
  // Cleanup: normal Close verifies proxy/CA, processes and port 8888 restoration.
});
