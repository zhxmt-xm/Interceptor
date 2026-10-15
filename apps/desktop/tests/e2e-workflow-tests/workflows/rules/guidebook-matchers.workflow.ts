import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('rules matcher guide records all eight condition types and a real AND match', async ({
  desktopApp, httpTrafficRunner, trafficLab,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const requestPath = '/guide/matchers/order';
  const requestUrl = httpTrafficRunner.url(`${requestPath}?guide=matcher-demo`);
  const scenario = trafficLab.scenarios().find(candidate => candidate.id === 'h1-json');
  if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing HTTP guide traffic input.');
  const draft = scenario.defaultDraft;
  let ruleId = '';
  const row = (index: number) =>
    getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, index, 'remove')).locator('..');
  const field = (index: number) => row(index).locator('input:not([readonly])');
  const add = async (kind: keyof typeof AUTOMATION_IDS.rules.conditionOption): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption[kind]).click();
  };
  // 准备：唯一演示路径、真实200 JSON响应和无凭据Header。
  // Arrange: use an owned path, a real JSON 200 response and a credential-free header.
  httpTrafficRunner.respondWith(`${requestPath}?guide=matcher-demo`, {
    body: '{"message":"matcher-demo"}', headers: { 'content-type': 'application/json' },
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/matchers');
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-matchers');
  try {
    // 用户操作：从原始Host开始逐条添加条件，字段与演示请求保持一致。
    // User actions: add conditions one by one with values matching the actual example request.
    await media.step('01-rules', '打开 Rules / Open Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('02-create', '新建 Guide matchers / Create Guide matchers', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing new matcher Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide matchers');
    });
    await media.step('03-host', 'Host 为 127.0.0.1 / Set Host to 127.0.0.1', async () => {
      await field(0).fill('127.0.0.1');
    });
    await media.step('04-method-add', '添加 Method / Add Method', async () => { await add('method'); });
    await media.step('05-method', 'Method 为 GET / Set Method to GET', async () => { await field(1).fill('GET'); });
    await media.step('06-path-add', '添加 Path / Add Path', async () => { await add('path'); });
    await media.step('07-path', '填写接口 Path / Enter the endpoint Path', async () => { await field(2).fill(requestPath); });
    await media.step('08-url-add', '添加 URL / Add URL', async () => { await add('url'); });
    await media.step('09-url', '填写完整演示 URL / Enter the complete example URL', async () => { await field(3).fill(requestUrl); });
    await media.step('10-query-add', '添加 Query / Add Query', async () => { await add('query'); });
    await media.step('11-query', 'Query 为 guide=matcher-demo / Set the Query pair', async () => {
      await field(4).nth(0).fill('guide');
      await field(4).nth(1).fill('matcher-demo');
    });
    await media.step('12-header-add', '添加 Header / Add Header', async () => { await add('header'); });
    await media.step('13-header', 'Header 为 x-guide-match=yes / Set the request Header pair', async () => {
      await row(5).getByRole('combobox').nth(1).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await field(5).nth(0).fill('x-guide-match');
      await field(5).nth(1).fill('yes');
    });
    await media.step('14-status-add', '添加 Status / Add Status', async () => { await add('status'); });
    await media.step('15-status', '状态范围 200 到 200 / Set range 200 to 200', async () => {
      await field(6).nth(0).fill('200');
      await field(6).nth(1).fill('200');
    });
    await media.step('16-mime-add', '添加 MIME / Add MIME', async () => { await add('mime'); });
    await media.step('17-mime', 'Response MIME 为 application/json / Set the response MIME', async () => {
      await row(7).getByRole('combobox').nth(1).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await field(7).fill('application/json');
    });
    await media.step('18-effect-phase', '响应阶段改写 Header / Select response Header editing', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
    });
    await media.step('19-effect-name', '填写 x-interceptor-guide / Enter the effect Header name', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill('x-interceptor-guide');
    });
    await media.step('20-effect-value', '填写 matcher-demo / Enter the effect value', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('matcher-demo');
    });
    await media.step('21-enable', '启用完整规则 / Enable the complete Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('22-apply', 'Apply / Apply', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('23-match', '发送满足全部条件的 GET / Send a GET satisfying every condition', async () => {
      const response = await trafficLab.run(scenario.id, {
        ...draft, path: `${requestPath}?guide=matcher-demo`,
        headers: { ...draft.headers, 'x-guide-match': 'yes' },
      }, desktopApp.capturePort());
      expect(response).toMatchObject({ state: 'complete',
        response: { statusCode: 200, headers: { 'x-interceptor-guide': 'matcher-demo' } } });
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).last().click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(page.locator('body')).toContainText('matcher-demo');
    });
    await media.step('24-no-match', 'POST 不满足 Method / A POST does not satisfy Method', async () => {
      const response = await trafficLab.run(scenario.id, {
        ...draft, path: `${requestPath}?guide=matcher-demo`, method: 'POST',
        headers: { ...draft.headers, 'x-guide-match': 'yes' },
      }, desktopApp.capturePort());
      expect(response).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      expect(response.response?.headers['x-interceptor-guide']).toBeUndefined();
      await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).last().click();
    });
    // 证据：真实响应Header证明AND匹配，反例不是只看规则行的状态。
    // Evidence: the response Header proves AND matching; the negative case is not inferred from a Rule row.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ ruleName: 'Guide matchers', host: '127.0.0.1', method: 'GET', path: requestPath,
      url: requestUrl, query: 'guide=matcher-demo', requestHeader: 'x-guide-match: yes',
      statusRange: '200–200', responseMime: 'application/json', effectHeader: 'x-interceptor-guide: matcher-demo' });
  }
  // 清理：既有Close与宿主guard回收App、Core和代理。
  // Cleanup: normal Close and the host guard recover the App, Core and proxy.
});
