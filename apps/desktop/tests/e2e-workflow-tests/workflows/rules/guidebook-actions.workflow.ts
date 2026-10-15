import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('rules action guide verifies Query, Body, Status, Mock, Delay, Block and mapping against real traffic', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(600_000);
  const { page } = desktopApp;
  const directory = await mkdtemp('/tmp/interceptor-guidebook-map-');
  const localPath = path.join(directory, 'guide-local.txt');
  const localBody = 'Hello from guide-local.txt';
  let finished = false;
  const actions = {
    query: AUTOMATION_IDS.rules.actionOption.query,
    body: AUTOMATION_IDS.rules.actionOption.body,
    status: AUTOMATION_IDS.rules.actionOption.status,
    synthetic: AUTOMATION_IDS.rules.actionOption.synthetic,
    delay: AUTOMATION_IDS.rules.actionOption.delay,
    block: AUTOMATION_IDS.rules.actionOption.block,
    'map-remote': AUTOMATION_IDS.rules.actionOption.mapRemote,
    'map-local': AUTOMATION_IDS.rules.actionOption.mapLocal,
  } as const;
  const prefix = '/guide/rule-actions';

  // 准备：使用真实录制与本轮唯一流量路径；Map Local输入必须由产品Save body产生。
  // Arrange: use real Recording and owned paths; Map Local input must come from product Save body.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-actions');
  const actionCard = (ruleId: string) =>
    getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).locator('../..');

  const createRule = async (kind: keyof typeof actions, requestPath: string): Promise<string> => {
    let ruleId = '';
    await media.step(`${kind}-01-rules`, '回到 Rules / Return to Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step(`${kind}-02-create`, `新建 ${kind} 规则 / Create a ${kind} Rule`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('New Rule has no public identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    });
    await media.step(`${kind}-03-name`, `命名 Guide ${kind} / Name the Rule Guide ${kind}`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(`Guide ${kind}`);
    });
    await media.step(`${kind}-04-host`, '限制本机 Host / Restrict Host to 127.0.0.1', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    });
    await media.step(`${kind}-05-path`, '填写本动作的测试 Path / Enter this action’s test Path', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
      await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(requestPath);
    });
    await media.step(`${kind}-06-remove`, '移除默认 Header 动作 / Remove the default Header action', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).click();
    });
    await media.step(`${kind}-07-action`, `选择 ${kind} 动作 / Select the ${kind} action`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, actions[kind]).click();
    });
    return ruleId;
  };
  const apply = async (kind: string): Promise<void> => {
    await media.step(`${kind}-09-enable`, '启用当前规则 / Enable the current Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step(`${kind}-10-apply`, 'Apply 到真实代理 / Apply to the real proxy', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
  };
  const showRequest = async (requestPath: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  };

  try {
    // 用户操作：每类动作都从真实表单构造，再用客户端/源站事实核对效果。
    // User actions: build each action through actual forms and verify client/origin facts.
    const queryPath = `${prefix}/query`;
    const queryRule = await createRule('query', queryPath);
    await media.step('query-08-values', '设置 guide=rewritten / Set guide=rewritten', async () => {
      const inputs = actionCard(queryRule).locator('input:not([readonly])');
      await inputs.nth(0).fill('guide');
      await inputs.nth(1).fill('rewritten');
    });
    await apply('query');
    await media.step('query-11-result', '核对最终 Query / Verify the final Query', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${queryPath}?guide=original`)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(`${queryPath}?guide=rewritten`)?.method).toBe('GET');
      await showRequest(queryPath);
    });

    const bodyPath = `${prefix}/body`;
    httpTrafficRunner.respondWith(bodyPath, { body: '{"message":"original"}', headers: { 'content-type': 'application/json' } });
    const bodyRule = await createRule('body', bodyPath);
    await media.step('body-08-phase', '选择 Response 阶段 / Select the response phase', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(bodyRule, 0, 'phase')).click();
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(bodyRule, 0, 'phase-option.response')).click();
    });
    await media.step('body-08-content', '填写 guide-body 替换 / Enter the guide-body replacement', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(bodyRule, 0, 'content')).fill('{"message":"guide-body"}');
    });
    await apply('body');
    await media.step('body-11-result', '读取 Final 正文 / Inspect the Final body', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), bodyPath)).body).toBe('{"message":"guide-body"}');
      await showRequest(bodyPath);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView)).toContainText('guide-body');
    });

    const statusPath = `${prefix}/status`;
    const statusRule = await createRule('status', statusPath);
    await media.step('status-08-value', '设置状态 418 / Set status 418', async () => {
      await actionCard(statusRule).locator('input[type="number"]').fill('418');
    });
    await apply('status');
    await media.step('status-11-result', '核对客户端收到 418 / Verify HTTP 418', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), statusPath)).statusCode).toBe(418);
      await showRequest(statusPath);
    });

    const mockPath = `${prefix}/mock`;
    const mockRule = await createRule('synthetic', mockPath);
    await media.step('synthetic-08-status', '设置模拟状态 503 / Set mock status 503', async () => {
      await actionCard(mockRule).locator('input[type="number"]').fill('503');
    });
    await media.step('synthetic-08-body', '填写模拟响应 / Enter the mock response', async () => {
      await actionCard(mockRule).locator('textarea').fill('{"message":"guide maintenance"}');
    });
    await apply('synthetic');
    await media.step('synthetic-11-result', '核对模拟响应绕过源站 / Verify the origin was not called', async () => {
      expect(await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), mockPath))
        .toMatchObject({ statusCode: 503, body: '{"message":"guide maintenance"}' });
      expect(httpTrafficRunner.observation(mockPath)).toBeUndefined();
      await showRequest(mockPath);
    });

    const delayPath = `${prefix}/delay`;
    const delayRule = await createRule('delay', delayPath);
    await media.step('delay-08-value', '设置 500 毫秒 / Set 500 milliseconds', async () => {
      await actionCard(delayRule).locator('input[type="number"]').fill('500');
    });
    await apply('delay');
    await media.step('delay-11-result', '核对实际等待 / Verify the actual delay', async () => {
      const start = performance.now();
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), delayPath)).statusCode).toBe(200);
      expect(performance.now() - start).toBeGreaterThanOrEqual(500);
      await showRequest(delayPath);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing).click();
    });

    const blockPath = `${prefix}/block`;
    await createRule('block', blockPath);
    await apply('block');
    await media.step('block-11-result', '核对请求被阻断 / Verify the blocked request', async () => {
      await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), blockPath)).rejects.toThrow();
      expect(httpTrafficRunner.observation(blockPath)).toBeUndefined();
      await showRequest(blockPath);
    });

    const remoteSource = `${prefix}/remote-source`;
    const remoteTarget = `${prefix}/remote-target`;
    httpTrafficRunner.respondWith(remoteTarget, { body: 'Hello from guide-remote' });
    const remoteRule = await createRule('map-remote', remoteSource);
    await media.step('map-remote-08-path', '只更改目标 Path / Change only the destination Path', async () => {
      await actionCard(remoteRule).locator('input').last().fill(remoteTarget);
    });
    await apply('map-remote');
    await media.step('map-remote-11-result', '核对目标路径改变 / Verify the mapped destination', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), remoteSource)).body).toBe('Hello from guide-remote');
      expect(httpTrafficRunner.observation(remoteTarget)?.method).toBe('GET');
      await showRequest(remoteSource);
    });

    const fileSource = `${prefix}/file-source`;
    httpTrafficRunner.respondWith(fileSource, { body: localBody, headers: { 'content-type': 'text/plain' } });
    await media.step('map-local-00-capture', '捕获可公开文本 / Capture public example text', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), fileSource)).body).toBe(localBody);
      await showRequest(fileSource);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), localPath, () =>
      media.nativeDialogStep('map-local-00-save', '导出为 guide-local.txt / Export guide-local.txt'));
    await expect.poll(async () => readFile(localPath, 'utf8')).toBe(localBody);
    const localRequest = `${prefix}/local`;
    const localRule = await createRule('map-local', localRequest);
    await media.step('map-local-08-path', '填写刚导出的文件路径 / Enter the product-exported file path', async () => {
      await actionCard(localRule).locator('input').fill(localPath);
    });
    await apply('map-local');
    await media.step('map-local-11-result', '核对本地文件响应 / Verify the local-file response', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), localRequest)).body).toBe(localBody);
      expect(httpTrafficRunner.observation(localRequest)).toBeUndefined();
      await showRequest(localRequest);
    });
    // 证据：所有动作都有真实网络结果；没有使用预造的业务导入文件。
    // Evidence: every action has a real network result; no business import file was seeded.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    finished = true;
  } finally {
    await media.stop({ host: '127.0.0.1', pathPrefix: prefix, queryName: 'guide',
      queryBefore: 'original', queryAfter: 'rewritten', replacementBody: '{"message":"guide-body"}',
      status: '418', mockStatus: '503', mockBody: '{"message":"guide maintenance"}', delayMs: '500',
      remoteSource: `${prefix}/remote-source`, remoteTarget: `${prefix}/remote-target`,
      localFile: localPath, localBody });
    if (finished) await rm(directory, { recursive: true, force: true });
  }
  // 清理：fixture通过正式Close验证全部Core、任务、8888和宿主恢复。
  // Cleanup: the fixture verifies normal Close, Core/tasks, port 8888 and host restoration.
});
