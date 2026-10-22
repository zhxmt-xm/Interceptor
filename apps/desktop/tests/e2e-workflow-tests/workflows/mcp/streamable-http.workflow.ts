import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import type { RuleNode } from '../../../../src/shared/desktop-api';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import {
  copyMcpClientConfiguration,
  openMcpSettings,
  resumeRecording,
  type McpHostConfiguration,
} from '../../fixtures/ui/mcp-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';

const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-11-25', '2026-07-28'] as const;
type McpProtocolVersion = typeof MCP_PROTOCOL_VERSIONS[number];

const MCP_RULE_PATH = '/e2e/mcp/rules';
const MCP_RULE_HEADER = 'x-mcp-rules';
const MCP_RULE_INITIAL_VALUE = 'initial';
const MCP_RULE_UPDATED_NAME = 'MCP updated header';
const MCP_RULE_UPDATED_VALUE = 'updated';
const MCP_BREAKPOINT_PATH = '/e2e/mcp/breakpoints';
const joined = (...parts: readonly string[]): string => parts.join('');
const MCP_BREAKPOINT_TEXTS = {
  continueBody: joined('mcp-continue-', 'original'),
  editBody: joined('mcp-edit-', 'original'),
  editedBody: joined('mcp-edited-', 'body'),
  dropBody: joined('mcp-drop-', 'original'),
  disabledBody: joined('mcp-disabled-', 'pass'),
  enabledBody: joined('mcp-enabled-', 'pending'),
  pendingMessage: joined('mcp-websocket-', 'pending'),
  afterDisableMessage: joined('mcp-websocket-', 'after-disable'),
  rotationBody: joined('mcp-rotation-', 'pending'),
} as const;
const BREAKPOINT_TOOL_NAMES = [
  'breakpoints_list',
  'breakpoints_enable_http',
  'breakpoints_disable_http',
  'breakpoints_enable_websocket',
  'breakpoints_disable_websocket',
  'breakpoints_continue',
  'breakpoints_forward_edited',
  'breakpoints_drop',
  'breakpoints_continue_queue',
  'breakpoints_drop_queue',
  'breakpoints_continue_rule',
] as const;

interface McpWorkflowEvidence {
  readonly endpoint: string;
  readonly originalTokenHash: string;
  readonly regeneratedTokenHash: string;
  readonly protocolVersion: string | null;
  readonly oldTokenStatus: number;
  readonly rulesRevision: number;
  readonly breakpointToolCount: number;
  readonly breakpointDataPlanesVerified: boolean;
}

interface PendingMcpHttpRequest {
  readonly breakpointId: string;
  readonly outcome: Promise<{ result: { statusCode: number | undefined } } | { error: unknown }>;
  readonly row: Locator;
}

/** Connect one real official MCP Client over the product's HTTP listener. */
async function connectClient(
  configuration: McpHostConfiguration,
  protocolVersion: McpProtocolVersion,
): Promise<Client> {
  const client = new Client(
    { name: 'interceptor-e2e-client', version: '1.0.0' },
    {
      supportedProtocolVersions: [protocolVersion],
      versionNegotiation: {
        mode: protocolVersion === '2026-07-28' ? { pin: protocolVersion } : 'legacy',
      },
    },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
    requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
  }));
  return client;
}

/** Create and apply one real Rule through public Renderer controls. */
async function createMcpRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const automationId = await ruleRow.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) {
    throw new Error('MCP Rule row did not expose its Rule ID.');
  }
  const ruleId = automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('MCP initial header');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  const pathCondition = getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path);
  await expect(pathCondition).toBeVisible();
  await pathCondition.press('Enter');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'),
  ).fill(MCP_RULE_PATH);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill(MCP_RULE_HEADER);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill(MCP_RULE_INITIAL_VALUE);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
    .toHaveAttribute('data-revision', '1');
  return ruleId;
}

/** Parse one JSON payload returned by the official MCP Client. */
function mcpToolPayload(result: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new Error('MCP Tool result has no content.');
  }
  const text = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(text) || typeof text.text !== 'string') {
    throw new Error('MCP Tool result has no text payload.');
  }
  const payload: unknown = JSON.parse(text.text);
  if (!isRecord(payload)) throw new Error('MCP Tool payload is not an object.');
  return payload;
}

/** Return whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Replace one Rule name and header value in a detached complete tree. */
function replaceMcpRule(nodes: readonly RuleNode[], ruleId: string): RuleNode[] {
  let replaced = false;
  const visit = (node: RuleNode): RuleNode => {
    if (node.kind === 'folder') return { ...node, children: node.children.map(visit) };
    if (node.id !== ruleId) return node;
    replaced = true;
    return {
      ...node,
      name: MCP_RULE_UPDATED_NAME,
      actions: node.actions.map((action) => (
        action.type === 'header' && action.name === MCP_RULE_HEADER
          ? { ...action, value: MCP_RULE_UPDATED_VALUE }
          : action
      )),
    };
  };
  const next = nodes.map(visit);
  if (!replaced) throw new Error(`MCP Rule ${ruleId} was not returned by rules_get_tree.`);
  return next;
}

/** Send one real request and verify the current MCP-owned Rule effect at origin. */
async function expectMcpRuleEffect(
  desktopApp: LocalElectronApplicationDriver,
  loopbackLab: HttpTrafficRunner,
  stage: string,
  expectedValue: string,
): Promise<void> {
  const requestPath = `${MCP_RULE_PATH}/${stage}`;
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), requestPath))
    .resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(() => loopbackLab.observation(requestPath)?.headers[MCP_RULE_HEADER])
    .toBe(expectedValue);
}

/** Start one real POST that remains suspended by the product Breakpoint Rule. */
async function startPendingMcpRequest(
  page: Page,
  loopbackLab: HttpTrafficRunner,
  proxyPort: number,
  requestPath: string,
  body: string,
): Promise<PendingMcpHttpRequest> {
  const outcome = loopbackLab.requestThroughProxy(proxyPort, requestPath, {
    method: 'POST',
    body,
  }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toHaveAttribute('data-breakpoint-state', 'head');
  const breakpointId = await row.getAttribute('data-breakpoint-id');
  if (!breakpointId) throw new Error('MCP HTTP pending row did not expose breakpoint identity.');
  return { breakpointId, outcome, row };
}

/** Read one Core-owned suffix from a public dynamic automation ID. */
async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Element did not expose automation prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Read one stable error text from an MCP Tool failure payload. */
function mcpToolError(result: unknown): string {
  const error = mcpToolPayload(result).error;
  return typeof error === 'string' ? error : '';
}

/** Require one stale Tool call to settle before any approval can be shown. */
async function settleWithoutApproval<T>(call: Promise<T>, approval: Locator): Promise<T> {
  const outcome = await Promise.race([
    call.then(
      (value) => ({ kind: 'result' as const, value }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    ),
    approval.waitFor({ state: 'visible' }).then(() => ({ kind: 'approval' as const })),
  ]);
  if (outcome.kind === 'approval') {
    throw new Error('Stale Breakpoint requested MCP approval instead of returning an error.');
  }
  if (outcome.kind === 'error') throw outcome.error;
  return outcome.value;
}

/** Close one application generation while preserving lifecycle evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  sensitiveTexts: readonly string[] = [],
): Promise<void> {
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  for (const sensitiveText of sensitiveTexts) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

for (const expectedProtocolVersion of MCP_PROTOCOL_VERSIONS) {
  test(`mcp.desktop.streamable-http (${expectedProtocolVersion}) connects official Clients with stable manual credentials`, async ({
    desktopApp,
    httpTrafficRunner: loopbackLab,
    webSocketTrafficRunner: webSocketLab,
  }, testInfo) => {
    test.setTimeout(180_000);
    desktopApp.page.setDefaultTimeout(15_000);
    testInfo.annotations.push({
      type: 'renderer-workflow',
      description: 'mcp.desktop.streamable-http',
    });

    const clients: Client[] = [];
    let activeApp: LocalElectronApplicationDriver | null = desktopApp;
    let workflowError: unknown;
    let cleanupError: unknown;
    let endpoint = '';
    let originalTokenHash = '';
    let regeneratedTokenHash = '';
    let protocolVersion: string | null = null;
    let oldTokenStatus = -1;
    let rulesRevision = -1;
    let breakpointToolCount = 0;
    let breakpointDataPlanesVerified = false;
    let activeSensitiveTexts: string[] = [];
    const breakpointSensitiveTexts = new Set(Object.values(MCP_BREAKPOINT_TEXTS));
    const registerBreakpointSensitiveText = (
      app: LocalElectronApplicationDriver,
      text: string,
    ): void => {
      breakpointSensitiveTexts.add(text);
      app.registerSensitiveTextForEvidenceAudit(text);
    };
    const allSensitiveTexts = (): readonly string[] => [
      ...activeSensitiveTexts,
      ...breakpointSensitiveTexts,
    ];
    for (const text of breakpointSensitiveTexts) {
      desktopApp.registerSensitiveTextForEvidenceAudit(text);
    }

    try {
      // 准备：从fresh profile进入Agent Settings，MCP必须默认关闭且没有伪造Client。
      // Arrange: enter Agent Settings from a fresh profile; MCP starts off with no fabricated Client.
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/mcp/');
      const facetToggles = desktopApp.page.locator('[data-automation-id^="capture.filter.toggle."]');
      for (let index = 0; index < await facetToggles.count(); index += 1) {
        const toggle = facetToggles.nth(index);
        if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      }
      await openMcpSettings(desktopApp.page);
      const serverRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root);
      await expect(serverRoot).toHaveAttribute('data-server-state', 'disabled');
      await expect(serverRoot).toHaveAttribute('data-client-count', '0');
      await screenshotStep('准备：从fresh profile进入Agent Settings，MCP必须默认关闭且没有伪造Client。 / Arrange: enter Agent Settings from a fresh profile; MCP starts off with no fabricated Client.');

      // 用户操作：显式开启listener并通过产品Dialog创建默认Ask的workflow Client。
      // User actions: explicitly enable the listener and create a default-Ask workflow Client in the product dialog.
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(serverRoot).toHaveAttribute('data-server-state', 'running');
      endpoint = await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint)
        .getAttribute('data-endpoint') ?? '';
      expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      expect(new URL(endpoint).port).not.toBe('8888');
      await screenshotStep('开启MCP Server并读取独立endpoint / Enable MCP Server and inspect its separate endpoint', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable), label: '1' },
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint), label: '2' },
        ],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
      await screenshotStep('打开新增MCP Client窗口 / Open the Add MCP Client dialog');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label).fill('MCP workflow client');
      await screenshotStep('填写Client名称后创建凭据 / Enter the Client label before creating its credential', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label), label: '1' },
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create), label: '2' },
        ],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
      const clientRow = desktopApp.page.locator('[data-automation-id^="mcp.client.row."]');
      await expect(clientRow).toHaveCount(1);
      const clientId = (await clientRow.getAttribute('data-client-id')) ?? '';
      expect(clientId.length).toBeGreaterThan(0);
      await expect(clientRow).toHaveAttribute('data-execution-mode', 'ask');
      await screenshotStep('用户操作：显式开启listener并通过产品Dialog创建默认Ask的workflow Client。 / User actions: explicitly enable the listener and create a default-Ask workflow Client in the product dialog.');

      // 外部交互：复制一次配置，用固定待验协议的官方Client连接同一endpoint。
      // External interaction: copy the configuration once and connect an official Client pinned to the protocol under test.
      await screenshotStep('通过Client行复制正式连接配置 / Copy the formal connection configuration from the Client row', {
        highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)), label: '1' }],
      });
      const original = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
      activeSensitiveTexts = [original.token];
      expect(original.url).toBe(endpoint);
      originalTokenHash = createHash('sha256').update(original.token).digest('hex');
      const client = await connectClient(original, expectedProtocolVersion);
      clients.push(client);
      protocolVersion = client.getNegotiatedProtocolVersion() ?? null;
      expect(protocolVersion).toBe(expectedProtocolVersion);
      const initialToolNames = (await client.listTools()).tools.map((tool) => tool.name);
      expect(initialToolNames).toHaveLength(69);
      expect(initialToolNames.every((name) => (
        /^(capture|rules|composer|breakpoints|diagnostics|settings)_/.test(name)
      ))).toBe(true);
      expect(initialToolNames).toContain('capture_get_proxy_status');
      expect(initialToolNames).toContain('capture_get_transfer_job');
      expect(initialToolNames).toContain('capture_cancel_transfer_job');
      expect(initialToolNames).toContain('capture_export_body');
      expect(initialToolNames).toContain('capture_export_har');
      expect(initialToolNames).toContain('capture_import_har');
      expect(initialToolNames).toContain('capture_export_archive');
      expect(initialToolNames).toContain('capture_import_archive');
      expect(initialToolNames).toContain('settings_set_language');
      expect(initialToolNames).toContain('settings_set_theme');
      expect(initialToolNames).toContain('settings_set_export_privacy_defaults');
      expect(initialToolNames).not.toContain('get_proxy_status');
      await expect(client.callTool({ name: 'get_proxy_status', arguments: {} }))
        .rejects.toThrow('Tool get_proxy_status not found');

      // 业务断言：MCP列关闭项即时不可发现；重新开启后query直接读取真实Core状态。
      // Business assertion: an MCP-column disable hides the Tool; re-enable lets a query read real Core state directly.
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('capture_get_proxy_status');
      await getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status'),
      ).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status')))
        .toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.capabilities))
        .toHaveAttribute('aria-busy', 'false');
      await screenshotStep('只关闭query Tool的MCP权限 / Disable only the query Tool’s MCP permission', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status')), label: '1' },
          { target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch('capture_get_proxy_status')), label: '2' },
        ],
      });
      const filteredClient = await connectClient(original, expectedProtocolVersion);
      clients.push(filteredClient);
      expect((await filteredClient.listTools()).tools.map((tool) => tool.name))
        .not.toContain('capture_get_proxy_status');
      await getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status'),
      ).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status')))
        .toHaveAttribute('aria-checked', 'true');
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.capabilities))
        .toHaveAttribute('aria-busy', 'false');
      await screenshotStep('恢复MCP权限后再查询 / Restore MCP permission before querying again');
      const queryClient = await connectClient(original, expectedProtocolVersion);
      clients.push(queryClient);
      await expect(queryClient.callTool({ name: 'capture_get_proxy_status', arguments: {} }))
        .resolves.not.toMatchObject({ isError: true });
      await screenshotStep('业务断言：MCP列关闭项即时不可发现；重新开启后query直接读取真实Core状态。 / Business assertion: an MCP-column disable hides the Tool; re-enable lets a query read real Core state directly.');

      // 用户操作：单次取消与Host断开分别取消Ask，不能用关闭Client代替取消一个调用。
      // User actions: cancel one call and disconnect the Host separately; closing the Client cannot stand in for per-call cancellation.
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await startRecording(desktopApp);
      const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
      const abortController = new AbortController();
      const cancelledCall = queryClient.callTool(
        { name: 'capture_stop_recording', arguments: {} },
        { signal: abortController.signal },
      );
      const cancelledOutcome = expect(cancelledCall).rejects.toThrow();
      await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
      await screenshotStep('Host发起的暂停请求等待MCP审批 / A Host pause request waits for MCP approval');
      abortController.abort(new Error('The Host cancelled this Tool call.'));
      await cancelledOutcome;
      await expect(approval).toHaveCount(0);
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
        .toHaveAttribute('aria-pressed', 'true');
      await screenshotStep('Host取消单次调用后Recording不变 / Recording remains enabled after the Host cancels one call');
      await expect(queryClient.callTool({ name: 'capture_get_proxy_status', arguments: {} }))
        .resolves.not.toMatchObject({ isError: true });

      const disconnectedCall = queryClient.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
      await queryClient.close();
      clients.splice(clients.indexOf(queryClient), 1);
      await Promise.allSettled([disconnectedCall]);
      await expect(approval).toHaveCount(0);
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
        .toHaveAttribute('aria-pressed', 'true');

      const actionClient = await connectClient(original, expectedProtocolVersion);
      clients.push(actionClient);
      const deniedCall = actionClient.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
      await screenshotStep('核对MCP Tool与影响后选择Deny或Allow / Review the MCP Tool and effect before Deny or Allow', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny), label: '1' },
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow), label: '2' },
        ],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
      await expect(deniedCall).resolves.toMatchObject({ isError: true });
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
        .toHaveAttribute('aria-pressed', 'true');
      const allowedCall = actionClient.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
      await screenshotStep('新的MCP暂停调用需要本次Allow / The new MCP pause call needs its own Allow', {
        highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow), label: '1' }],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
      await expect(allowedCall).resolves.not.toMatchObject({ isError: true });
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
        .toHaveAttribute('aria-pressed', 'false');
      await screenshotStep('允许MCP暂停后核对Capture状态 / Verify Capture is paused after MCP approval', {
        highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle), label: '1' }],
      });
      await resumeRecording(desktopApp);
      await openMcpSettings(desktopApp.page);
      await automaticallyExecuteMcpClientTools(desktopApp.page, clientId);
      await expect(clientRow).toHaveAttribute('data-execution-mode', 'auto');
      await screenshotStep('单独设置当前MCP Client的Auto / Set Auto for this MCP Client independently', {
        highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(clientId)), label: '1' }],
      });
      await actionClient.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
        .toHaveAttribute('aria-pressed', 'false');
      await resumeRecording(desktopApp);
      await screenshotStep('用户操作：单次取消与Host断开分别取消Ask，不能用关闭Client代替取消一个调用。 / User actions: cancel one call and disconnect the Host separately; closing the Client cannot stand in for per-call cancellation.');

      // 外部交互：产品UI自产Rule后，官方Client在Auto下读取并替换完整树；Renderer与真实origin同步更新。
      // External interaction: after product UI creates a Rule, the official Client reads and replaces the full tree in Auto; Renderer and origin update.
      const mcpRuleId = await createMcpRule(desktopApp.page);
      await expectMcpRuleEffect(desktopApp, loopbackLab, 'initial', MCP_RULE_INITIAL_VALUE);
      const getRulesResult = await actionClient.callTool({ name: 'rules_get_tree', arguments: {} });
      const getRulesPayload = mcpToolPayload(getRulesResult);
      const ruleSet = getRulesPayload.ruleSet;
      if (!isRecord(ruleSet) || typeof ruleSet.revision !== 'number' || !Array.isArray(ruleSet.nodes)) {
        throw new Error('MCP rules_get_tree did not return a complete RuleSet.');
      }
      const currentRuleNodes = ruleSet.nodes as RuleNode[];
      expect(currentRuleNodes).toHaveLength(1);
      expect(currentRuleNodes).toMatchObject([{
        kind: 'rule',
        id: mcpRuleId,
        name: 'MCP initial header',
        enabled: true,
      }]);
      const currentRule = currentRuleNodes[0];
      if (currentRule?.kind !== 'rule') throw new Error('MCP rules_get_tree did not return the UI-created Rule.');
      expect(Number.isInteger(currentRule.priority)).toBe(true);
      expect(currentRule.matchers).toEqual([
        { type: 'host', value: '127.0.0.1', mode: 'contains' },
        { type: 'path', value: MCP_RULE_PATH, mode: 'contains' },
      ]);
      expect(currentRule.actions).toEqual([{
        type: 'header',
        phase: 'request',
        op: 'set',
        name: MCP_RULE_HEADER,
        value: MCP_RULE_INITIAL_VALUE,
      }]);
      const nextRuleNodes = replaceMcpRule(currentRuleNodes, mcpRuleId);
      const applyRulesResult = await actionClient.callTool({
        name: 'rules_replace_tree',
        arguments: { baseRevision: ruleSet.revision, nodes: nextRuleNodes },
      });
      expect(applyRulesResult).not.toMatchObject({ isError: true });
      rulesRevision = ruleSet.revision + 1;
      expect(mcpToolPayload(applyRulesResult)).toEqual({ revision: rulesRevision });
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
        .toHaveAttribute('data-revision', String(rulesRevision));
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName))
        .toHaveValue(MCP_RULE_UPDATED_NAME);
      await expect(getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value'),
      )).toHaveValue(MCP_RULE_UPDATED_VALUE);
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state))
        .toHaveAttribute('data-state', 'applied');
      await screenshotStep('MCP写入后Rules显示已应用的新值 / Rules shows the applied values written through MCP', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName), label: '1' },
          { target: getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')), label: '2' },
        ],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).fill('MCP local draft');
      await getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value'))
        .fill('unapplied-local-value');
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state))
        .toHaveAttribute('data-state', 'dirty');
      await screenshotStep('编辑本地草稿但不Apply / Edit the local draft without Apply', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName), label: '1' },
          { target: getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')), label: '2' },
        ],
      });
      const concurrentWrite = await actionClient.callTool({
        name: 'rules_replace_tree', arguments: { baseRevision: rulesRevision, nodes: nextRuleNodes },
      });
      rulesRevision += 1;
      expect(mcpToolPayload(concurrentWrite)).toEqual({ revision: rulesRevision });
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state))
        .toHaveAttribute('data-state', 'conflict');
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName)).toHaveValue('MCP local draft');
      const conflictPath = `${MCP_RULE_PATH}/conflict`;
      expect((await loopbackLab.requestThroughProxy(desktopApp.capturePort(), conflictPath)).statusCode).toBe(200);
      expect(loopbackLab.observation(conflictPath)?.headers[MCP_RULE_HEADER]).toBe(MCP_RULE_UPDATED_VALUE);
      await screenshotStep('第二写入者生效时保留未Apply的本地草稿 / Retain the unapplied local draft while the second writer takes effect', {
        highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName), label: '1' }],
      });
      const reload = getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).locator('..')
        .locator(`[data-automation-id="${AUTOMATION_IDS.rules.reload}"]`);
      await screenshotStep('确认放弃本地草稿前找到Reload / Locate Reload before discarding the local draft', {
        highlights: [{ target: reload, label: '1' }],
      });
      await reload.click();
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName)).toHaveValue(MCP_RULE_UPDATED_NAME);
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')))
        .toHaveValue(MCP_RULE_UPDATED_VALUE);
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state))
        .toHaveAttribute('data-state', 'applied');
      await screenshotStep('显式Reload后采用Core最新版本 / Explicitly Reload the latest Core revision');
      await expectMcpRuleEffect(desktopApp, loopbackLab, 'updated', MCP_RULE_UPDATED_VALUE);
      await screenshotStep('外部交互：产品UI自产Rule后，官方Client在Auto下读取并替换完整树；Renderer与真实origin同步更新。 / External interaction: after product UI creates a Rule, the official Client reads and replaces the full tree in Auto; Renderer and origin update.');

      // 本地合并：从Reload的最新版本重新编辑并Save，使用新请求验证后恢复原演示值。
      // Local merge: edit and save the reloaded revision, verify a new request, then restore the original example values.
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).fill('MCP merged header');
      await getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')).fill('merged');
      await screenshotStep('在最新版本上重新编辑本地合并值 / Edit the local merged values on the latest revision', {
        highlights: [
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName), label: '1' },
          { target: getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')), label: '2' },
          { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.apply), label: '3' },
        ],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.apply).click();
      rulesRevision += 1;
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
        .toHaveAttribute('data-revision', String(rulesRevision));
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
      await screenshotStep('本地合并已经Save并成为已应用版本 / The local merge is saved and applied');
      await expectMcpRuleEffect(desktopApp, loopbackLab, 'merged', 'merged');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      const mergedRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: `${MCP_RULE_PATH}/merged` }).last();
      await expect(mergedRow).toBeVisible();
      if (await mergedRow.getAttribute('aria-pressed') !== 'true') await mergedRow.click();
      await expect(mergedRow).toHaveAttribute('aria-pressed', 'true');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      const mergedHeadersToggle = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.requestHeaders);
      if (await mergedHeadersToggle.getAttribute('aria-expanded') !== 'true') await mergedHeadersToggle.click();
      await expect(mergedHeadersToggle).toHaveAttribute('aria-expanded', 'true');
      const mergedHeaders = mergedHeadersToggle.locator('..');
      const mergedHeader = mergedHeaders.getByText(MCP_RULE_HEADER, { exact: true }).locator('..');
      await expect(mergedHeader).toContainText('merged');
      await screenshotStep('新请求带有本地合并后的Header / A new request carries the locally merged Header', {
        highlights: [{ target: mergedHeader, label: '1' }, { target: mergedRow, label: '2' }],
      });
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).fill(MCP_RULE_UPDATED_NAME);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value')).fill(MCP_RULE_UPDATED_VALUE);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.apply).click();
      rulesRevision += 1;
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
        .toHaveAttribute('data-revision', String(rulesRevision));
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');

      // Breakpoints准备与查询：恢复Ask，经真实Rules UI创建POST断点，并让官方Client读取同一pending identity。
      // Breakpoints arrange and query: restore Ask, create a POST Breakpoint through Rules UI, and let the official Client read the same pending identity.
      await openMcpSettings(desktopApp.page);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAsk(clientId)).click();
      await expect(serverRoot).toHaveAttribute('aria-busy', 'false');
      await expect(clientRow).toHaveAttribute('data-execution-mode', 'ask');
      await desktopApp.stopTrace(testInfo);
      const breakpointRuleId = await createRequestBreakpointRule(
        desktopApp.page,
        'MCP Breakpoints',
        'POST',
      );
      registerBreakpointSensitiveText(desktopApp, breakpointRuleId);
      rulesRevision += 1;
      const listedToolNames = (await actionClient.listTools()).tools.map((tool) => tool.name);
      const breakpointToolNames = listedToolNames.filter((name) => (
        BREAKPOINT_TOOL_NAMES.includes(name as typeof BREAKPOINT_TOOL_NAMES[number])
      ));
      expect(breakpointToolNames).toEqual(BREAKPOINT_TOOL_NAMES);
      breakpointToolCount = breakpointToolNames.length;

      const firstPath = `${MCP_BREAKPOINT_PATH}/continue`;
      const firstPending = await startPendingMcpRequest(
        desktopApp.page,
        loopbackLab,
        desktopApp.capturePort(),
        firstPath,
        MCP_BREAKPOINT_TEXTS.continueBody,
      );
      registerBreakpointSensitiveText(desktopApp, firstPending.breakpointId);
      const listResult = await actionClient.callTool({
        name: 'breakpoints_list',
        arguments: {},
      });
      expect(listResult).not.toMatchObject({ isError: true });
      const listedBreakpoints = mcpToolPayload(listResult).breakpoints;
      expect(Array.isArray(listedBreakpoints) && listedBreakpoints.some((entry) => (
        isRecord(entry)
        && entry.id === firstPending.breakpointId
        && entry.phase === 'request'
      ))).toBe(true);
      await expect(approval).toHaveCount(0);

      // Ask Continue：Deny不解除客户端，Allow只继续指定ID；同一旧ID随后在审批前被拒绝。
      // Ask Continue: Deny leaves the client suspended, Allow continues only the selected ID, and the stale ID is rejected before approval.
      const deniedContinue = actionClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: firstPending.breakpointId },
      });
      await expect(approval).toHaveAttribute('data-tool-name', 'breakpoints_continue');
      await expect(approval).toContainText(firstPending.breakpointId);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
      await expect(deniedContinue).resolves.toMatchObject({ isError: true });
      await expect(firstPending.row).toHaveAttribute(
        'data-breakpoint-id',
        firstPending.breakpointId,
      );
      expect(loopbackLab.observation(firstPath)).toBeUndefined();

      const allowedContinue = actionClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: firstPending.breakpointId },
      });
      await expect(approval).toHaveAttribute('data-tool-name', 'breakpoints_continue');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
      await expect(allowedContinue).resolves.not.toMatchObject({ isError: true });
      await expect(firstPending.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });

      const staleContinue = await settleWithoutApproval(
        actionClient.callTool({
          name: 'breakpoints_continue',
          arguments: { breakpointId: firstPending.breakpointId },
        }),
        approval,
      );
      expect(staleContinue).toMatchObject({ isError: true });
      expect(mcpToolError(staleContinue)).toContain('is no longer pending');
      await expect(approval).toHaveCount(0);
      await screenshotStep('Ask Continue：Deny不解除客户端，Allow只继续指定ID；同一旧ID随后在审批前被拒绝。 / Ask Continue: Deny leaves the client suspended, Allow continues only the selected ID, and the stale ID is rejected before approval.');

      // Ask Edit：批准后才修改method、URL与正文，真实origin只观察替换后的目标和文本。
      // Ask Edit: only approval changes method, URL, and body; the real origin observes only the replacement target and text.
      const editSourcePath = `${MCP_BREAKPOINT_PATH}/edit-source`;
      const editDestinationPath = `${MCP_BREAKPOINT_PATH}/edit-destination`;
      const editPending = await startPendingMcpRequest(
        desktopApp.page,
        loopbackLab,
        desktopApp.capturePort(),
        editSourcePath,
        MCP_BREAKPOINT_TEXTS.editBody,
      );
      registerBreakpointSensitiveText(desktopApp, editPending.breakpointId);
      const editDestinationUrl = loopbackLab.url(editDestinationPath);
      registerBreakpointSensitiveText(desktopApp, editDestinationUrl);
      const editCall = actionClient.callTool({
        name: 'breakpoints_forward_edited',
        arguments: {
          breakpointId: editPending.breakpointId,
          method: 'PUT',
          url: editDestinationUrl,
          body: MCP_BREAKPOINT_TEXTS.editedBody,
        },
      });
      await expect(approval).toHaveAttribute('data-tool-name', 'breakpoints_forward_edited');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
      await expect(editCall).resolves.not.toMatchObject({ isError: true });
      await expect(editPending.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
      expect(loopbackLab.observation(editSourcePath)).toBeUndefined();
      await expect.poll(() => loopbackLab.observation(editDestinationPath)?.method).toBe('PUT');
      await expect.poll(() => loopbackLab.observation(editDestinationPath)?.body.toString('utf8'))
        .toBe(MCP_BREAKPOINT_TEXTS.editedBody);
      await screenshotStep('Ask Edit：批准后才修改method、URL与正文，真实origin只观察替换后的目标和文本。 / Ask Edit: only approval changes method, URL, and body; the real origin observes only the replacement target and text.');

      // Auto：Drop不显示审批且不抵达origin；HTTP disable/enable决定后续真实POST是否进入pending。
      // Auto: Drop shows no approval and never reaches origin; HTTP disable/enable controls whether later real POSTs become pending.
      await openMcpSettings(desktopApp.page);
      await automaticallyExecuteMcpClientTools(desktopApp.page, clientId);
      await expect(clientRow).toHaveAttribute('data-execution-mode', 'auto');
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      const dropPath = `${MCP_BREAKPOINT_PATH}/drop`;
      const dropPending = await startPendingMcpRequest(
        desktopApp.page,
        loopbackLab,
        desktopApp.capturePort(),
        dropPath,
        MCP_BREAKPOINT_TEXTS.dropBody,
      );
      registerBreakpointSensitiveText(desktopApp, dropPending.breakpointId);
      const dropResult = await actionClient.callTool({
        name: 'breakpoints_drop',
        arguments: { breakpointId: dropPending.breakpointId },
      });
      expect(dropResult).not.toMatchObject({ isError: true });
      await expect(dropPending.outcome).resolves.toHaveProperty('error');
      expect(loopbackLab.observation(dropPath)).toBeUndefined();
      await expect(approval).toHaveCount(0);

      await expect(actionClient.callTool({
        name: 'breakpoints_disable_http',
        arguments: {},
      })).resolves.not.toMatchObject({ isError: true });
      const disabledPath = `${MCP_BREAKPOINT_PATH}/disabled`;
      await expect(loopbackLab.requestThroughProxy(
        desktopApp.capturePort(),
        disabledPath,
        { method: 'POST', body: MCP_BREAKPOINT_TEXTS.disabledBody },
      )).resolves.toMatchObject({ statusCode: 200 });
      await expect.poll(() => loopbackLab.observation(disabledPath)?.body.toString('utf8'))
        .toBe(MCP_BREAKPOINT_TEXTS.disabledBody);

      await expect(actionClient.callTool({
        name: 'breakpoints_enable_http',
        arguments: {},
      })).resolves.not.toMatchObject({ isError: true });
      const enabledPath = `${MCP_BREAKPOINT_PATH}/enabled`;
      const enabledPending = await startPendingMcpRequest(
        desktopApp.page,
        loopbackLab,
        desktopApp.capturePort(),
        enabledPath,
        MCP_BREAKPOINT_TEXTS.enabledBody,
      );
      registerBreakpointSensitiveText(desktopApp, enabledPending.breakpointId);
      await expect(actionClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: enabledPending.breakpointId },
      })).resolves.not.toMatchObject({ isError: true });
      await expect(enabledPending.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
      await expect(approval).toHaveCount(0);
      await screenshotStep('Auto：Drop不显示审批且不抵达origin；HTTP disable/enable决定后续真实POST是否进入pending。 / Auto: Drop shows no approval and never reaches origin; HTTP disable/enable controls whether later real POSTs become pending.');

      // WebSocket数据面：真实连接提供exchangeId，Tool启用后frame进入同一pending列表，Continue与Disable作用于真实对端。
      // WebSocket data plane: a real connection provides exchangeId; Tool enable queues a frame in the same pending list, and Continue/Disable affect the real peer.
      const webSocketPath = `${MCP_BREAKPOINT_PATH}/websocket`;
      const webSocketClient = await webSocketLab.openThroughProxy(
        desktopApp.capturePort(),
        webSocketPath,
      );
      const webSocketRow = getByAutomationIdPrefix(
        desktopApp.page,
        AUTOMATION_ID_PREFIXES.captureRequestRow,
      ).filter({ hasText: webSocketPath }).last();
      await expect(webSocketRow).toBeVisible();
      const exchangeId = await automationSuffix(
        webSocketRow,
        AUTOMATION_ID_PREFIXES.captureRequestRow,
      );
      registerBreakpointSensitiveText(desktopApp, exchangeId);
      await expect(actionClient.callTool({
        name: 'breakpoints_enable_websocket',
        arguments: {
          exchangeId,
          direction: 'client-to-server',
          frames: ['message'],
        },
      })).resolves.not.toMatchObject({ isError: true });
      await webSocketRow.click();
      await getByAutomationId(
        desktopApp.page,
        AUTOMATION_IDS.capture.inspector.tab.messages,
      ).click();
      const pendingMessage = MCP_BREAKPOINT_TEXTS.pendingMessage;
      webSocketClient.sendText(pendingMessage);
      const pendingFrame = getByAutomationIdPrefix(
        desktopApp.page,
        AUTOMATION_ID_PREFIXES.breakpointPending,
      ).filter({ hasText: pendingMessage });
      await expect(pendingFrame).toHaveCount(1);
      const frameBreakpointId = await pendingFrame.getAttribute('data-breakpoint-id');
      if (!frameBreakpointId) throw new Error('MCP WebSocket pending did not expose breakpoint identity.');
      registerBreakpointSensitiveText(desktopApp, frameBreakpointId);
      const webSocketListResult = await actionClient.callTool({
        name: 'breakpoints_list',
        arguments: {},
      });
      const webSocketBreakpoints = mcpToolPayload(webSocketListResult).breakpoints;
      expect(Array.isArray(webSocketBreakpoints) && webSocketBreakpoints.some((entry) => (
        isRecord(entry)
        && entry.id === frameBreakpointId
        && entry.phase === 'websocket'
      ))).toBe(true);
      await expect(actionClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: frameBreakpointId },
      })).resolves.not.toMatchObject({ isError: true });
      await expect.poll(() => webSocketLab.hasMessage(pendingMessage)).toBe(true);
      await webSocketClient.waitForText(pendingMessage);

      await expect(actionClient.callTool({
        name: 'breakpoints_disable_websocket',
        arguments: {},
      })).resolves.not.toMatchObject({ isError: true });
      const afterDisableMessage = MCP_BREAKPOINT_TEXTS.afterDisableMessage;
      webSocketClient.sendText(afterDisableMessage);
      await expect.poll(() => webSocketLab.hasMessage(afterDisableMessage)).toBe(true);
      await webSocketClient.waitForText(afterDisableMessage);
      await expect(getByAutomationIdPrefix(
        desktopApp.page,
        AUTOMATION_ID_PREFIXES.breakpointPending,
      ).filter({ hasText: afterDisableMessage })).toHaveCount(0);
      await expect(approval).toHaveCount(0);
      await screenshotStep('WebSocket数据面：真实连接提供exchangeId，Tool启用后frame进入同一pending列表，Continue与Disable作用于真实对端。 / WebSocket data plane: a real connection provides exchangeId; Tool enable queues a frame in the same pending list, and Continue/Disable affect the real peer.');

      // Settings撤权：十一项MCP开关关闭后立即从tools/list消失，逐项猜测调用均为unknown tool且不触发审批。
      // Settings revocation: all eleven disappear immediately from tools/list; every guessed call is unknown and never opens approval.
      await openMcpSettings(desktopApp.page);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('breakpoints_');
      for (const toolName of BREAKPOINT_TOOL_NAMES) {
        await getByAutomationId(
          desktopApp.page,
          AutomationIdFactory.agentToolMcpSwitch(toolName),
        ).click();
        await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(toolName)))
          .toHaveAttribute('aria-checked', 'false');
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.capabilities))
          .toHaveAttribute('aria-busy', 'false');
      }
      const namesAfterDisable = (await actionClient.listTools()).tools.map((tool) => tool.name);
      expect(namesAfterDisable.filter((name) => (
        BREAKPOINT_TOOL_NAMES.includes(name as typeof BREAKPOINT_TOOL_NAMES[number])
      ))).toEqual([]);
      for (const toolName of BREAKPOINT_TOOL_NAMES) {
        const args: Record<string, unknown> = toolName === 'breakpoints_enable_websocket'
          ? { exchangeId, frames: ['message'] }
          : toolName === 'breakpoints_continue' || toolName === 'breakpoints_drop'
            ? { breakpointId: firstPending.breakpointId }
            : toolName === 'breakpoints_forward_edited'
              ? { breakpointId: firstPending.breakpointId, body: '' }
              : {};
        await expect(actionClient.callTool({
          name: toolName,
          arguments: args,
        })).rejects.toThrow(`Tool ${toolName} not found`);
      }
      await expect(approval).toHaveCount(0);
      for (const toolName of BREAKPOINT_TOOL_NAMES) {
        await getByAutomationId(
          desktopApp.page,
          AutomationIdFactory.agentToolMcpSwitch(toolName),
        ).click();
        await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(toolName)))
          .toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.capabilities))
          .toHaveAttribute('aria-busy', 'false');
      }
      await screenshotStep('Settings撤权：十一项MCP开关关闭后立即从tools/list消失，逐项猜测调用均为unknown tool且不触发审批。 / Settings revocation: all eleven disappear immediately from tools/list; every guessed call is unknown and never opens approval.');

      // 重启：关闭所有外部Client与第一代App，同一profile必须复用URL、Token和Auto模式。
      // Restart: close external Clients and generation one; the same profile reuses URL, token, and Auto mode.
      await Promise.all(clients.splice(0).map((client) => client.close()));
      await desktopApp.startTrace(testInfo);
      await closeGeneration(desktopApp, testInfo, allSensitiveTexts());
      activeApp = null;
      activeSensitiveTexts = [];
      const relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
        userDataDirectory: desktopApp.userDataDirectory,
        evidencePrefix: 'relaunch',
      });
      activeApp = relaunchedApp;
      for (const text of breakpointSensitiveTexts) {
        relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
      }
      await relaunchedApp.waitUntilReady();
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/mcp/');
      const relaunchedFacetToggles = relaunchedApp.page.locator('[data-automation-id^="capture.filter.toggle."]');
      for (let index = 0; index < await relaunchedFacetToggles.count(); index += 1) {
        const toggle = relaunchedFacetToggles.nth(index);
        if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      }
      await openMcpSettings(relaunchedApp.page);
      const relaunchedServer = getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.root);
      await expect(relaunchedServer).toHaveAttribute('data-server-state', 'running');
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.endpoint))
        .toHaveAttribute('data-endpoint', endpoint);
      const relaunchedRow = getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.mcpClientRow(clientId),
      );
      await expect(relaunchedRow).toHaveAttribute('data-execution-mode', 'auto');
      await screenshotStep('真实重启后保留MCP endpoint与Client模式 / Retain the MCP endpoint and Client mode after a real restart', {
        highlights: [{ target: relaunchedRow, label: '1' }],
      });
      await relaunchedApp.stopTrace(testInfo);
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.status.revision))
        .toHaveAttribute('data-revision', String(rulesRevision));
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.editorName))
        .toHaveValue(MCP_RULE_UPDATED_NAME);
      await expect(getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.ruleActionField(mcpRuleId, 0, 'value'),
      )).toHaveValue(MCP_RULE_UPDATED_VALUE);
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.status.state))
        .toHaveAttribute('data-state', 'applied');
      await expectMcpRuleEffect(relaunchedApp, loopbackLab, 'relaunch', MCP_RULE_UPDATED_VALUE);
      await openMcpSettings(relaunchedApp.page);
      relaunchedApp.registerSensitiveTextForEvidenceAudit(original.token);
      activeSensitiveTexts = [original.token];
      const restoredClient = await connectClient(original, expectedProtocolVersion);
      clients.push(restoredClient);
      await expect(restoredClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });

      // Client生命周期：旧Client在Ask审批中断开只取消自己的调用，同一Core pending保持原ID且不抵达origin。
      // Client lifecycle: disconnecting the old Client during Ask cancels only its call; the same Core pending keeps its ID and never reaches origin.
      await getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.mcpClientAsk(clientId),
      ).click();
      await expect(relaunchedRow).toHaveAttribute('data-execution-mode', 'ask');
      await expect(relaunchedServer).toHaveAttribute('aria-busy', 'false');
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      const rotationPath = `${MCP_BREAKPOINT_PATH}/credential-rotation`;
      const rotationPending = await startPendingMcpRequest(
        relaunchedApp.page,
        loopbackLab,
        relaunchedApp.capturePort(),
        rotationPath,
        MCP_BREAKPOINT_TEXTS.rotationBody,
      );
      registerBreakpointSensitiveText(relaunchedApp, rotationPending.breakpointId);
      const cancelledContinue = restoredClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: rotationPending.breakpointId },
      });
      const relaunchedApproval = getByAutomationId(
        relaunchedApp.page,
        AUTOMATION_IDS.mcp.approval.root,
      );
      await expect(relaunchedApproval).toHaveAttribute('data-tool-name', 'breakpoints_continue');
      await restoredClient.close();
      clients.splice(clients.indexOf(restoredClient), 1);
      await Promise.allSettled([cancelledContinue]);
      await expect(relaunchedApproval).toHaveCount(0);
      await expect(rotationPending.row).toHaveAttribute(
        'data-breakpoint-id',
        rotationPending.breakpointId,
      );
      expect(loopbackLab.observation(rotationPath)).toBeUndefined();
      await screenshotStep('Client生命周期：旧Client在Ask审批中断开只取消自己的调用，同一Core pending保持原ID且不抵达origin。 / Client lifecycle: disconnecting the old Client during Ask cancels only its call; the same Core pending keeps its ID and never reaches origin.');

      // 凭据轮换：显式Regenerate使旧Token失效，但仍不解除业务pending；新配置保持同一URL。
      // Credential rotation: explicit Regenerate invalidates the old token without resolving business pending; the new config keeps the same URL.
      await openMcpSettings(relaunchedApp.page);
      await getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.mcpClientRegenerate(clientId),
      ).click();
      await screenshotStep('轮换MCP凭据前核对确认窗口 / Review the confirmation before rotating MCP credentials', {
        highlights: [
          { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.regenerateCancel), label: '1' },
          { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.regenerateConfirm), label: '2' },
        ],
      });
      await getByAutomationId(
        relaunchedApp.page,
        AUTOMATION_IDS.mcp.client.regenerateConfirm,
      ).click();
      oldTokenStatus = (await fetch(original.url, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${original.token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })).status;
      expect(oldTokenStatus).toBe(401);
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(rotationPending.row).toHaveAttribute(
        'data-breakpoint-id',
        rotationPending.breakpointId,
      );
      expect(loopbackLab.observation(rotationPath)).toBeUndefined();
      await openMcpSettings(relaunchedApp.page);
      await screenshotStep('轮换后重新复制配置更新Host / Copy the rotated configuration to update the Host', {
        highlights: [{ target: getByAutomationId(relaunchedApp.page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)), label: '1' }],
      });
      const regenerated = await copyMcpClientConfiguration(relaunchedApp, testInfo, clientId);
      activeSensitiveTexts = [original.token, regenerated.token];
      regeneratedTokenHash = createHash('sha256').update(regenerated.token).digest('hex');
      expect(regenerated.url).toBe(endpoint);
      expect(regeneratedTokenHash).not.toBe(originalTokenHash);
      const regeneratedClient = await connectClient(regenerated, expectedProtocolVersion);
      clients.push(regeneratedClient);
      await expect(regeneratedClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
      await relaunchedApp.stopTrace(testInfo);

      // 恢复与清理：新Client在Ask下显式Allow同一ID，再删除测试Breakpoint Rule并保留MCP更新的Rule。
      // Recovery and cleanup: the new Client explicitly Allows the same ID in Ask, then removes the test Breakpoint Rule while preserving the MCP-updated Rule.
      const recoveredContinue = regeneratedClient.callTool({
        name: 'breakpoints_continue',
        arguments: { breakpointId: rotationPending.breakpointId },
      });
      await expect(relaunchedApproval).toHaveAttribute('data-tool-name', 'breakpoints_continue');
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
      await expect(recoveredContinue).resolves.not.toMatchObject({ isError: true });
      await expect(rotationPending.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
      const breakpointRuleRow = relaunchedApp.page.locator(
        `[data-automation-id="${AUTOMATION_ID_PREFIXES.ruleRow}${breakpointRuleId}"]`,
      );
      await breakpointRuleRow.click({ button: 'right' });
      await getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.ruleNodeAction(breakpointRuleId, 'delete'),
      ).click();
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.apply).click();
      rulesRevision += 1;
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.status.revision))
        .toHaveAttribute('data-revision', String(rulesRevision));
      await expect(relaunchedApp.page.locator(
        `[data-automation-id="${AUTOMATION_ID_PREFIXES.ruleRow}${mcpRuleId}"]`,
      )).toBeVisible();
      breakpointDataPlanesVerified = true;
      await openMcpSettings(relaunchedApp.page);
      await relaunchedApp.startTrace(testInfo);
      await screenshotStep('恢复与清理：新Client在Ask下显式Allow同一ID，再删除测试Breakpoint Rule并保留MCP更新的Rule。 / Recovery and cleanup: the new Client explicitly Allows the same ID in Ask, then removes the test Breakpoint Rule while preserving the MCP-updated Rule.');

      // 清理与证据：恢复Ask与Recording，撤销Client并关闭MCP；只保存Token hash。
      // Cleanup and evidence: restore Ask and Recording, revoke the Client, disable MCP, and save token hashes only.
      await getByAutomationId(relaunchedApp.page, AutomationIdFactory.mcpClientAsk(clientId)).click();
      await expect(relaunchedServer).toHaveAttribute('aria-busy', 'false');
      const inFlightPath = '/e2e/mcp/composer-revocation';
      const releaseResponse = loopbackLab.holdResponse(inFlightPath);
      const inFlight = regeneratedClient.callTool({
        name: 'composer_send_request',
        arguments: { method: 'GET', url: loopbackLab.url(inFlightPath), headers: [], protocol: 'http/1.1' },
      }).then(result => ({ result }), (error: unknown) => ({ error }));
      try {
        await expect(relaunchedApproval).toHaveAttribute('data-tool-name', 'composer_send_request');
        await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
        await expect.poll(() => loopbackLab.observation(inFlightPath)?.method).toBe('GET');
        expect(loopbackLab.responseWasAborted(inFlightPath)).toBe(false);
        await getByAutomationId(relaunchedApp.page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
        await screenshotStep('撤销Client前核对影响与确认 / Review the effect before revoking this Client', {
          highlights: [
            { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.revokeCancel), label: '1' },
            { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.revokeConfirm), label: '2' },
          ],
        });
        await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
        await expect.poll(() => loopbackLab.responseWasAborted(inFlightPath)).toBe(true);
        const outcome = await inFlight;
        if ('result' in outcome) expect(outcome.result).toMatchObject({ isError: true });
        else expect(outcome.error).toBeDefined();
        await expect(regeneratedClient.callTool({ name: 'capture_get_proxy_status', arguments: {} })).rejects.toThrow();
        await screenshotStep('撤销Client同时取消真实在途Composer请求 / Revoking the Client cancels its actual in-flight Composer request');
      } finally {
        if (await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.approval.deny).isVisible()
          && await relaunchedApproval.getAttribute('data-tool-name') === 'composer_send_request') {
          await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
        }
        releaseResponse();
        await inFlight;
      }
      await regeneratedClient.close();
      clients.splice(clients.indexOf(regeneratedClient), 1);
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(relaunchedServer).toHaveAttribute('data-server-state', 'disabled');
      await screenshotStep('关闭MCP Server并确认停止监听 / Disable MCP Server and verify its stopped state', {
        highlights: [{ target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.enable), label: '1' }],
      });
      await expect.poll(async () => {
        try {
          await fetch(endpoint);
          return 'listening';
        } catch {
          return 'released';
        }
      }).toBe('released');
      await resumeRecording(relaunchedApp);
      const evidence: McpWorkflowEvidence = {
        endpoint,
        originalTokenHash,
        regeneratedTokenHash,
        protocolVersion,
        oldTokenStatus,
        rulesRevision,
        breakpointToolCount,
        breakpointDataPlanesVerified,
      };
      const evidencePath = testInfo.outputPath('mcp-streamable-http.json');
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
      await testInfo.attach('mcp-streamable-http.json', {
        path: evidencePath,
        contentType: 'application/json',
      });
      await screenshotStep('清理与证据：恢复Ask与Recording，撤销Client并关闭MCP；只保存Token hash。 / Cleanup and evidence: restore Ask and Recording, revoke the Client, disable MCP, and save token hashes only.');
    } catch (error) {
      workflowError = error;
    } finally {
      await Promise.allSettled(clients.splice(0).map((client) => client.close()));
      if (activeApp !== null) {
        try {
          await closeGeneration(activeApp, testInfo, allSensitiveTexts());
        } catch (error) {
          cleanupError = error;
          await activeApp.forceCleanup().catch(() => undefined);
        }
      }
    }

    if (workflowError && cleanupError) {
      throw new AggregateError([workflowError, cleanupError], 'MCP workflow and cleanup failed.');
    }
    if (workflowError) throw workflowError;
    if (cleanupError) throw cleanupError;
  });
}
