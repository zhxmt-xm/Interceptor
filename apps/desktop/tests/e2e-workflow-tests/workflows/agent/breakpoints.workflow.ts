import { writeFile } from 'node:fs/promises';

import type { Locator, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { createRequestBreakpointRule } from '../../fixtures/breakpoint-workflow';
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { LoopbackLab } from '../../fixtures/loopback-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

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

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const prompts = {
  query: phrase('Discover', 'Breakpoints', 'and inspect the waiting request.'),
  deny: phrase('Prepare to continue the waiting request', 'but do not change it without approval.'),
  allow: phrase('Continue the approved', 'waiting request.'),
  stale: phrase('Try the already resolved', 'Breakpoint again.'),
  edit: phrase('Forward the next Breakpoint', 'with a text edit.'),
  drop: phrase('Drop the next', 'waiting request.'),
  disableHttp: phrase('Disable HTTP', 'Breakpoints.'),
  enableHttp: phrase('Enable HTTP', 'Breakpoints.'),
  enableWebSocket: phrase('Enable the WebSocket', 'Breakpoint.'),
  listWebSocket: phrase('Inspect the waiting', 'WebSocket frame.'),
  continueWebSocket: phrase('Continue the waiting', 'WebSocket frame.'),
  disableWebSocket: phrase('Disable the WebSocket', 'Breakpoint.'),
  disabled: phrase('Try every disabled', 'Breakpoints Tool.'),
} as const;

const answers = Object.fromEntries(
  Object.keys(prompts).map((key) => [key, `${key} complete.`]),
) as Record<keyof typeof prompts, string>;
const joined = (...parts: readonly string[]): string => parts.join('');
const trafficTexts = {
  continueBody: joined('continue-', 'original'),
  editBody: joined('edit-', 'original'),
  editedBody: joined('edited-by-', 'agent'),
  dropBody: joined('drop-', 'original'),
  disabledBody: joined('disabled-', 'pass'),
  enabledBody: joined('enabled-', 'pending'),
  isolatedMessage: joined('agent-websocket-', 'isolated-pass'),
  pendingMessage: joined('agent-websocket-', 'pending'),
  editMessage: joined('agent-websocket-edit-', 'original'),
  editedMessage: joined('agent-websocket-', 'edit-replacement'),
  dropMessage: joined('agent-websocket-', 'drop'),
  afterDisableMessage: joined('agent-websocket-', 'after-disable'),
} as const;
const SENSITIVE_TEXTS = [
  ...Object.values(prompts),
  ...Object.values(answers),
  ...Object.values(trafficTexts),
];

interface PendingHttpRequest {
  readonly breakpointId: string;
  readonly outcome: Promise<{ result: { statusCode: number | undefined } } | { error: unknown }>;
  readonly row: Locator;
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName)
    .fill('Breakpoints Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('breakpoints-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId)
    .fill('breakpoints-tool-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Send one user message through the current Chat. */
async function sendMessage(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

/** Set one explicit Session execution mode through its segmented control. */
async function setExecutionMode(page: Page, mode: 'ask' | 'auto'): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode[mode]).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-tool-execution-mode', mode);
}

/** Queue one Tool call followed by one final assistant answer. */
function enqueueTool(
  lab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  answer: string,
): void {
  lab.enqueueToolCall({ callId, name, arguments: args });
  lab.enqueueTurn({ textChunks: [answer] });
}

/** Start one real POST that remains waiting at the product Breakpoint. */
async function startPendingRequest(
  page: Page,
  loopbackLab: LoopbackLab,
  proxyPort: number,
  requestPath: string,
  body: string,
): Promise<PendingHttpRequest> {
  const outcome = loopbackLab.requestThroughProxy(proxyPort, requestPath, {
    method: 'POST',
    body,
  }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const row = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: requestPath }).last();
  await expect(row).toHaveAttribute('data-breakpoint-state', 'head');
  const breakpointId = await row.getAttribute('data-breakpoint-id');
  if (!breakpointId) throw new Error('HTTP pending row did not expose breakpoint identity.');
  return { breakpointId, outcome, row };
}

/** Return one successful model-visible Tool Result value. */
function successfulValue(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): Readonly<Record<string, unknown>> {
  const result = resultForCall(requests, callId);
  if (result.ok !== true || !isRecord(result.value)) {
    throw new Error(`Tool Result ${callId} was not successful.`);
  }
  return result.value;
}

/** Return one model-visible Tool Result from captured Provider history. */
function resultForCall(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): Readonly<Record<string, unknown>> {
  for (const request of [...requests].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => (
      isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
    ));
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const parsed: unknown = JSON.parse(message.content);
    if (isRecord(parsed)) return parsed;
  }
  throw new Error(`Provider history has no Tool Result ${callId}.`);
}

/** Return discovered Tool names from one successful discovery result. */
function discoveredNames(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): readonly string[] {
  const matches = successfulValue(requests, callId).matches;
  if (!Array.isArray(matches)) throw new Error(`Tool Result ${callId} has no matches.`);
  return matches.flatMap((match) => (
    isRecord(match)
    && isRecord(match.descriptor)
    && typeof match.descriptor.name === 'string'
      ? [match.descriptor.name]
      : []
  ));
}

/** Return one stable error code from a failed Tool Result. */
function errorCode(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): string {
  const result = resultForCall(requests, callId);
  return isRecord(result.error) && typeof result.error.code === 'string'
    ? result.error.code
    : '';
}

/** Read a dynamic suffix from one public automation ID. */
async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Element did not expose automation prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Return whether one unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Count only origin messages, excluding expected connection-close lifecycle events. */
function webSocketMessageCount(evidence: object): number {
  if (!isRecord(evidence) || !Array.isArray(evidence.messages)) {
    throw new Error('WebSocket evidence has no message collection.');
  }
  return evidence.messages.length;
}

/** Close one App generation with process, trace, and sensitive-evidence verification. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  sensitiveTexts: ReadonlySet<string>,
): Promise<void> {
  try {
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    for (const sensitiveText of sensitiveTexts) {
      await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
    }
    await desktopApp.writeEvidence(testInfo);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('agent.tools.breakpoints controls real HTTP and WebSocket pending traffic', async ({
  desktopApp,
  loopbackLab,
  openAiCompatibleLab,
  webSocketLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.breakpoints',
  });
  for (const text of SENSITIVE_TEXTS) {
    desktopApp.registerSensitiveTextForEvidenceAudit(text);
  }

  const { page } = desktopApp;
  const sessionRoot = getByAutomationId(page, AUTOMATION_IDS.agent.session.root);
  const evidence: Record<string, unknown> = {};
  const sensitiveEvidenceTexts = new Set(SENSITIVE_TEXTS);
  const registerSensitiveText = (text: string): void => {
    sensitiveEvidenceTexts.add(text);
    desktopApp.registerSensitiveTextForEvidenceAudit(text);
  };

  // 准备：真实Settings配置Provider，真实Rules UI创建POST断点，并由真实客户端产生首个pending。
  // Arrange: configure a real Provider, create a POST Breakpoint Rule through Rules UI, and create the first pending with a real client.
  await configureProvider(page, openAiCompatibleLab);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  await desktopApp.stopTrace(testInfo);
  const breakpointRuleId = await createRequestBreakpointRule(page, 'Agent Breakpoints', 'POST');
  registerSensitiveText(breakpointRuleId);
  const firstPath = '/e2e/agent/breakpoints/continue';
  const first = await startPendingRequest(
    page,
    loopbackLab,
    desktopApp.capturePort(),
    firstPath,
    trafficTexts.continueBody,
  );
  registerSensitiveText(first.breakpointId);
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'ask');

  // Query：渐进发现严格十一项，并直接读取与DOM相同的pending identity和typed摘要。
  // Query: discover exactly eleven Tools and directly read the same pending identity plus typed summary.
  openAiCompatibleLab.enqueueToolCall({
    callId: 'breakpoints-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'breakpoints' },
  });
  openAiCompatibleLab.enqueueToolCall({
    callId: 'breakpoints-list',
    name: 'breakpoints_list',
    arguments: {},
  });
  openAiCompatibleLab.enqueueTurn({ textChunks: [answers.query] });
  await sendMessage(page, prompts.query);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const requests = openAiCompatibleLab.requestsForAssertions();
  expect(discoveredNames(requests, 'breakpoints-discover')).toEqual(BREAKPOINT_TOOL_NAMES);
  const listed = successfulValue(requests, 'breakpoints-list').breakpoints;
  expect(Array.isArray(listed) && listed.some((entry) => (
    isRecord(entry) && entry.id === first.breakpointId && entry.phase === 'request'
  ))).toBe(true);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('breakpoints-list'),
  )).toHaveAttribute('data-breakpoint-count', '1');

  // Ask Deny/Allow：Deny保持客户端等待，Allow只释放公开ID且typed结果为continued。
  // Ask Deny/Allow: Deny keeps the client waiting; Allow releases only the public ID with a typed continued result.
  enqueueTool(
    openAiCompatibleLab,
    'continue-deny',
    'breakpoints_continue',
    { breakpointId: first.breakpointId },
    answers.deny,
  );
  await sendMessage(page, prompts.deny);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
  const deniedApproval = getByAutomationId(
    page,
    AutomationIdFactory.agentToolApproval('continue-deny'),
  );
  await expect(deniedApproval).toHaveAttribute(
    'data-effect-metadata',
    expect.stringContaining(`"breakpointId":"${first.breakpointId}"`),
  );
  await getByAutomationId(page, AutomationIdFactory.agentToolDeny('continue-deny')).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(first.row).toHaveAttribute('data-breakpoint-id', first.breakpointId);
  expect(loopbackLab.observation(firstPath)).toBeUndefined();

  enqueueTool(
    openAiCompatibleLab,
    'continue-allow',
    'breakpoints_continue',
    { breakpointId: first.breakpointId },
    answers.allow,
  );
  await sendMessage(page, prompts.allow);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
  await getByAutomationId(page, AutomationIdFactory.agentToolAllow('continue-allow')).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(first.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('continue-allow'),
  )).toHaveAttribute('data-breakpoint-state', 'continued');
  evidence.continueAllowed = true;

  // Stale：已解决ID在审批前失败，不产生第二次副作用。
  // Stale: the resolved ID fails before approval and cannot produce a second side effect.
  enqueueTool(
    openAiCompatibleLab,
    'continue-stale',
    'breakpoints_continue',
    { breakpointId: first.breakpointId },
    answers.stale,
  );
  await sendMessage(page, prompts.stale);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  expect(errorCode(openAiCompatibleLab.requestsForAssertions(), 'continue-stale'))
    .toBe('invalid_arguments');
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolApproval('continue-stale'),
  )).toHaveCount(0);
  evidence.staleRejected = true;

  // Ask Edit / Auto Drop：真实origin只收到Allow后的文本编辑；Drop客户端失败且origin零到达。
  // Ask Edit / Auto Drop: the real origin receives text edits only after Allow; Drop fails the client and never reaches origin.
  const editPath = '/e2e/agent/breakpoints/edit';
  const edited = await startPendingRequest(
    page,
    loopbackLab,
    desktopApp.capturePort(),
    editPath,
    trafficTexts.editBody,
  );
  registerSensitiveText(edited.breakpointId);
  enqueueTool(openAiCompatibleLab, 'forward-edited', 'breakpoints_forward_edited', {
    breakpointId: edited.breakpointId,
    method: 'PUT',
    body: trafficTexts.editedBody,
  }, answers.edit);
  await sendMessage(page, prompts.edit);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
  await getByAutomationId(page, AutomationIdFactory.agentToolAllow('forward-edited')).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(edited.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect.poll(() => loopbackLab.observation(editPath)?.method).toBe('PUT');
  await expect.poll(() => loopbackLab.observation(editPath)?.body.toString('utf8'))
    .toBe(trafficTexts.editedBody);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('forward-edited'),
  )).toHaveAttribute('data-breakpoint-state', 'edited');

  await setExecutionMode(page, 'auto');
  const dropPath = '/e2e/agent/breakpoints/drop';
  const dropped = await startPendingRequest(
    page,
    loopbackLab,
    desktopApp.capturePort(),
    dropPath,
    trafficTexts.dropBody,
  );
  registerSensitiveText(dropped.breakpointId);
  enqueueTool(openAiCompatibleLab, 'drop-auto', 'breakpoints_drop', {
    breakpointId: dropped.breakpointId,
  }, answers.drop);
  await sendMessage(page, prompts.drop);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(dropped.outcome).resolves.toHaveProperty('error');
  expect(loopbackLab.observation(dropPath)).toBeUndefined();
  evidence.editAndDrop = true;

  // HTTP配置：disable让后续POST直通，enable让下一条POST重新pending并可继续。
  // HTTP configuration: disable lets the next POST pass; enable makes the following POST pending again and resolvable.
  enqueueTool(openAiCompatibleLab, 'http-disable', 'breakpoints_disable_http', {}, answers.disableHttp);
  await sendMessage(page, prompts.disableHttp);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const disabledPath = '/e2e/agent/breakpoints/disabled';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    disabledPath,
    { method: 'POST', body: trafficTexts.disabledBody },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(() => loopbackLab.observation(disabledPath)?.body.toString('utf8'))
    .toBe(trafficTexts.disabledBody);

  enqueueTool(openAiCompatibleLab, 'http-enable', 'breakpoints_enable_http', {}, answers.enableHttp);
  await sendMessage(page, prompts.enableHttp);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const enabledPath = '/e2e/agent/breakpoints/enabled';
  const enabled = await startPendingRequest(
    page,
    loopbackLab,
    desktopApp.capturePort(),
    enabledPath,
    trafficTexts.enabledBody,
  );
  registerSensitiveText(enabled.breakpointId);
  enqueueTool(openAiCompatibleLab, 'continue-enabled', 'breakpoints_continue', {
    breakpointId: enabled.breakpointId,
  }, answers.enableHttp);
  await sendMessage(page, prompts.enableHttp);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(enabled.outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
  evidence.httpConfiguration = true;

  // WebSocket：真实连接自产exchangeId；Agent启用后frame变pending，Continue后到达origin，停用后下一帧直通。
  // WebSocket: a real connection produces exchangeId; enable makes a frame pending, Continue reaches origin, and disable lets the next frame pass.
  const webSocketPath = '/e2e/agent/breakpoints/websocket';
  const client = await webSocketLab.openThroughProxy(desktopApp.capturePort(), webSocketPath);
  const isolatedPath = '/e2e/agent/breakpoints/other-socket';
  const isolatedClient = await webSocketLab.openThroughProxy(
    desktopApp.capturePort(),
    isolatedPath,
  );
  const webSocketRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: webSocketPath }).last();
  await expect(webSocketRow).toBeVisible();
  const exchangeId = await automationSuffix(webSocketRow, AUTOMATION_ID_PREFIXES.captureRequestRow);
  registerSensitiveText(exchangeId);
  enqueueTool(openAiCompatibleLab, 'websocket-enable', 'breakpoints_enable_websocket', {
    exchangeId,
    direction: 'client-to-server',
    frames: ['message'],
  }, answers.enableWebSocket);
  await sendMessage(page, prompts.enableWebSocket);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await webSocketRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  const isolatedMessage = trafficTexts.isolatedMessage;
  isolatedClient.sendText(isolatedMessage);
  await expect.poll(() => webSocketLab.hasMessage(isolatedMessage)).toBe(true);
  await isolatedClient.waitForText(isolatedMessage);
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.breakpointPending,
  ).filter({ hasText: isolatedMessage })).toHaveCount(0);

  const pendingMessage = trafficTexts.pendingMessage;
  client.sendText(pendingMessage);
  const pendingRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.breakpointPending,
  ).filter({ hasText: pendingMessage });
  await expect(pendingRow).toHaveCount(1);
  const webSocketBreakpointId = await pendingRow.getAttribute('data-breakpoint-id');
  if (!webSocketBreakpointId) throw new Error('WebSocket pending did not expose breakpoint ID.');
  registerSensitiveText(webSocketBreakpointId);

  enqueueTool(openAiCompatibleLab, 'websocket-list', 'breakpoints_list', {}, answers.listWebSocket);
  await sendMessage(page, prompts.listWebSocket);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const websocketPending = successfulValue(
    openAiCompatibleLab.requestsForAssertions(),
    'websocket-list',
  ).breakpoints;
  expect(Array.isArray(websocketPending) && websocketPending.some((entry) => (
    isRecord(entry) && entry.id === webSocketBreakpointId && entry.phase === 'websocket'
  ))).toBe(true);
  enqueueTool(openAiCompatibleLab, 'websocket-continue', 'breakpoints_continue', {
    breakpointId: webSocketBreakpointId,
  }, answers.continueWebSocket);
  await sendMessage(page, prompts.continueWebSocket);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect.poll(() => webSocketLab.hasMessage(pendingMessage)).toBe(true);
  await client.waitForText(pendingMessage);

  const editOriginal = trafficTexts.editMessage;
  const editReplacement = trafficTexts.editedMessage;
  client.sendText(editOriginal);
  const editPendingRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.breakpointPending,
  ).filter({ hasText: editOriginal });
  await expect(editPendingRow).toHaveCount(1);
  const editBreakpointId = await editPendingRow.getAttribute('data-breakpoint-id');
  if (!editBreakpointId) throw new Error('Editable WebSocket pending did not expose breakpoint ID.');
  registerSensitiveText(editBreakpointId);
  enqueueTool(openAiCompatibleLab, 'websocket-edit', 'breakpoints_forward_edited', {
    breakpointId: editBreakpointId,
    body: editReplacement,
  }, answers.edit);
  await sendMessage(page, prompts.edit);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect.poll(() => webSocketLab.hasMessage(editReplacement)).toBe(true);
  await client.waitForText(editReplacement);
  expect(webSocketLab.hasMessage(editOriginal)).toBe(false);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('websocket-edit'),
  )).toHaveAttribute('data-breakpoint-state', 'edited');

  const dropMessage = trafficTexts.dropMessage;
  client.sendText(dropMessage);
  const dropPendingRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.breakpointPending,
  ).filter({ hasText: dropMessage });
  await expect(dropPendingRow).toHaveCount(1);
  const dropBreakpointId = await dropPendingRow.getAttribute('data-breakpoint-id');
  if (!dropBreakpointId) throw new Error('Dropped WebSocket pending did not expose breakpoint ID.');
  registerSensitiveText(dropBreakpointId);
  enqueueTool(openAiCompatibleLab, 'websocket-drop', 'breakpoints_drop', {
    breakpointId: dropBreakpointId,
  }, answers.drop);
  await sendMessage(page, prompts.drop);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(dropPendingRow).toHaveCount(0);

  enqueueTool(openAiCompatibleLab, 'websocket-disable', 'breakpoints_disable_websocket', {}, answers.disableWebSocket);
  await sendMessage(page, prompts.disableWebSocket);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const afterDisable = trafficTexts.afterDisableMessage;
  client.sendText(afterDisable);
  await expect.poll(() => webSocketLab.hasMessage(afterDisable)).toBe(true);
  await client.waitForText(afterDisable);
  expect(webSocketLab.hasMessage(dropMessage)).toBe(false);
  expect(client.hasText(dropMessage)).toBe(false);
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.breakpointPending,
  ).filter({ hasText: afterDisable })).toHaveCount(0);
  evidence.webSocketConfiguration = true;

  // Settings边界：关闭十一项后分轮验证discovery与逐项unknown_tool，避免把整组失败塞进一个Turn；最后恢复默认开关与Ask。
  // Settings boundary: verify empty discovery and each unknown Tool in separate turns, without packing every failure into one turn; finally restore defaults and Ask.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  for (const toolName of BREAKPOINT_TOOL_NAMES) {
    await getByAutomationId(
      page,
      AutomationIdFactory.agentToolAgentSwitch(toolName),
    ).click();
  }
  openAiCompatibleLab.enqueueToolCall({
    callId: 'disabled-breakpoints-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'breakpoints' },
  });
  openAiCompatibleLab.enqueueTurn({ textChunks: [answers.disabled] });
  await sendMessage(page, prompts.disabled);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  for (const toolName of BREAKPOINT_TOOL_NAMES) {
    const argumentsByName: Record<string, unknown> = toolName === 'breakpoints_enable_websocket'
      ? { exchangeId, frames: ['message'] }
      : toolName === 'breakpoints_continue' || toolName === 'breakpoints_drop'
        ? { breakpointId: first.breakpointId }
        : toolName === 'breakpoints_forward_edited'
          ? { breakpointId: first.breakpointId, body: '' }
          : {};
    openAiCompatibleLab.enqueueToolCall({
      callId: `disabled-${toolName}`,
      name: toolName,
      arguments: argumentsByName,
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [answers.disabled] });
    await sendMessage(page, prompts.disabled);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  }
  const finalRequests = openAiCompatibleLab.requestsForAssertions();
  expect(discoveredNames(finalRequests, 'disabled-breakpoints-discover')).toEqual([]);
  expect(BREAKPOINT_TOOL_NAMES.map((name) => errorCode(finalRequests, `disabled-${name}`)))
    .toEqual(Array(BREAKPOINT_TOOL_NAMES.length).fill('unknown_tool'));
  evidence.disabledErrorCodes = Array(BREAKPOINT_TOOL_NAMES.length).fill('unknown_tool');

  for (const toolName of BREAKPOINT_TOOL_NAMES) {
    await getByAutomationId(
      page,
      AutomationIdFactory.agentToolAgentSwitch(toolName),
    ).click();
  }
  await setExecutionMode(page, 'ask');
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await desktopApp.startTrace(testInfo);

  // 重启：第一代完整销毁后，同profile不得重放Model调用或任何已完成resolution。
  // Restart: after fully destroying generation one, the same profile must not replay Model calls or completed resolutions.
  const modelRequestCountBeforeRestart = openAiCompatibleLab.evidence().length;
  const originRequestCountBeforeRestart = loopbackLab.evidence().length;
  const webSocketMessageCountBeforeRestart = webSocketMessageCount(webSocketLab.evidence());
  await closeGeneration(desktopApp, testInfo, sensitiveEvidenceTexts);
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  try {
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of sensitiveEvidenceTexts) {
      relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    }
    await relaunchedApp.waitUntilReady();
    const restartModelRequestCount = openAiCompatibleLab.evidence().length
      - modelRequestCountBeforeRestart;
    const restartOriginRequestCount = loopbackLab.evidence().length
      - originRequestCountBeforeRestart;
    expect(restartModelRequestCount).toBe(0);
    expect(restartOriginRequestCount).toBe(0);
    expect(webSocketMessageCount(webSocketLab.evidence()))
      .toBe(webSocketMessageCountBeforeRestart);
    evidence.restartModelRequestCount = restartModelRequestCount;
    evidence.restartOriginRequestCount = restartOriginRequestCount;

    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.session.root))
      .toHaveAttribute('data-tool-execution-mode', 'ask');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolResult('continue-allow'),
    )).toHaveAttribute('data-breakpoint-state', 'continued');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolResult('forward-edited'),
    )).toHaveAttribute('data-breakpoint-state', 'edited');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolResult('drop-auto'),
    )).toHaveAttribute('data-breakpoint-state', 'dropped');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(getByAutomationIdPrefix(
      relaunchedApp.page,
      AUTOMATION_ID_PREFIXES.breakpointPending,
    )).toHaveCount(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const toolName of BREAKPOINT_TOOL_NAMES) {
      await expect(getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolAgentSwitch(toolName),
      )).toHaveAttribute('aria-checked', 'true');
    }
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);

    expect(openAiCompatibleLab.evidence().length - modelRequestCountBeforeRestart).toBe(0);
    expect(loopbackLab.evidence().length - originRequestCountBeforeRestart).toBe(0);
    expect(webSocketMessageCount(webSocketLab.evidence()))
      .toBe(webSocketMessageCountBeforeRestart);
    evidence.restartWebSocketUnchanged = true;

    // Evidence：只保存布尔、计数和Provider请求hash，不保存提示词、正文或动态ID。
    // Evidence: store only booleans, counts, and Provider request hashes, never prompts, bodies, or dynamic IDs.
    const evidencePath = testInfo.outputPath('agent-tool-breakpoints.json');
    await writeFile(evidencePath, JSON.stringify({
      ...evidence,
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('agent-tool-breakpoints.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } finally {
    if (relaunchedApp !== null) {
      await closeGeneration(relaunchedApp, testInfo, sensitiveEvidenceTexts);
    }
  }
});