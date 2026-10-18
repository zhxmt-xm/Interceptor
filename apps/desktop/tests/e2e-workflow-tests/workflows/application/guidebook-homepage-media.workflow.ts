import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { openMcpSettings } from '../../fixtures/ui/mcp-workflow';

test('homepage records paired real light and dark feature screenshots', async ({
  desktopApp, httpTrafficRunner, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const initialLanguage = await page.locator('html').getAttribute('lang');
  if (initialTheme !== 'light' && initialTheme !== 'dark' && initialTheme !== 'warm' && initialTheme !== 'ember') {
    throw new Error('The released App must expose its actual theme.');
  }
  const prefix = '/showcase/';
  const orderPath = `${prefix}orders`;
  const rulePath = `${prefix}rule-match`;
  const pausedPath = `${prefix}review`;
  const orderBody = '{"orderId":"demo-001","items":[{"sku":"keyboard","quantity":1},{"sku":"cable","quantity":2}],"status":"ready","total":128}';
  const replacementBody = '{"orderId":"demo-001","status":"reviewed","approved":true}';
  const modelName = 'Homepage local demo';
  const answer = 'Local demo: the selected request returned JSON with status ready. Rules can add a debug header; Breakpoints let you review a request before forwarding it.';

  // 准备：只有本轮自产流量，使用正式Release、独立profile和原生窗口。
  // Arrange: use owned traffic, the released App, an isolated profile and its native window.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  httpTrafficRunner.respondWith(orderPath, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-demo-source': 'homepage-local-origin' },
    body: orderBody,
  });
  for (const name of ['catalog', 'profile', 'cart', 'health', 'inventory', 'orders']) {
    const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}${name}`);
    expect(result.statusCode).toBe(200);
  }
  const orderRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: orderPath });
  await orderRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(page.locator('body')).toContainText('demo-001');
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'homepage');
  const captureThemes = async (feature: string): Promise<void> => {
    for (const theme of ['light', 'dark'] as const) {
      await media.step(`${feature}-${theme}`, `${feature} · ${theme} 实际窗口 / Actual ${feature} window in ${theme}`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
        await getByAutomationId(page, AUTOMATION_IDS.shell.theme[theme]).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage ?? '');
        await page.mouse.move(900, 24);
      });
    }
  };
  const sendPausedRequest = () => httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), pausedPath, {
    method: 'POST', body: '{"orderId":"demo-001","status":"draft"}',
    headers: { 'content-type': 'application/json' },
  }).then(response => ({ kind: 'response' as const, response }),
    error => ({ kind: 'error' as const, message: error instanceof Error ? error.message : String(error) }));
  let pending: ReturnType<typeof sendPausedRequest> | undefined;
  try {
    // 用户操作：同一业务状态成对取景，不替换产品数据或调色伪造深色。
    // User actions: capture each real state in both themes without injected data or recoloring.
    await captureThemes('capture');

    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    const ruleAutomationId = await ruleRow.getAttribute('data-automation-id');
    if (!ruleAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) {
      throw new Error('The created Rule has no public identity.');
    }
    const ruleId = ruleAutomationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Add debug header');
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(rulePath);
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill('x-interceptor-demo');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('homepage');
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), rulePath)).statusCode).toBe(200);
    await expect.poll(() => httpTrafficRunner.observation(rulePath)?.headers['x-interceptor-demo']).toBe('homepage');
    await expect(getByAutomationId(page, AutomationIdFactory.ruleHitCount(ruleId))).toHaveAttribute('data-count', '1');
    await captureThemes('rules');

    await createRequestBreakpointRule(page, 'Review outgoing JSON', 'POST', pausedPath);
    pending = sendPausedRequest();
    const pausedRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: pausedPath });
    await pausedRow.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(replacementBody);
    await captureThemes('breakpoints');
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    expect(await pending).toMatchObject({ kind: 'response', response: { statusCode: 200 } });
    pending = undefined;
    expect(httpTrafficRunner.observation(pausedPath)?.body.toString('utf8')).toBe(replacementBody);

    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(orderPath));
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-interceptor-demo');
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('composer');
    await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('demo-001');
    await captureThemes('composer');

    await openMcpSettings(page);
    await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(modelName);
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('homepage'));
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('homepage-demo-model');
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.models.list)).toHaveAttribute('data-model-count', '1');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await orderRow.last().click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    openAiCompatibleLab.enqueueTurn({ textChunks: [answer],
      usage: { inputTokens: 64, outputTokens: 32, cacheHitInputTokens: 0, cacheMissInputTokens: 64 } });
    await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill('Explain the demo request. Do not change settings.');
    await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).toContainText(answer);
    await captureThemes('agent');
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();

    await openMcpSettings(page);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Homepage local client');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const clientRow = page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(clientRow).toHaveCount(1);
    const clientId = await clientRow.getAttribute('data-client-id');
    if (!clientId) throw new Error('The created MCP Client has no public identity.');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.root).scrollIntoViewIfNeeded();
    await captureThemes('mcp');

    // 业务断言与证据：同一组真实原图、准确演示边界和发布来源由录制清单保留。
    // Assert and evidence: retain one real image set and accurate demo/release boundaries.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await getByAutomationId(page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
    await expect(clientRow).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
  } finally {
    // 清理：结束挂起请求、恢复本profile主题并停止单窗口录制，driver负责正常Close。
    // Cleanup: resolve an owned pending request, restore the theme, stop recording and let the driver Close.
    try {
      if (pending) {
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
        await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: pausedPath }).click();
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
        expect(await pending).toMatchObject({ kind: 'response', response: { statusCode: 200 } });
      }
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
      await getByAutomationId(page, AUTOMATION_IDS.shell.theme[initialTheme]).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme);
    } finally {
      await media.stop({
        initialTheme, appLanguage: initialLanguage ?? '', languageChanged: 'false',
        source: 'released App; actual native window; no recoloring or mock UI',
        traffic: httpTrafficRunner.url(prefix), response: orderBody,
        model: modelName, modelKind: 'deterministic local demo, no commercial-model claim',
        mcp: 'real local server settings and demo Client; no external-host compatibility claim',
      });
    }
  }
});
