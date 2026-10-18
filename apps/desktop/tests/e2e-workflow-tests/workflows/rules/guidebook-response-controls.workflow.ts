import { gunzipSync } from 'node:zlib';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules guide records synthetic Headers, disable recovery, block modes and explicit body encoding', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(540_000);
  const { page } = desktopApp;
  const prefix = '/guide/response-controls';
  const original = '{"message":"guide-origin"}';
  const replacement = '{"message":"guide-encoded-body"}';
  let ruleId = '';
  const actionField = (index: number, name: string) => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, index, name));
  const card = (index = 0) => actionField(index, 'remove').locator('../..');
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  const capture = async (requestPath: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).last().click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  };
  const rules = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  };
  const request = async (suffix: string) => {
    const requestPath = `${prefix}/${suffix}`;
    httpTrafficRunner.respondWith(requestPath, {
      body: original, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(original)) },
    });
    return httpTrafficRunner.run('h1-json', {
      kind: 'http', protocol: 'h1', method: 'GET', path: requestPath, body: '', headers: {},
    }, desktopApp.capturePort());
  };
  const selectBlockMode = async (index: 0 | 1): Promise<void> => {
    const combo = card().getByRole('combobox');
    await combo.click();
    const listId = await combo.getAttribute('aria-controls');
    if (!listId) throw new Error('Block mode has no controlled list.');
    const target = page.locator(`[id="${listId}"] [role="option"]`).nth(index);
    const targetId = await target.getAttribute('id');
    if (!targetId) throw new Error('Block mode option has no public active-descendant identity.');
    if (await combo.getAttribute('aria-activedescendant') !== targetId) {
      await combo.press(index === 0 ? 'ArrowUp' : 'ArrowDown');
    }
    await expect(combo).toHaveAttribute('aria-activedescendant', targetId);
    await combo.press('Enter');
  };
  // 准备：所有动作只作用于本轮公开前缀，不修改用户服务；原始响应由自有origin提供。
  // Arrange: every action targets only the public owned prefix, never user services; the origin supplies the original body.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-response-controls');
  const enable = async (name: string): Promise<void> => {
    await media.step(`${name}-enable`, '启用当前动作 / Enable the current action', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step(`${name}-apply`, 'Apply当前动作 / Apply the current action', apply);
  };
  const disable = async (name: string): Promise<void> => {
    await media.step(`${name}-back`, '返回同一规则 / Return to the same Rule', rules);
    await media.step(`${name}-disable`, '停用这条规则 / Disable this Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step(`${name}-apply-off`, 'Apply停用状态 / Apply the disabled state', apply);
    await media.step(`${name}-restored`, '发送新请求核对源站恢复 / Verify origin recovery with a new request', async () => {
      const result = await request(`${name}-off`);
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200, body: original } });
      expect(httpTrafficRunner.observation(`${prefix}/${name}-off`)?.method).toBe('GET');
      await capture(`${prefix}/${name}-off`);
    });
    await media.step(`${name}-edit-next`, '返回Rules继续编辑 / Return to Rules to continue editing', rules);
  };
  const replaceAction = async (name: string, automationId: string): Promise<void> => {
    await media.step(`${name}-remove`, '移除前一个动作 / Remove the previous action', async () => { await actionField(0, 'remove').click(); });
    await media.step(`${name}-add`, '添加本次动作 / Add this action', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, automationId).click();
    });
  };
  try {
    await media.step('01-rules', '打开Rules / Open Rules', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click(); });
    await media.step('02-create', '创建Guide response controls / Create Guide response controls', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing response-control Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide response controls');
    });
    await media.step('03-host', '限定127.0.0.1 / Restrict to 127.0.0.1', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    });
    await media.step('04-path-condition', '添加Path / Add Path', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('05-path', '限定本轮动作路径 / Restrict this run’s action paths', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
    });
    await replaceAction('synthetic', AUTOMATION_IDS.rules.actionOption.synthetic);
    await media.step('synthetic-status', '设置503模拟状态 / Set mock status 503', async () => { await card().locator('input[type="number"]').fill('503'); });
    await media.step('synthetic-add-type', '为模拟响应添加Header / Add a Header to the synthetic response', async () => { await card().getByRole('button').last().click(); });
    await media.step('synthetic-type-name', '填写content-type / Enter content-type', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(0).fill('content-type'); });
    await media.step('synthetic-type-value', '填写application/json / Enter application/json', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(1).fill('application/json'); });
    await media.step('synthetic-add-extra', '添加第二个模拟Header / Add the second synthetic Header', async () => { await card().getByRole('button').last().click(); });
    await media.step('synthetic-extra-name', '填写x-guide-maintenance / Enter x-guide-maintenance', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(2).fill('x-guide-maintenance'); });
    await media.step('synthetic-extra-value', '填写planned / Enter planned', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(3).fill('planned'); });
    await media.step('synthetic-body', '填写模拟JSON正文 / Enter the synthetic JSON body', async () => { await card().locator('textarea').fill('{"message":"guide-maintenance"}'); });
    await enable('synthetic');
    await media.step('synthetic-result', '核对503、Header与模拟正文 / Verify status 503, Headers and the mock body', async () => {
      const result = await request('synthetic-on');
      expect(result).toMatchObject({ response: { statusCode: 503, body: '{"message":"guide-maintenance"}', headers: { 'content-type': 'application/json', 'x-guide-maintenance': 'planned' } } });
      expect(httpTrafficRunner.observation(`${prefix}/synthetic-on`)).toBeUndefined();
      await capture(`${prefix}/synthetic-on`);
    });
    await disable('synthetic');
    await replaceAction('delay', AUTOMATION_IDS.rules.actionOption.delay);
    await media.step('delay-value', '设置2000ms延迟 / Set a 2000ms delay', async () => { await card().locator('input[type="number"]').fill('2000'); });
    await enable('delay');
    await media.step('delay-result', '核对实际等待后仍到达源站 / Verify the real wait still reaches the origin', async () => {
      const started = performance.now();
      expect(await request('delay-on')).toMatchObject({ state: 'complete', response: { statusCode: 200, body: original } });
      expect(performance.now() - started).toBeGreaterThanOrEqual(2000);
      await capture(`${prefix}/delay-on`);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing).click();
    });
    await disable('delay');
    await replaceAction('block', AUTOMATION_IDS.rules.actionOption.block);
    await media.step('block-reset', '选择reset模式 / Select reset mode', async () => {
      await selectBlockMode(0);
    });
    await enable('block');
    await media.step('block-reset-result', '核对reset阻断 / Verify reset blocking', async () => {
      expect(await request('reset-on')).toMatchObject({ state: 'failed' });
      expect(httpTrafficRunner.observation(`${prefix}/reset-on`)).toBeUndefined();
      await capture(`${prefix}/reset-on`);
    });
    await media.step('block-edit-close', '返回规则切换阻断方式 / Return to the Rule to change blocking mode', rules);
    await media.step('block-close', '选择close模式 / Select close mode', async () => {
      await selectBlockMode(1);
    });
    await media.step('block-apply-close', 'Apply close模式 / Apply close mode', apply);
    await media.step('block-close-result', '核对close阻断 / Verify close blocking', async () => {
      expect(await request('close-on')).toMatchObject({ state: 'failed' });
      expect(httpTrafficRunner.observation(`${prefix}/close-on`)).toBeUndefined();
      await capture(`${prefix}/close-on`);
    });
    await disable('block');

    // 用户操作：先只改编码Header，再显式替换Body，分别核对未编码与真正gzip字节。
    // User actions: first edit only the encoding Header, then explicitly replace Body; verify unchanged and genuinely gzipped bytes separately.
    await replaceAction('encoding', AUTOMATION_IDS.rules.actionOption.header);
    await media.step('encoding-phase', 'Header选择Response / Select Response for the Header', async () => {
      await actionField(0, 'phase').click();
      await actionField(0, 'phase-option.response').click();
    });
    await media.step('encoding-name', '填写content-encoding / Enter content-encoding', async () => { await actionField(0, 'name').fill('content-encoding'); });
    await media.step('encoding-value', '填写gzip / Enter gzip', async () => { await actionField(0, 'value').fill('gzip'); });
    await enable('encoding');
    await media.step('encoding-header-only', '只改Header不会压缩原文 / Header-only editing does not compress the original body', async () => {
      const result = await request('header-only');
      expect(result.response?.headers['content-encoding']).toBe('gzip');
      expect(result.response?.bodyEncoding).toBe('base64');
      expect(Buffer.from(result.response!.body, 'base64').toString('utf8')).toBe(original);
      await capture(`${prefix}/header-only`);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    });
    await media.step('encoding-edit-body', '返回规则添加明确Body替换 / Return to add an explicit Body replacement', rules);
    await media.step('encoding-add-body', '添加Body动作 / Add the Body action', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
    });
    await media.step('encoding-body-phase', 'Body选择Response / Select Response for Body', async () => {
      await actionField(1, 'phase').click();
      await actionField(1, 'phase-option.response').click();
    });
    await media.step('encoding-body', '填写guide-encoded-body / Enter guide-encoded-body', async () => { await actionField(1, 'content').fill(replacement); });
    await media.step('encoding-apply-body', 'Apply Header与Body / Apply Header and Body', apply);
    await media.step('encoding-body-result', '核对gzip线上字节与可读正文 / Verify gzipped wire bytes and the readable body', async () => {
      const result = await request('body-updated');
      expect(result.response?.headers['content-encoding']).toBe('gzip');
      expect(result.response?.bodyEncoding).toBe('base64');
      const bytes = Buffer.from(result.response!.body, 'base64');
      expect(gunzipSync(bytes).toString('utf8')).toBe(replacement);
      expect(Number(result.response?.headers['content-length'])).toBe(bytes.length);
      await capture(`${prefix}/body-updated`);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('guide-encoded-body');
    });
    await disable('encoding');
    // 证据：每类停用后都用独立新请求确认恢复，不挪用其他动作的恢复画面。
    // Evidence: each disabled action has its own new recovery request, never another action's screenshot.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      ruleName: 'Guide response controls', host: '127.0.0.1', path: prefix,
      original, mockStatus: '503', mockBody: '{"message":"guide-maintenance"}',
      mockHeader: 'x-guide-maintenance: planned', delayMs: '2000', blockModes: 'reset, close',
      encoding: 'gzip', bodyReplacement: replacement,
      encodingBoundary: 'Header-only keeps original bytes; explicit Body replacement is encoded using the final Headers',
    });
  }
  // 清理：真实Close与宿主guard恢复系统代理、CA、进程和8888。
  // Cleanup: real Close and the host guard restore system proxy/CA, processes and port 8888.
});
