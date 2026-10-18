import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('rules guide records response headers and observable body versions', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/response-evidence';
  const ruleName = 'Guide response and body';
  const original = '{"message":"guide-original"}';
  const final = '{"message":"guide-final"}';
  const responseFinal = '{"message":"guide-response-final"}';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-body-'));
  const savedBody = path.join(directory, 'guide-final.json');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
  let ruleId = '';
  let completed = false;
  const field = (name: string) => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, name));
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  const openCapture = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  };
  const openRules = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    if (ruleId) await getByAutomationId(page, `${AUTOMATION_ID_PREFIXES.ruleRow}${ruleId}`).click();
  };

  // 准备：仅使用自产路径与公开正文，Save body输入由产品生成。
  // Arrange: use owned paths and public bodies; the product creates the saved file.
  for (const suffix of ['append', 'remove', 'request-body', 'response-body', 'disabled']) {
    httpTrafficRunner.respondWith(`${prefix}/${suffix}`, {
      body: original, headers: { 'content-type': 'application/json', 'x-guide-list': 'one' },
    });
  }
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-response-evidence');
  try {
    // 用户操作：响应append/remove分别经Apply和真实新请求核对。
    // User actions: apply response append/remove separately and verify new real requests.
    await media.step('01-rules', '打开 Rules / Open Rules', openRules);
    await media.step('02-root-menu', '打开空白区域菜单 / Open the empty-area menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.create)).toBeVisible();
    });
    await media.step('03-create', '新建规则 / Create a Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('New Rule has no public identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    });
    await media.step('04-name', '命名 Guide response and body / Name the Rule Guide response and body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(ruleName);
    });
    await media.step('05-host', '限制 Host 为 127.0.0.1 / Restrict Host to 127.0.0.1', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('06-add-path', '添加 Path 条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('07-path', '限制本轮示例 Path / Restrict the example Path', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
    });
    await media.step('08-response-phase', 'Header 选择 Response / Choose Response for the Header', async () => {
      await field('phase').click();
      await field('phase-option.response').click();
    });
    await media.step('09-header', '填写 x-guide-list / Enter x-guide-list', async () => {
      await field('name').fill('x-guide-list');
    });
    await media.step('10-append', '选择 append / Choose append', async () => {
      await field('operation').click();
      await field('operation-option.append').click();
    });
    await media.step('11-value', '追加值填 two / Enter the appended value two', async () => {
      await field('value').fill('two');
    });
    await media.step('12-enable', '启用示例规则 / Enable the example Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('13-apply-append', 'Apply 响应 append / Apply response append', apply);
    await media.step('14-capture', '回到 Capture / Return to Capture', openCapture);
    await media.step('15-append-request', '重新请求 append / Send a new append request', async () => {
      const result = await httpTrafficRunner.run('h1-json', {
        kind: 'http', protocol: 'h1', method: 'GET', path: `${prefix}/append`, headers: {}, body: '',
      }, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200, headers: { 'x-guide-list': 'one, two' } } });
    });
    await media.step('16-append-select', '选择 append 请求 / Select the append request', async () => {
      await rows.filter({ hasText: `${prefix}/append` }).click();
    });
    await media.step('17-append-headers', '核对响应保留 one 并追加 two / Verify the response retains one and appends two', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      const controls = await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseHeaders).getAttribute('aria-controls');
      if (!controls) throw new Error('Response Headers does not identify its controlled content.');
      const responseHeaders = page.locator(`[id="${controls}"]`);
      for (const value of ['x-guide-list', 'one', 'two']) await expect(responseHeaders).toContainText(value);
    });
    await media.step('18-edit-remove', '返回原规则 / Return to the same Rule', openRules);
    await media.step('19-remove', '改为 remove / Switch to remove', async () => {
      await field('operation').click();
      await field('operation-option.remove').click();
      await expect(field('value')).toHaveCount(0);
    });
    await media.step('20-apply-remove', 'Apply 响应 remove / Apply response removal', apply);
    await media.step('21-capture-remove', '返回 Capture 核对移除 / Return to Capture to inspect removal', openCapture);
    await media.step('22-remove-request', '重新请求 remove / Send a new remove request', async () => {
      const result = await httpTrafficRunner.run('h1-json', {
        kind: 'http', protocol: 'h1', method: 'GET', path: `${prefix}/remove`, headers: {}, body: '',
      }, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      expect(result.response?.headers['x-guide-list']).toBeUndefined();
    });
    await media.step('23-remove-select', '选择 remove 请求 / Select the remove request', async () => {
      await rows.filter({ hasText: `${prefix}/remove` }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseHeaders)).toBeVisible();
    });

    // 用户操作：同一规则改为请求Body，分别查看、复制和保存实际版本。
    // User actions: change the Rule to request Body and inspect, copy and save actual versions.
    await media.step('24-edit-body', '返回 Rules 编辑正文动作 / Return to Rules to edit the body action', openRules);
    await media.step('25-remove-header', '移除 Header 动作 / Remove the Header action', async () => { await field('remove').click(); });
    await media.step('26-add-body', '添加 Body 动作 / Add a Body action', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
    });
    await media.step('27-request-phase', 'Body 选择 Request / Choose Request for the Body', async () => {
      await field('phase').click();
      await field('phase-option.request').click();
    });
    await media.step('28-body-value', '填写 guide-final 正文 / Enter the guide-final body', async () => { await field('content').fill(final); });
    await media.step('29-apply-body', 'Apply 请求正文 / Apply request-body replacement', apply);
    await media.step('30-capture-body', '返回 Capture 观察正文 / Return to Capture to inspect the body', openCapture);
    await media.step('31-post', '发送 guide-original 的 POST / Send a POST containing guide-original', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/request-body`, {
        method: 'POST', body: original, headers: { 'content-type': 'application/json' },
      })).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(`${prefix}/request-body`)?.body.toString('utf8')).toBe(final);
    });
    await media.step('32-body-select', '选择 request-body 请求 / Select the request-body request', async () => {
      await rows.filter({ hasText: `${prefix}/request-body` }).click();
    });
    await media.step('33-final', 'Request 默认显示 Final / Request initially shows Final', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
      await expect(bodyPane).toContainText('guide-final');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.source)).toHaveAttribute('data-source', 'text');
      await expect(getByAutomationId(page, AutomationIdFactory.captureBodyRuleEffect(ruleId))).toBeVisible();
    });
    await media.step('34-original', '切换 Original / Switch to Original', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.original).click();
      await expect(bodyPane).toContainText('guide-original');
    });
    await media.step('35-raw', '选择 Raw / Choose Raw', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      await expect(bodyPane).toContainText('guide-original');
    });
    await media.step('36-copy-original', '复制 Original / Copy Original', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(JSON.parse(original));
    });
    await media.step('37-fullscreen', '全屏查看 Original / View Original fullscreen', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
      await expect(page.getByRole('dialog')).toContainText('guide-original');
    });
    await media.step('38-close-fullscreen', 'Escape 返回详情 / Return to details with Escape', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).hover();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    });
    await media.step('39-final-again', '再次切换 Final / Switch back to Final', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.final).click();
      await expect(bodyPane).toContainText('guide-final');
    });
    await media.step('40-copy-final', '复制 Final / Copy Final', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(JSON.parse(final));
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), savedBody, () => media.nativeDialogStep(
      '41-save-dialog', '保存 Final 为 guide-final.json / Save Final as guide-final.json',
    ));
    await media.step('42-saved', '确认保存的是 Final / Confirm the saved body is Final', async () => {
      expect(await readFile(savedBody, 'utf8')).toBe(final);
      await expect(bodyPane).toContainText('guide-final');
    });
    await media.step('43-body-rule', '点击正文效果返回对应规则 / Follow the body effect to its Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureBodyRuleEffect(ruleId)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue(ruleName);
    });
    await media.step('44-response-body', '将 Body 改为 Response / Change the Body phase to Response', async () => {
      await field('phase').click();
      await field('phase-option.response').click();
    });
    await media.step('45-response-value', '填写 guide-response-final / Enter guide-response-final', async () => { await field('content').fill(responseFinal); });
    await media.step('46-apply-response', 'Apply 响应正文 / Apply response-body replacement', apply);
    await media.step('47-capture-response', '返回 Capture 核对响应 / Return to Capture to inspect the response', openCapture);
    await media.step('48-response-request', '发送新的 response-body 请求 / Send a new response-body request', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/response-body`)).body).toBe(responseFinal);
    });
    await media.step('49-response-select', '选择 response-body 请求 / Select the response-body request', async () => {
      await rows.filter({ hasText: `${prefix}/response-body` }).click();
    });
    await media.step('50-unavailable', '核对响应 Original 不可用 / Verify response Original is unavailable', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(bodyPane).toContainText('guide-response-final');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.original)).toBeDisabled();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable)).toBeVisible();
    });
    await media.step('51-rule-again', '返回产生响应的规则 / Return to the response writer Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureBodyRuleEffect(ruleId)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue(ruleName);
    });
    await media.step('52-disable', '停用本轮规则 / Disable this example Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('53-apply-disabled', 'Apply 停用状态 / Apply the disabled state', apply);
    await media.step('54-capture-restored', '返回 Capture 验证恢复 / Return to Capture to verify restoration', openCapture);
    await media.step('55-restored-request', '发送新请求核对无改写 / Verify a new request is unmodified', async () => {
      const result = await httpTrafficRunner.run('h1-json', {
        kind: 'http', protocol: 'h1', method: 'POST', path: `${prefix}/disabled`,
        body: original, headers: { 'content-type': 'application/json' },
      }, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: {
        statusCode: 200, body: original, headers: { 'x-guide-list': 'one' },
      } });
      expect(httpTrafficRunner.observation(`${prefix}/disabled`)?.body.toString('utf8')).toBe(original);
      await rows.filter({ hasText: `${prefix}/disabled` }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(bodyPane).toContainText('guide-original');
      await expect(getByAutomationId(page, AutomationIdFactory.captureBodyRuleEffect(ruleId))).toHaveCount(0);
    });
    // 证据：UI选择、复制、保存内容与源站/客户端逐一对应。
    // Evidence: UI selection, clipboard and saved content match origin/client observations.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({
      ruleName, host: '127.0.0.1', path: prefix, origin: httpTrafficRunner.url(prefix),
      responseHeader: 'x-guide-list', originalHeader: 'one', appendedHeader: 'two',
      originalBody: original, requestFinal: final, responseFinal, savedFile: 'guide-final.json',
      responseOriginal: 'unavailable; not an empty response body',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：只删除本轮文件，driver经真实Close核对全部进程与宿主恢复。
  // Cleanup: remove only the owned file directory; the driver verifies normal Close and host restoration.
});
