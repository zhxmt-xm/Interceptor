import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import type { ProxiedWebSocketClient, WebSocketTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';

const TOOL_NAMES = ['breakpoints_continue_queue', 'breakpoints_drop_queue', 'breakpoints_continue_rule'] as const;
const PROMPT = ['Execute the selected', 'Breakpoint batch operation.'].join(' ');
const ANSWER = ['The requested batch', 'operation is complete.'].join(' ');
const DRAFT = ['batch-draft-', 'must-not-forward'].join('');

interface HeldHttpRequest {
  readonly requestPath: string;
  readonly body: string;
  readonly outcome: Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Record<string, unknown> {
  for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing batch Tool result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Breakpoint batch lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('breakpoint-batch'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('breakpoint-batch-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function callAgent(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny',
): Promise<Record<string, unknown>> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: args });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return resultForCall(openAiCompatibleLab, callId);
}

async function selectCaptureRow(page: Page, requestPath: string): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).last();
  await expect(row).toBeVisible();
  if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Capture row omitted its exchange identity.');
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

async function holdHttpRequest(
  desktopApp: LocalElectronApplicationDriver,
  loopbackLab: HttpTrafficRunner,
  label: string,
  method: 'POST' | 'PUT',
): Promise<HeldHttpRequest> {
  const requestPath = `/e2e/breakpoint-batch/${label}`;
  const body = `batch-${label}-original`;
  desktopApp.registerSensitiveTextForEvidenceAudit(body);
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  const outcome = loopbackLab.requestThroughProxy(desktopApp.capturePort(), requestPath, { method, body })
    .then((result) => ({ result }), (error: unknown) => ({ error }));
  const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath }).last();
  await expect(row).toHaveAttribute('data-breakpoint-id', /.+/);
  return { requestPath, body, outcome };
}

async function expectForwarded(loopbackLab: HttpTrafficRunner, heldRequests: readonly HeldHttpRequest[]): Promise<void> {
  for (const heldRequest of heldRequests) {
    await expect(heldRequest.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
    await expect.poll(() => loopbackLab.observation(heldRequest.requestPath)?.body.toString('utf8')).toBe(heldRequest.body);
  }
}

async function expectDropped(loopbackLab: HttpTrafficRunner, heldRequest: HeldHttpRequest): Promise<void> {
  await expect(heldRequest.outcome).resolves.toHaveProperty('error');
  expect(loopbackLab.observation(heldRequest.requestPath)).toBeUndefined();
}

async function holdWebSocketFrames(
  page: Page,
  proxiedWebSocketClient: ProxiedWebSocketClient,
  requestPath: string,
  messages: readonly string[],
): Promise<string> {
  const exchangeId = await selectCaptureRow(page, requestPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointDirection.sent).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointEnable).click();
  for (const [index, message] of messages.entries()) {
    proxiedWebSocketClient.sendText(message);
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.breakpointPending)).toHaveCount(index + 1);
  }
  return `ws:${exchangeId}`;
}

async function disableWebSocketAndVerifyBarrier(page: Page, proxiedWebSocketClient: ProxiedWebSocketClient, requestPath: string, message: string): Promise<void> {
  await selectCaptureRow(page, requestPath);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.breakpointToggle).click();
  proxiedWebSocketClient.sendText(message);
  await proxiedWebSocketClient.waitForText(message);
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Breakpoint batch MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: { url: string; headers: { Authorization: string } } } };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'breakpoint-batch', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
  return { client, clientId };
}

function mcpValue(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP result omitted text.');
  return JSON.parse(content.text);
}

function webSocketMessageCount(webSocketLab: WebSocketTrafficRunner): number {
  return webSocketLab.evidence().messages.length;
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  const errors = desktopApp.rendererPageErrors();
  try {
    if (!desktopApp.page.isClosed()) {
      const closePanel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await closePanel.isVisible()) await closePanel.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
      await desktopApp.startTrace(testInfo);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
    expect(errors).toEqual([]);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('breakpoints.tools.batch scopes Agent and MCP batch commands to real pending traffic', async ({ desktopApp, httpTrafficRunner: loopbackLab, webSocketTrafficRunner: webSocketLab, openAiCompatibleLab }, testInfo) => {
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'breakpoints.tools.batch' });
  for (const text of [PROMPT, ANSWER, DRAFT]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const { page } = desktopApp;
  const clients: ProxiedWebSocketClient[] = [];
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：真实Settings配置Provider，正式discovery必须披露三条新Tool。
    // Arrange and Red: configure the Provider through real Settings and require all three Tools in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    const discovery = await callAgent(page, openAiCompatibleLab, 'batch-discover', 'discover_tools', { capabilityId: 'breakpoints' });
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name)).toBe(true);

    // 自产队列：UI建立两条HTTP Rule；两条WebSocket连接依次配置，不伪造多活动配置。
    // Product-owned queues: create two HTTP Rules through UI and configure two WebSocket connections in sequence, without inventing multiple active configurations.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    await createRequestBreakpointRule(page, 'Batch POST rule', 'POST');
    await createRequestBreakpointRule(page, 'Batch PUT rule', 'PUT');
    const postFirst = await holdHttpRequest(desktopApp, loopbackLab, 'agent-post-first', 'POST');
    const postSecond = await holdHttpRequest(desktopApp, loopbackLab, 'agent-post-second', 'POST');
    const putFirst = await holdHttpRequest(desktopApp, loopbackLab, 'agent-put', 'PUT');
    const query = await callAgent(page, openAiCompatibleLab, 'batch-query', 'breakpoints_list', {});
    const breakpoints = isRecord(query.value) && Array.isArray(query.value.breakpoints) ? query.value.breakpoints : [];
    const postBreakpoint = breakpoints.find((entry) => isRecord(entry) && entry.method === 'POST');
    if (!isRecord(postBreakpoint) || typeof postBreakpoint.ruleId !== 'string') throw new Error('Real POST breakpoint omitted its Rule identity.');
    const ruleId = postBreakpoint.ruleId;
    await selectCaptureRow(page, postFirst.requestPath);
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(DRAFT);
    const firstPath = '/e2e/breakpoint-batch/socket-first';
    const secondPath = '/e2e/breakpoint-batch/socket-second';
    const firstProxiedWebSocketClient = await webSocketLab.openThroughProxy(desktopApp.capturePort(), firstPath);
    const secondProxiedWebSocketClient = await webSocketLab.openThroughProxy(desktopApp.capturePort(), secondPath);
    clients.push(firstProxiedWebSocketClient, secondProxiedWebSocketClient);
    const firstMessages = ['first-a'].map((label) => `batch-websocket-${label}`);
    const secondMessages = ['second-a'].map((label) => `batch-websocket-${label}`);
    for (const text of [...firstMessages, ...secondMessages]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
    const firstQueueKey = await holdWebSocketFrames(page, firstProxiedWebSocketClient, firstPath, firstMessages);
    const secondQueueKey = await holdWebSocketFrames(page, secondProxiedWebSocketClient, secondPath, secondMessages);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('5');
    await screenshotStep('自产队列：UI建立两条HTTP Rule；两条WebSocket连接依次配置，不伪造多活动配置。 / Product-owned queues: create two HTTP Rules through UI and configure two WebSocket connections in sequence, without inventing multiple active configurations.');

    // Agent审批与Rule范围：Deny不解队，Allow只原样放行同Rule两项，不能采用草稿或触碰其他队列。
    // Agent approval and Rule scope: Deny preserves every pending item; Allow forwards only the two matching Rule members, without applying drafts or touching other queues.
    expect(await callAgent(page, openAiCompatibleLab, 'batch-deny', TOOL_NAMES[0], { queueKey: 'http' }, 'deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('5');
    expect(loopbackLab.evidence()).toHaveLength(0);
    expect(await callAgent(page, openAiCompatibleLab, 'batch-rule', TOOL_NAMES[2], { ruleId }, 'allow')).toEqual({ ok: true, value: { resolvedCount: 2 } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('batch-rule'))).toHaveAttribute('data-summary-kind', 'breakpointBatch');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('batch-rule'))).toHaveAttribute('data-resolved-count', '2');
    await expectForwarded(loopbackLab, [postFirst, postSecond]);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('3');
    expect(loopbackLab.observation(putFirst.requestPath)).toBeUndefined();
    for (const message of [...firstMessages, ...secondMessages]) expect(webSocketLab.hasMessage(message)).toBe(false);
    await screenshotStep('Agent审批与Rule范围：Deny不解队，Allow只原样放行同Rule两项，不能采用草稿或触碰其他队列。 / Agent approval and Rule scope: Deny preserves every pending item; Allow forwards only the two matching Rule members, without applying drafts or touching other queues.');

    // Agent Auto与队列隔离：丢弃HTTP、放行A、丢弃B；空目标返回0，其他队列不受影响。
    // Agent Auto and queue isolation: drop HTTP, continue A, then drop B; empty targets return zero without affecting another queue.
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    expect(await callAgent(page, openAiCompatibleLab, 'batch-drop-http', TOOL_NAMES[1], { queueKey: 'http' })).toEqual({ ok: true, value: { resolvedCount: 1 } });
    await expectDropped(loopbackLab, putFirst);
    expect(await callAgent(page, openAiCompatibleLab, 'batch-empty-http', TOOL_NAMES[1], { queueKey: 'http' })).toEqual({ ok: true, value: { resolvedCount: 0 } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('batch-empty-http'))).toHaveAttribute('data-summary-kind', 'breakpointBatch');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('batch-empty-http'))).toHaveAttribute('data-resolved-count', '0');
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('2');
    expect(await callAgent(page, openAiCompatibleLab, 'batch-continue-websocket', TOOL_NAMES[0], { queueKey: firstQueueKey })).toEqual({ ok: true, value: { resolvedCount: 1 } });
    for (const message of firstMessages) await firstProxiedWebSocketClient.waitForText(message);
    for (const message of secondMessages) expect(webSocketLab.hasMessage(message)).toBe(false);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('1');
    expect(await callAgent(page, openAiCompatibleLab, 'batch-drop-websocket', TOOL_NAMES[1], { queueKey: secondQueueKey })).toEqual({ ok: true, value: { resolvedCount: 1 } });
    await disableWebSocketAndVerifyBarrier(page, secondProxiedWebSocketClient, secondPath, 'batch-agent-barrier');
    for (const message of secondMessages) expect(webSocketLab.hasMessage(message)).toBe(false);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('batch-drop-http'))).toHaveCount(0);
    await screenshotStep('Agent Auto与队列隔离：丢弃HTTP、放行A、丢弃B；空目标返回0，其他队列不受影响。 / Agent Auto and queue isolation: drop HTTP, continue A, then drop B; empty targets return zero without affecting another queue.');

    // 双授权：Agent撤权不影响MCP；MCP使用同一三条命令，并在独立Ask/Auto下验证HTTP与WebSocket隔离。
    // Independent permissions: Agent revocation leaves MCP enabled; MCP uses the same three commands and verifies HTTP/WebSocket isolation under its own Ask/Auto mode.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('breakpoints_');
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const [index, name] of TOOL_NAMES.entries()) {
      const args = index === 2 ? { ruleId } : { queueKey: 'http' };
      expect(await callAgent(page, openAiCompatibleLab, `batch-disabled-${index}`, name, args)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const mcpMessages = ['mcp-first'].map((label) => `batch-websocket-${label}`);
    for (const text of mcpMessages) desktopApp.registerSensitiveTextForEvidenceAudit(text);
    const mcpQueueKey = await holdWebSocketFrames(page, secondProxiedWebSocketClient, secondPath, mcpMessages);
    const mcpPostFirst = await holdHttpRequest(desktopApp, loopbackLab, 'mcp-post-first', 'POST');
    const mcpPostSecond = await holdHttpRequest(desktopApp, loopbackLab, 'mcp-post-second', 'POST');
    const mcpPut = await holdHttpRequest(desktopApp, loopbackLab, 'mcp-put', 'PUT');
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
    const denied = client.callTool({ name: TOOL_NAMES[0], arguments: { queueKey: 'http' } });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[0]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(denied).resolves.toMatchObject({ isError: true });
    expect(loopbackLab.observation(mcpPostFirst.requestPath)).toBeUndefined();
    const continuedRule = client.callTool({ name: TOOL_NAMES[2], arguments: { ruleId } });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[2]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    expect(mcpValue(await continuedRule)).toEqual({ resolvedCount: 2 });
    await expectForwarded(loopbackLab, [mcpPostFirst, mcpPostSecond]);
    await automaticallyExecuteMcpClientTools(page, configuredClient.clientId);
    expect(mcpValue(await client.callTool({ name: TOOL_NAMES[1], arguments: { queueKey: 'http' } }))).toEqual({ resolvedCount: 1 });
    await expectDropped(loopbackLab, mcpPut);
    const mcpQueueFirst = await holdHttpRequest(desktopApp, loopbackLab, 'mcp-queue-first', 'POST');
    const mcpQueueSecond = await holdHttpRequest(desktopApp, loopbackLab, 'mcp-queue-second', 'POST');
    expect(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { queueKey: 'http' } }))).toEqual({ resolvedCount: 2 });
    await expectForwarded(loopbackLab, [mcpQueueFirst, mcpQueueSecond]);
    for (const message of mcpMessages) expect(webSocketLab.hasMessage(message)).toBe(false);
    expect(mcpValue(await client.callTool({ name: TOOL_NAMES[2], arguments: { ruleId } }))).toEqual({ resolvedCount: 0 });
    expect(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { queueKey: mcpQueueKey } }))).toEqual({ resolvedCount: 1 });
    for (const message of mcpMessages) await secondProxiedWebSocketClient.waitForText(message);
    await disableWebSocketAndVerifyBarrier(page, secondProxiedWebSocketClient, secondPath, 'batch-mcp-barrier');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => (TOOL_NAMES as readonly string[]).includes(tool.name)).length).toBe(0);
    for (const name of TOOL_NAMES) await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;
    for (const proxiedWebSocketClient of clients) proxiedWebSocketClient.destroy();

    // 重启与脱敏证据：不重放Model或数据面操作，独立授权保持，证据只含计数与哈希。
    // Restart and redacted evidence: replay neither Model nor data-plane operations, retain independent permissions, and archive counts and hashes only.
    for (const request of openAiCompatibleLab.requestsForAssertions()) expect(JSON.stringify(request)).not.toContain(DRAFT);
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = loopbackLab.evidence().length;
    const webSocketMessages = webSocketMessageCount(webSocketLab);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const text of [PROMPT, ANSWER, DRAFT]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(loopbackLab.evidence().length).toBe(originRequests);
    expect(webSocketMessageCount(webSocketLab)).toBe(webSocketMessages);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('breakpoints_');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('breakpoint-batch.json');
    await writeFile(evidencePath, JSON.stringify({
      ruleScopeVerified: true, queueScopeVerified: true, originalBodiesPreserved: true, draftIgnored: true,
      agentAndMcpAskAutoVerified: true, emptyTargetsReturnedZero: true, revocationVerified: true,
      originRequests, webSocketMessages, restartModelRequests: 0, restartOriginRequests: 0,
      contentHash: createHash('sha256').update(JSON.stringify(loopbackLab.evidence())).digest('hex'),
    }, null, 2), 'utf8');
    await testInfo.attach('breakpoint-batch.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先关闭外部Client，再正常退出Electron并验证宿主；紧急清理不能冒充验收通过。
    // Teardown: close external clients before gracefully stopping Electron and verifying the host; emergency cleanup never counts as acceptance.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    for (const proxiedWebSocketClient of clients) proxiedWebSocketClient.destroy();
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Breakpoint batch and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Breakpoint batch cleanup failed.');
});