import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium, type Browser, type Page, type TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { PlaygroundServer } from '../../fixtures/runtime/playground-server';
import { readAppContainerSystemState, verifyAppContainerQueryResult, type AppContainerSystemState } from '../../fixtures/safety/app-container-system-state';

const SETTINGS_QUERY_NAMES = [
  'settings_get_core_process_status',
  'settings_get_system_proxy_status',
  'settings_get_certificate_status',
  'settings_get_tls_insecure_hosts',
  'settings_get_tls_passthrough',
  'settings_list_app_containers',
] as const;
const PROMPT = ['Inspect the six Settings states', 'without changing any configuration.'].join(' ');
const ANSWER = ['The six Settings queries', 'completed without changes.'].join(' ');
const DISABLED_PROMPT = ['Try the six disabled', 'Settings queries.'].join(' ');
const DISABLED_ANSWER = ['The six Settings queries', 'are unavailable.'].join(' ');
const SENSITIVE_TEXTS = [PROMPT, ANSWER, DISABLED_PROMPT, DISABLED_ANSWER];
const INSECURE_HOST = 'readonly-insecure.example.test';
const PASSTHROUGH_HOST = '*.readonly-passthrough.example.test';
async function readSystemState(desktopApp: LocalElectronApplicationDriver): Promise<{
  appContainers: AppContainerSystemState;
  proxy: unknown;
}> {
  return {
    appContainers: await readAppContainerSystemState(desktopApp.desktopDirectory),
    proxy: await desktopApp.readSystemProxySettings(),
  };
}

function exemptionHash(snapshot: AppContainerSystemState): string {
  return createHash('sha256').update(JSON.stringify(
    snapshot.exemptSids.map((sid) => sid.toLowerCase()).sort(),
  )).digest('hex');
}

async function openAgentSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.tools.capabilities)).toBeVisible();
}

async function configureTlsThroughUi(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput).fill(INSECURE_HOST);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd).click();
  await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput).fill(PASSTHROUGH_HOST);
  await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.addHost).click();
  await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();
}

async function verifyTlsThroughUi(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeDisabled();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle))
    .toHaveAttribute('aria-checked', 'false');
  await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
  await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();
}

async function completeTurn(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
}

async function finishGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  try {
    if (!desktopApp.page.isClosed()) {
      const closePanel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await closePanel.isVisible()) await closePanel.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await desktopApp.startTrace(testInfo);
      expect(desktopApp.rendererPageErrors()).toEqual([]);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
  } finally {
    await desktopApp.forceCleanup();
  }
}

async function copyMcpConfiguration(desktopApp: LocalElectronApplicationDriver): Promise<string> {
  await openAgentSettings(desktopApp.page);
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root))
    .toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label).fill('Settings readonly lab');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
  const row = desktopApp.page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-execution-mode', 'ask');
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client row has no public identity.');
  await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = await desktopApp.page.evaluate(() => navigator.clipboard.readText());
  const parsed = JSON.parse(configuration) as {
    servers: { interceptor: { headers: { Authorization: string } } };
  };
  const token = parsed.servers.interceptor.headers.Authorization.slice('Bearer '.length);
  desktopApp.registerSensitiveTextForEvidenceAudit(token);
  return configuration;
}

async function callPlaygroundTool(page: Page, name: string): Promise<Readonly<Record<string, unknown>>> {
  await getByAutomationId(page, `playground.mcp.tool.${name}`).click();
  await getByAutomationId(page, 'playground.mcp.arguments').fill('{}');
  await getByAutomationId(page, 'playground.mcp.call').click();
  await expect(getByAutomationId(page, 'playground.mcp.run')).toHaveAttribute('data-state', 'complete');
  const result = JSON.parse(await getByAutomationId(page, 'playground.mcp.result').innerText()) as {
    isError?: boolean;
    content: readonly { type: string; text?: string }[];
  };
  expect(result.isError).not.toBe(true);
  const text = result.content.find((entry) => entry.type === 'text')?.text;
  if (text === undefined) throw new Error('Playground Tool Result has no text content.');
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error('Playground Tool Result is not an object.');
  return value;
}

function verifyToolValues(
  values: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  appContainers: AppContainerSystemState,
): void {
  const core = values.get('settings_get_core_process_status')!;
  expect(core.state).toBe('running');
  expect(Number.isInteger(core.pid) && Number(core.pid) > 0).toBe(true);
  expect(core.restartCount).toBe(0);
  expect(values.get('settings_get_system_proxy_status')).toMatchObject({
    supported: true, enabled: true, owned: true, ownershipLost: false,
  });
  expect(values.get('settings_get_certificate_status')).toEqual({
    present: false, trusted: false, supported: true, mitmEnabled: false,
    fingerprint: null, subject: null, createdAt: null, expiresAt: null,
  });
  expect(values.get('settings_get_tls_insecure_hosts')).toEqual({ hosts: [INSECURE_HOST] });
  expect(values.get('settings_get_tls_passthrough')).toEqual({ revision: 1, hosts: [PASSTHROUGH_HOST] });
  const access = values.get('settings_list_app_containers')!;
  verifyAppContainerQueryResult(access, appContainers);
  for (const value of values.values()) {
    const serialized = JSON.stringify(value);
    expect(/[A-Za-z]:[\\/]|"(?:path|privateKey|proxyServer|bypassList|pacUrl|original)"/.test(serialized)).toBe(false);
  }
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Settings query lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('settings-readonly'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('settings-query-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toolResult(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  if (!Array.isArray(request.messages)) throw new Error('Model request has no messages.');
  const message = request.messages.find((entry) => (
    isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
  ));
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error(`Missing Settings Tool Result: ${callId}`);
  }
  const result: unknown = JSON.parse(message.content);
  if (!isRecord(result)) throw new Error('Settings Tool Result is not an object.');
  return result;
}

function discoveredNames(result: Readonly<Record<string, unknown>>): string[] {
  if (result.ok !== true || !isRecord(result.value) || !Array.isArray(result.value.matches)) return [];
  return result.value.matches.flatMap((match) => (
    isRecord(match) && isRecord(match.descriptor) && typeof match.descriptor.name === 'string'
      ? [match.descriptor.name]
      : []
  )).filter((name) => SETTINGS_QUERY_NAMES.some((expected) => expected === name));
}

test('settings.tools.readonly queries six real Settings owners without approval', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.readonly' });
  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let browser: Browser | null = null;
  let playgroundServer: PlaygroundServer | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：通过正式 UI 写入 TLS 配置并配置 Provider；OS 只读快照只用于内存比较。
    // Arrange: save TLS settings and configure the Provider through UI; read-only OS snapshots stay in memory.
    await configureTlsThroughUi(desktopApp.page);
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    const initialSystemState = await readSystemState(desktopApp);
    const requestOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'settings-discover',
      name: 'discover_tools',
      arguments: { capabilityId: 'settings' },
    });
    for (const name of SETTINGS_QUERY_NAMES) {
      openAiCompatibleLab.enqueueToolCall({ callId: name, name, arguments: {} });
    }
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });

    // 用户操作：默认 Ask Chat 发起 discovery 和六项只读查询。
    // User actions: a default Ask Chat discovers and executes the six read-only queries.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await completeTurn(desktopApp.page, PROMPT);

    // 业务断言：真实 Model 历史必须披露六项，并包含六个成功结果；query 不出现审批。
    // Business assertions: real Model history must disclose all six Tools and successful results without approval.
    const requests = openAiCompatibleLab.requestsForAssertions().slice(requestOffset);
    expect(requests).toHaveLength(8);
    const names = discoveredNames(toolResult(requests[1]!, 'settings-discover'));
    expect(names).toEqual(SETTINGS_QUERY_NAMES);
    const finalRequest = requests.at(-1)!;
    const agentValues = new Map<string, Readonly<Record<string, unknown>>>();
    for (const name of SETTINGS_QUERY_NAMES) {
      const result = toolResult(finalRequest, name);
      expect(result.ok).toBe(true);
      if (!isRecord(result.value)) throw new Error(`Settings query ${name} did not return an object.`);
      agentValues.set(name, result.value);
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval(name)))
        .toHaveCount(0);
    }
    verifyToolValues(agentValues, initialSystemState.appContainers);
    const summaryKinds = ['coreProcess', 'systemProxy', 'certificateStatus', 'tlsHosts', 'tlsPassthrough', 'appContainers'];
    for (const [index, name] of SETTINGS_QUERY_NAMES.entries()) {
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult(name)))
        .toHaveAttribute('data-summary-kind', summaryKinds[index]!);
    }

    // 外部交互：产品 UI 创建 MCP Client；真实系统 Browser 操作正式 Playground 的六项查询。
    // External interaction: create the MCP Client through UI, then execute all six queries in the official Playground Browser.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    const configuration = await copyMcpConfiguration(desktopApp);
    playgroundServer = await PlaygroundServer.start();
    browser = await chromium.launch({ channel: 'msedge' });
    const browserPage = await browser.newPage();
    await browserPage.goto(playgroundServer.url);
    await getByAutomationId(browserPage, 'playground.navigation.mcp').click();
    await getByAutomationId(browserPage, 'playground.mcp.configuration').fill(configuration);
    await getByAutomationId(browserPage, 'playground.mcp.connect').click();
    await expect(getByAutomationId(browserPage, 'playground.navigation.mcp'))
      .toHaveAttribute('data-connection-state', 'connected');
    await getByAutomationId(browserPage, 'playground.catalog.search').fill('settings_');
    const queryTools = browserPage.locator('[data-automation-id^="playground.mcp.tool.settings_"]')
      .filter({ has: browserPage.locator('[data-kind="query"]') });
    await expect(queryTools).toHaveCount(6);
    const mcpValues = new Map<string, Readonly<Record<string, unknown>>>();
    for (const name of SETTINGS_QUERY_NAMES) {
      mcpValues.set(name, await callPlaygroundTool(browserPage, name));
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    }
    verifyToolValues(mcpValues, initialSystemState.appContainers);
    expect(mcpValues.get('settings_get_core_process_status')!.pid)
      .toBe(agentValues.get('settings_get_core_process_status')!.pid);

    // 只读断言：查询前后完整代理和 exemption 集合不变，TLS 与证书 UI 状态不变。
    // Read-only assertions: the complete proxy and exemption sets, TLS settings, and certificate UI remain unchanged.
    const afterQueries = await readSystemState(desktopApp);
    expect(JSON.stringify(afterQueries.proxy) === JSON.stringify(initialSystemState.proxy)).toBe(true);
    expect(exemptionHash(afterQueries.appContainers)).toBe(exemptionHash(initialSystemState.appContainers));
    await verifyTlsThroughUi(desktopApp.page);

    // 用户操作：逐项撤销 Agent 权限；旧披露仍必须返回 unknown_tool，MCP 保持独立可用。
    // User actions: revoke each Agent permission; disclosed calls return unknown_tool while MCP stays independently available.
    await openAgentSettings(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('settings_');
    for (const name of SETTINGS_QUERY_NAMES) {
      const agentSwitch = getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name));
      await agentSwitch.click();
      await expect(agentSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)))
        .toHaveAttribute('aria-checked', 'true');
    }
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'settings-disabled-discover', name: 'discover_tools', arguments: { capabilityId: 'settings' },
    });
    for (const name of SETTINGS_QUERY_NAMES) {
      openAiCompatibleLab.enqueueToolCall({ callId: `disabled-${name}`, name, arguments: {} });
    }
    openAiCompatibleLab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await completeTurn(desktopApp.page, DISABLED_PROMPT);
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(disabledRequests).toHaveLength(8);
    expect(discoveredNames(toolResult(disabledRequests[1]!, 'settings-disabled-discover'))).toEqual([]);
    for (const name of SETTINGS_QUERY_NAMES) {
      expect(toolResult(disabledRequests.at(-1)!, `disabled-${name}`))
        .toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    expect(await callPlaygroundTool(browserPage, 'settings_get_tls_passthrough'))
      .toEqual({ revision: 1, hosts: [PASSTHROUGH_HOST] });

    // 用户操作：MCP 六项逐个撤权，保留 Browser 已选中的旧 Tool 验证调用失败，再刷新目录。
    // User actions: revoke each MCP Tool, verify the Browser's stale selection fails, then refresh the catalog.
    for (const name of SETTINGS_QUERY_NAMES) {
      await getByAutomationId(browserPage, `playground.mcp.tool.${name}`).click();
      const mcpSwitch = getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name));
      await mcpSwitch.click();
      await expect(mcpSwitch).toHaveAttribute('aria-checked', 'false');
      await getByAutomationId(browserPage, 'playground.mcp.arguments').fill('{}');
      const rejectedCall = browserPage.waitForResponse((response) => {
        const request = response.request();
        if (request.method() !== 'POST' || !request.url().endsWith('/mcp')) return false;
        const headers = request.headers();
        return headers['mcp-method'] === 'tools/call' && headers['mcp-name'] === name;
      }, { timeout: 15_000 });
      await getByAutomationId(browserPage, 'playground.mcp.call').click();
      await expect(getByAutomationId(browserPage, 'playground.mcp.run')).toHaveAttribute('data-state', 'failed');
      const rejectedResponse = await (await rejectedCall).json() as { error?: { code?: number } };
      expect(rejectedResponse.error?.code).toBe(-32602);
    }
    await getByAutomationId(browserPage, 'playground.mcp.refresh').click();
    await expect(queryTools).toHaveCount(0);
    await browser.close();
    browser = null;
    await playgroundServer.close();
    await playgroundServer.writeEvidence(testInfo);
    playgroundServer = null;

    // 重启：完整销毁第一代并保留 profile；第二代只恢复状态，不重放 Model 或 Tool 请求。
    // Restart: fully destroy generation one and retain its profile; generation two restores state without replaying Model or Tool requests.
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await finishGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of SENSITIVE_TEXTS) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    const restartModelRequestCount = openAiCompatibleLab.evidence().length - modelRequestCount;
    expect(restartModelRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await openAgentSettings(relaunchedApp.page);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('settings_');
    for (const name of SETTINGS_QUERY_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name)))
        .toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name)))
        .toHaveAttribute('aria-checked', 'false');
    }
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const name of SETTINGS_QUERY_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolCall(name)))
        .toHaveAttribute('data-tool-status', 'completed');
    }
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await verifyTlsThroughUi(relaunchedApp.page);
    await getByAutomationId(relaunchedApp.page, AutomationIdFactory.tlsPassthroughRemoveHost(PASSTHROUGH_HOST)).click();
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST)))
      .toHaveCount(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.certificates).click();
    await getByAutomationId(relaunchedApp.page, AutomationIdFactory.insecureHostRemove(INSECURE_HOST)).click();
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toHaveCount(0);
    const finalSystemState = await readSystemState(relaunchedApp);
    expect(exemptionHash(finalSystemState.appContainers)).toBe(exemptionHash(initialSystemState.appContainers));

    // 证据：只保存协议字段、计数和 hash；两代 driver 与外层 guard 负责销毁和完整宿主恢复。
    // Evidence: retain protocol fields, counts, and hashes only; both drivers and the outer guard verify teardown and host restoration.
    const evidencePath = testInfo.outputPath('settings-tools-readonly.json');
    await writeFile(evidencePath, JSON.stringify({
      names,
      agentQueryCount: agentValues.size,
      mcpQueryCount: mcpValues.size,
      proxyUnchanged: true,
      exemptionSetHash: exemptionHash(initialSystemState.appContainers),
      tlsAndCertificateUnchanged: true,
      agentRevokedCount: SETTINGS_QUERY_NAMES.length,
      mcpRevokedCount: SETTINGS_QUERY_NAMES.length,
      restartModelRequestCount,
      persistedDisabledCount: SETTINGS_QUERY_NAMES.length,
      testTlsSettingsRemoved: true,
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('settings-tools-readonly.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：即使业务断言失败，也关闭 Browser/lab 和当前 Electron 代际；保留全部清理错误。
    // Teardown: close the Browser, lab, and current Electron generation even after assertion failure, retaining all cleanup errors.
    if (browser !== null) await browser.close().catch((error: unknown) => cleanupErrors.push(error));
    if (playgroundServer !== null) {
      await playgroundServer.close().catch((error: unknown) => cleanupErrors.push(error));
      await playgroundServer.writeEvidence(testInfo).catch((error: unknown) => cleanupErrors.push(error));
    }
    await finishGeneration(relaunchedApp ?? desktopApp, testInfo)
      .catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) {
    throw new AggregateError([workflowError, ...cleanupErrors], 'Settings workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Settings cleanup failed.');
});