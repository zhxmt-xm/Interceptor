import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { writeFile } from 'node:fs/promises';

import type { Locator, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

const REQUEST_TOOL_NAMES = ['send_request', 'probe_connection'] as const;
const phrase = (...parts: readonly string[]): string => parts.join(' ');
const joined = (...parts: readonly string[]): string => parts.join('');
const prompts = {
  discover: phrase('Discover the available', 'Requests Tools.'),
  deny: phrase('Prepare the direct request', 'but wait for approval.'),
  allow: phrase('Send the approved direct', 'request now.'),
  probe: phrase('Probe the local TLS', 'connection now.'),
  probeFailure: phrase('Probe the unavailable TLS', 'connection now.'),
  cancel: phrase('Send the cancellable direct', 'request now.'),
  disabled: phrase('Try both disabled', 'Requests Tools.'),
} as const;
const answers = Object.fromEntries(
  Object.keys(prompts).map((key) => [key, `${key} complete.`]),
) as Record<keyof typeof prompts, string>;
const trafficTexts = {
  deniedBody: joined('requests-denied-', 'body'),
  allowedBody: joined('requests-allowed-', 'body'),
  cancelledBody: joined('requests-cancelled-', 'body'),
  requestAuthorization: joined('Bearer requests-', 'request-secret'),
  requestQuerySecret: joined('requests-query-', 'secret'),
  responseBody: joined('{"accepted":"requests-', 'response"}'),
  responseCookie: joined('requests_session=', 'response-secret'),
} as const;
const SENSITIVE_TEXTS = [
  ...Object.values(prompts),
  ...Object.values(answers),
  ...Object.values(trafficTexts),
];

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName)
    .fill('Requests Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('requests-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId)
    .fill('requests-tool-model');
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

/** Set one explicit Session execution mode. */
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

/** Return whether one unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reserve and release one loopback port so a deterministic connection failure can be tested. */
async function closedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
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

test('agent.tools.requests sends direct HTTP and probes TLS with real cancellation', async ({
  desktopApp,
  loopbackLab,
  openAiCompatibleLab,
  tlsOriginLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.requests',
  });

  const sensitiveTexts = new Set(SENSITIVE_TEXTS);
  const registerSensitiveText = (text: string): void => {
    sensitiveTexts.add(text);
    desktopApp.registerSensitiveTextForEvidenceAudit(text);
  };
  for (const text of sensitiveTexts) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  const { page } = desktopApp;
  const sessionRoot = getByAutomationId(page, AUTOMATION_IDS.agent.session.root);
  const approval = (callId: string): Locator => getByAutomationId(
    page,
    AutomationIdFactory.agentToolApproval(callId),
  );
  const evidence: Record<string, unknown> = {};

  // 准备：真实Settings配置Provider并开始Recording；业务文本进入DOM前暂停trace。
  // Arrange: configure a real Provider and start Recording; stop trace before business text enters the DOM.
  await configureProvider(page, openAiCompatibleLab);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  const requestsSessionId = await sessionRoot.getAttribute('data-session-id');
  if (!requestsSessionId) throw new Error('Requests Chat did not expose a Session ID.');
  await desktopApp.stopTrace(testInfo);

  // Discovery：requests能力严格只披露两个共享change Tool。
  // Discovery: the requests capability exposes exactly two shared change Tools.
  openAiCompatibleLab.enqueueToolCall({
    callId: 'requests-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'requests' },
  });
  openAiCompatibleLab.enqueueTurn({ textChunks: [answers.discover] });
  await sendMessage(page, prompts.discover);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  expect(discoveredNames(
    openAiCompatibleLab.requestsForAssertions(),
    'requests-discover',
  )).toEqual(REQUEST_TOOL_NAMES);

  // Ask Deny：问询展示完整目标；拒绝后origin零到达。
  // Ask Deny: approval shows the complete target; denial leaves the origin untouched.
  const deniedPath = '/e2e/agent/requests/denied';
  const deniedUrl = loopbackLab.url(deniedPath);
  registerSensitiveText(deniedUrl);
  enqueueTool(openAiCompatibleLab, 'send-deny', 'send_request', {
    method: 'POST',
    url: deniedUrl,
    body: trafficTexts.deniedBody,
  }, answers.deny);
  await sendMessage(page, prompts.deny);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
  await expect(approval('send-deny')).toContainText(deniedUrl);
  await getByAutomationId(page, AutomationIdFactory.agentToolDeny('send-deny')).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  expect(loopbackLab.observation(deniedPath)).toBeUndefined();

  // Ask Allow：真实origin接收method/query/header/body；结果遮罩凭据并且不进入Capture。
  // Ask Allow: the real origin receives method/query/header/body; the result redacts credentials and never enters Capture.
  const allowedPath = `/e2e/agent/requests/allowed?access_token=${trafficTexts.requestQuerySecret}&mode=tool`;
  const allowedUrl = loopbackLab.url(allowedPath);
  registerSensitiveText(allowedUrl);
  loopbackLab.respondWith(allowedPath, {
    statusCode: 201,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': trafficTexts.responseCookie,
    },
    body: trafficTexts.responseBody,
  });
  enqueueTool(openAiCompatibleLab, 'send-allow', 'send_request', {
    method: 'POST',
    url: allowedUrl,
    headers: [
      { name: 'authorization', value: trafficTexts.requestAuthorization },
      { name: 'x-agent-request', value: 'allowed' },
    ],
    body: trafficTexts.allowedBody,
    protocol: 'http/1.1',
  }, answers.allow);
  await sendMessage(page, prompts.allow);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
  await getByAutomationId(page, AutomationIdFactory.agentToolAllow('send-allow')).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect.poll(() => loopbackLab.observation(allowedPath)?.method).toBe('POST');
  const allowedObservation = loopbackLab.observation(allowedPath);
  expect(allowedObservation?.headers.authorization).toBe(trafficTexts.requestAuthorization);
  expect(allowedObservation?.headers['x-agent-request']).toBe('allowed');
  expect(allowedObservation?.body.toString('utf8')).toBe(trafficTexts.allowedBody);
  const requestResult = successfulValue(
    openAiCompatibleLab.requestsForAssertions(),
    'send-allow',
  );
  expect(requestResult).toMatchObject({
    ok: true,
    method: 'POST',
    status: 201,
    httpVersion: 'HTTP/1.1',
  });
  expect(new URL(String(requestResult.url)).searchParams.get('access_token')).toBe('<redacted>');
  expect(requestResult.headers).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'set-cookie', value: '<redacted>' }),
  ]));
  expect(requestResult.body).toMatchObject({ text: trafficTexts.responseBody, truncated: false });
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('send-allow'),
  )).toHaveAttribute('data-request-status', '201');
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: '/e2e/agent/requests/allowed' })).toHaveCount(0);
  evidence.directRequestVerified = true;

  // Auto TLS：成功探测只握手不发应用数据；未监听端口返回稳定失败结果。
  // Auto TLS: a successful probe performs only a handshake; a closed port returns a stable failure result.
  await setExecutionMode(page, 'auto');
  enqueueTool(openAiCompatibleLab, 'probe-success', 'probe_connection', {
    host: '127.0.0.1',
    port: tlsOriginLab.port,
    timeoutMs: 5_000,
  }, answers.probe);
  await sendMessage(page, prompts.probe);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  expect(tlsOriginLab.handshakeCount()).toBe(1);
  expect(tlsOriginLab.applicationByteCount()).toBe(0);
  const probeResult = successfulValue(
    openAiCompatibleLab.requestsForAssertions(),
    'probe-success',
  );
  expect(probeResult).toMatchObject({ ok: true, alpn: 'h2', authorized: false });
  expect(probeResult.protocol).toMatch(/^TLSv1\.[23]$/);
  expect(Array.isArray(probeResult.certificates) && probeResult.certificates.length).toBe(1);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('probe-success'),
  )).toHaveAttribute('data-probe-certificate-count', '1');

  const unavailablePort = await closedLoopbackPort();
  enqueueTool(openAiCompatibleLab, 'probe-failure', 'probe_connection', {
    host: '127.0.0.1',
    port: unavailablePort,
    timeoutMs: 2_000,
  }, answers.probeFailure);
  await sendMessage(page, prompts.probeFailure);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const failedProbe = successfulValue(
    openAiCompatibleLab.requestsForAssertions(),
    'probe-failure',
  );
  expect(failedProbe.ok).toBe(false);
  expect(typeof failedProbe.error === 'string' && failedProbe.error.length > 0).toBe(true);
  evidence.tlsProbeVerified = true;

  // Stop：真实origin已收到请求但暂缓响应；停止Turn必须立即关闭socket且不发起下一次Model Call。
  // Stop: the real origin has received a held request; stopping the Turn must close the socket and skip the next Model Call.
  const cancelPath = '/e2e/agent/requests/cancel';
  const cancelUrl = loopbackLab.url(cancelPath);
  registerSensitiveText(cancelUrl);
  const releaseCancelledResponse = loopbackLab.holdResponse(cancelPath);
  openAiCompatibleLab.enqueueToolCall({
    callId: 'send-cancel',
    name: 'send_request',
    arguments: {
      method: 'POST',
      url: cancelUrl,
      body: trafficTexts.cancelledBody,
      timeoutMs: 60_000,
    },
  });
  await sendMessage(page, prompts.cancel);
  await expect.poll(() => loopbackLab.observation(cancelPath)?.method).toBe('POST');
  const modelRequestCountAtCancel = openAiCompatibleLab.evidence().length;
  await getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'cancelled');
  await expect.poll(() => loopbackLab.responseWasAborted(cancelPath)).toBe(true);
  const cancelledResult = getByAutomationId(
    page,
    AutomationIdFactory.agentToolResult('send-cancel'),
  );
  await expect(cancelledResult).toHaveAttribute('data-summary-kind', 'error');
  await expect(cancelledResult).toHaveCount(1);
  releaseCancelledResponse();
  await expect(cancelledResult).toHaveCount(1);
  expect(openAiCompatibleLab.evidence()).toHaveLength(modelRequestCountAtCancel);
  evidence.cancelledSocketVerified = true;

  // Settings撤权：关闭两项后discovery为空，逐项猜测均unknown_tool且网络计数不变。
  // Settings revocation: disabling both empties discovery; guessed calls are unknown and network counts stay unchanged.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  for (const toolName of REQUEST_TOOL_NAMES) {
    await getByAutomationId(
      page,
      AutomationIdFactory.agentToolAgentSwitch(toolName),
    ).click();
  }
  expect(openAiCompatibleLab.evidence()).toHaveLength(modelRequestCountAtCancel);
  const originCountBeforeDisabled = loopbackLab.evidence().length;
  const handshakeCountBeforeDisabled = tlsOriginLab.handshakeCount();
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  openAiCompatibleLab.enqueueToolCall({
    callId: 'disabled-requests-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'requests' },
  });
  openAiCompatibleLab.enqueueToolCall({
    callId: 'disabled-send-request',
    name: 'send_request',
    arguments: { method: 'GET', url: allowedUrl },
  });
  openAiCompatibleLab.enqueueToolCall({
    callId: 'disabled-probe-connection',
    name: 'probe_connection',
    arguments: { host: '127.0.0.1', port: tlsOriginLab.port },
  });
  openAiCompatibleLab.enqueueTurn({ textChunks: [answers.disabled] });
  await sendMessage(page, prompts.disabled);
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  const finalRequests = openAiCompatibleLab.requestsForAssertions();
  expect(discoveredNames(finalRequests, 'disabled-requests-discover')).toEqual([]);
  expect([
    errorCode(finalRequests, 'disabled-send-request'),
    errorCode(finalRequests, 'disabled-probe-connection'),
  ]).toEqual(['unknown_tool', 'unknown_tool']);
  expect(loopbackLab.evidence()).toHaveLength(originCountBeforeDisabled);
  expect(tlsOriginLab.handshakeCount()).toBe(handshakeCountBeforeDisabled);
  for (const toolName of REQUEST_TOOL_NAMES) {
    await getByAutomationId(
      page,
      AutomationIdFactory.agentToolAgentSwitch(toolName),
    ).click();
  }
  await setExecutionMode(page, 'ask');
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await desktopApp.startTrace(testInfo);

  // Restart：两代之间Model、HTTP与TLS都零增量；取消的原Chat恢复但不重放网络动作。
  // Restart: Model, HTTP, and TLS all stay unchanged across generations; the cancelled Chat restores without network replay.
  const modelCountBeforeRestart = openAiCompatibleLab.evidence().length;
  const originCountBeforeRestart = loopbackLab.evidence().length;
  const handshakeCountBeforeRestart = tlsOriginLab.handshakeCount();
  await closeGeneration(desktopApp, testInfo, sensitiveTexts);
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  try {
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of sensitiveTexts) {
      relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    }
    await relaunchedApp.waitUntilReady();
    expect(openAiCompatibleLab.evidence()).toHaveLength(modelCountBeforeRestart);
    expect(loopbackLab.evidence()).toHaveLength(originCountBeforeRestart);
    expect(tlsOriginLab.handshakeCount()).toBe(handshakeCountBeforeRestart);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentSessionOption(requestsSessionId),
    ).click();
    const restoredRoot = getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.agent.session.root,
    );
    await expect(restoredRoot).toHaveAttribute('data-turn-status', 'cancelled');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolResult('send-cancel'),
    )).toHaveAttribute('data-summary-kind', 'error');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolResult('send-allow'),
    )).toHaveAttribute('data-request-status', '201');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
    expect(openAiCompatibleLab.evidence()).toHaveLength(modelCountBeforeRestart);
    expect(loopbackLab.evidence()).toHaveLength(originCountBeforeRestart);
    expect(tlsOriginLab.handshakeCount()).toBe(handshakeCountBeforeRestart);
    evidence.restartNetworkRequestCount = 0;

    const evidencePath = testInfo.outputPath('agent-tool-requests.json');
    await writeFile(evidencePath, JSON.stringify({
      ...evidence,
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('agent-tool-requests.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } finally {
    if (relaunchedApp !== null) {
      await closeGeneration(relaunchedApp, testInfo, sensitiveTexts);
    }
  }
});