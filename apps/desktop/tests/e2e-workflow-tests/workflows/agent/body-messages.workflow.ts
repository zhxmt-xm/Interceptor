import { writeFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { chromium, type Browser } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { waitForCertificateInstallation } from '../../fixtures/ui/https-capture';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { runPlaygroundCaptureScenario } from '../../fixtures/ui/playground-capture-workflow';

const HTTP_PATH = '/playground/body/json';
const WEBSOCKET_PATH = '/playground/ws/bidirectional';
const GRPC_PATH = '/playground.Capture/UnaryJson';
const INSECURE_HOST = 'localhost';
const phrase = (...parts: readonly string[]): string => parts.join(' ');
const FIRST_PROMPT = phrase('Find the captured JSON', 'response and its body reference.');
const BODY_PROMPT = phrase('Read that JSON body', 'and the captured WebSocket messages.');
const GRPC_PROMPT = phrase('Read both sides of', 'the captured gRPC exchange.');
const DISABLED_PROMPT = phrase('Try every disabled', 'body and message Tool.');
const FIRST_ANSWER = phrase('I found the captured', 'JSON exchange.');
const BODY_ANSWER = phrase('The JSON body and', 'WebSocket messages are available.');
const GRPC_ANSWER = phrase('Both gRPC message', 'sides are available.');
const DISABLED_ANSWER = phrase('Those body and message', 'Tools are unavailable.');
const NEW_TOOL_NAMES = [
  'capture_get_exchange_body',
  'capture_list_websocket_messages',
  'capture_list_grpc_messages',
] as const;
const DISCOVERED_TRAFFIC_TOOL_NAMES = [
  'capture_get_proxy_status',
  'capture_get_storage_status',
  'capture_start_recording',
  'capture_stop_recording',
  'capture_clear',
  'capture_list_exchanges',
  'capture_get_exchange',
  ...NEW_TOOL_NAMES,
  'capture_get_transfer_job',
  'capture_cancel_transfer_job',
  'capture_export_body',
  'capture_export_har',
  'capture_import_har',
  'capture_export_archive',
  'capture_import_archive',
] as const;

interface BodyMessagesEvidence {
  readonly bodyId: string;
  readonly bodyBytesRead: number;
  readonly disabledErrorCodes: readonly string[];
  readonly discoveredToolNames: readonly string[];
  readonly grpcExchangeId: string;
  readonly grpcRequestCount: number;
  readonly grpcResponseCount: number;
  readonly httpExchangeId: string;
  readonly restartRequestCount: number;
  readonly webSocketExchangeId: string;
  readonly webSocketMessageCount: number;
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Body message Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('body-message-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('body-message-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Read the stable Core exchange identity exposed by one public Capture row. */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

/** Wait for one self-produced Capture row and return its public exchange identity. */
async function capturedExchangeId(page: Page, path: string): Promise<string> {
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: path })
    .last();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return exchangeId(row);
}

/** Send one user message in either a fresh or the currently selected Chat. */
async function completeMessage(page: Page, prompt: string, newChat = false): Promise<void> {
  if (newChat) await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed', { timeout: 30_000 });
}

/** Return model-visible Tool names from one captured Chat Completions request. */
function requestToolNames(request: Readonly<Record<string, unknown>>): string[] {
  if (!Array.isArray(request.tools)) return [];
  return request.tools.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return [];
    return typeof entry.function.name === 'string' ? [entry.function.name] : [];
  });
}

/** Parse one correlated normalized Tool Result from Provider history. */
function toolResult(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  if (!Array.isArray(request.messages)) throw new Error('Provider request has no messages.');
  const message = request.messages.find((entry) => (
    isRecord(entry)
      && entry.role === 'tool'
      && entry.tool_call_id === callId
      && typeof entry.content === 'string'
  ));
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error(`Provider request has no Tool Result ${callId}.`);
  }
  const parsed: unknown = JSON.parse(message.content);
  if (!isRecord(parsed)) throw new Error(`Tool Result ${callId} is not an object.`);
  return parsed;
}

/** Return a successful Tool Result value or fail with the complete structured result. */
function successfulValue(
  result: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  if (result.ok !== true || !isRecord(result.value)) {
    throw new Error(`Tool ${callId} did not succeed: ${JSON.stringify(result)}`);
  }
  return result.value;
}

/** Extract discovered descriptor names from one successful discovery result. */
function discoveredNames(result: Readonly<Record<string, unknown>>): string[] {
  const value = successfulValue(result, 'discover_tools');
  if (!Array.isArray(value.matches)) return [];
  return value.matches.flatMap((match) => {
    if (!isRecord(match) || !isRecord(match.descriptor)) return [];
    return typeof match.descriptor.name === 'string' ? [match.descriptor.name] : [];
  });
}

/** Return whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read one required array from a structured Tool value. */
function arrayField(value: Readonly<Record<string, unknown>>, name: string): readonly unknown[] {
  const field = value[name];
  if (!Array.isArray(field)) throw new Error(`Tool value ${name} is not an array.`);
  return field;
}

/** Read the response body identity returned by capture_get_exchange. */
function responseBodyId(result: Readonly<Record<string, unknown>>): string {
  const value = successfulValue(result, 'call-detail');
  if (!isRecord(value.detail) || !isRecord(value.detail.responseBody)) {
    throw new Error('Exchange detail has no response body.');
  }
  const bodyHash = value.detail.responseBody.bodyHash;
  if (typeof bodyHash !== 'string') throw new Error('Exchange response body has no identity.');
  return bodyHash;
}

/** Enable MITM for the Playground self-signed localhost origin through product Settings. */
async function enableHttpsDecryption(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await waitForCertificateInstallation(page);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput)
    .fill(INSECURE_HOST);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd).click();
  await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(INSECURE_HOST)))
    .toBeVisible();
  const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
  await mitmToggle.click();
  await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
}

/** Remove profile-local localhost and decryption settings without deleting the shared CA. */
async function disableHttpsDecryption(page: Page): Promise<void> {
  const compatibilityDismiss = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsCompatibility.dismiss,
  );
  if (await compatibilityDismiss.isVisible().catch(() => false)) {
    await compatibilityDismiss.click();
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  const host = getByAutomationId(page, AutomationIdFactory.insecureHost(INSECURE_HOST));
  if (await host.isVisible().catch(() => false)) {
    await getByAutomationId(page, AutomationIdFactory.insecureHostRemove(INSECURE_HOST)).click();
    await expect(host).not.toBeVisible();
  }
  const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
  if (await mitmToggle.getAttribute('aria-checked') === 'true') {
    await mitmToggle.click();
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
  }
  await waitForCertificateInstallation(page);
}

/** Close one app generation and retain its lifecycle evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  sensitiveTexts: readonly string[],
  captureFinalState = true,
): Promise<void> {
  const errors: unknown[] = [];
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  };
  if (captureFinalState) {
    await attempt(() => desktopApp.captureFinalScreenshot(testInfo));
  }
  await attempt(() => desktopApp.stopTrace(testInfo));
  await attempt(() => desktopApp.closeGracefully());
  for (const text of sensitiveTexts) {
    await attempt(() => desktopApp.assertSensitiveTextAbsentFromEvidence(text));
  }
  await attempt(() => desktopApp.writeEvidence(testInfo));
  await attempt(() => desktopApp.forceCleanup());
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Agent generation cleanup failed.');
  }
}

test('agent.tools.body-messages reads bounded HTTP, WebSocket and gRPC data', async ({
  desktopApp,
  openAiCompatibleLab,
  playgroundServer,
}, testInfo) => {
  test.setTimeout(300_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.body-messages',
  });

  let browser: Browser | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let tlsStateTouched = false;
  let workflowError: unknown;
  let cleanupError: unknown;
  const sensitiveTexts = [
    FIRST_PROMPT,
    BODY_PROMPT,
    GRPC_PROMPT,
    DISABLED_PROMPT,
    FIRST_ANSWER,
    BODY_ANSWER,
    GRPC_ANSWER,
    DISABLED_ANSWER,
  ];
  for (const text of sensitiveTexts) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  desktopApp.preserveUserDataOnFailure();

  try {
    // 准备：经产品UI配置Provider和Recording，再从正式Playground公开UI自产HTTP正文与WebSocket流量。
    // Arrange: configure Provider and Recording through product UI, then create HTTP body and WebSocket traffic through the official Playground UI.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] });
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await browserPage.goto(playgroundServer.url);
    await expect(browserPage.locator('main')).toHaveAttribute('data-section', 'capture');
    await runPlaygroundCaptureScenario(browserPage, 'body-json');
    await runPlaygroundCaptureScenario(browserPage, 'ws-bidirectional');
    const httpExchangeId = await capturedExchangeId(desktopApp.page, HTTP_PATH);
    const webSocketExchangeId = await capturedExchangeId(desktopApp.page, WEBSOCKET_PATH);
    await screenshotStep('准备：经产品UI配置Provider和Recording，再从正式Playground公开UI自产HTTP正文与WebSocket流量。 / Arrange: configure Provider and Recording through product UI, then create HTTP body and WebSocket traffic through the official Playground UI.');

    // 用户操作：先discover并读取真实Exchange detail，从Tool Result而非测试内部状态取得bodyId。
    // User action: discover and read the real Exchange detail, deriving bodyId from the Tool Result rather than test internals.
    const firstOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-discover',
      name: 'discover_tools',
      arguments: { capabilityId: 'capture' },
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-detail',
      name: 'capture_get_exchange',
      arguments: { exchangeId: httpExchangeId },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [FIRST_ANSWER] });
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await completeMessage(desktopApp.page, FIRST_PROMPT, true);
    const firstRequests = openAiCompatibleLab.requestsForAssertions().slice(firstOffset);
    expect(firstRequests).toHaveLength(3);
    expect(requestToolNames(firstRequests[0]!)).toEqual(['discover_tools']);
    const discoveredToolNames = discoveredNames(toolResult(firstRequests[1]!, 'call-discover'));
    expect(discoveredToolNames).toEqual(DISCOVERED_TRAFFIC_TOOL_NAMES);
    expect(requestToolNames(firstRequests[1]!)).toEqual([
      'discover_tools',
      ...DISCOVERED_TRAFFIC_TOOL_NAMES,
    ]);
    const bodyId = responseBodyId(toolResult(firstRequests[2]!, 'call-detail'));

    // 用户操作：同一Chat按真实bodyId读取有限正文，并分页读取全部与单方向WebSocket消息。
    // User action: read a bounded body by its real bodyId, then page all and one-direction WebSocket messages in the same Chat.
    const bodyOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-body-first',
      name: 'capture_get_exchange_body',
      arguments: { exchangeId: httpExchangeId, bodyId, offset: 0, length: 10 },
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-body-rest',
      name: 'capture_get_exchange_body',
      arguments: { exchangeId: httpExchangeId, bodyId, offset: 10, length: 65_536 },
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-ws-all',
      name: 'capture_list_websocket_messages',
      arguments: { exchangeId: webSocketExchangeId, limit: 200 },
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-ws-client',
      name: 'capture_list_websocket_messages',
      arguments: { exchangeId: webSocketExchangeId, direction: 'client-to-server', limit: 200 },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [BODY_ANSWER] });
    await completeMessage(desktopApp.page, BODY_PROMPT);
    const bodyRequests = openAiCompatibleLab.requestsForAssertions().slice(bodyOffset);
    expect(bodyRequests).toHaveLength(5);
    const firstBodyValue = successfulValue(
      toolResult(bodyRequests[1]!, 'call-body-first'),
      'call-body-first',
    );
    const restBodyValue = successfulValue(
      toolResult(bodyRequests[2]!, 'call-body-rest'),
      'call-body-rest',
    );
    expect(firstBodyValue).toMatchObject({
      bodyId,
      offset: 0,
      end: false,
      decodeStatus: 'limited',
      bytesRead: 10,
      truncated: false,
    });
    expect(restBodyValue).toMatchObject({
      bodyId,
      offset: 10,
      end: true,
      decodeStatus: 'skipped',
      truncated: false,
    });
    expect(`${String(firstBodyValue.text)}${String(restBodyValue.text)}`)
      .toBe('{"ready":true,"items":[1,2,3]}');
    const webSocketValue = successfulValue(
      toolResult(bodyRequests[3]!, 'call-ws-all'),
      'call-ws-all',
    );
    const webSocketItems = arrayField(webSocketValue, 'items');
    expect(webSocketItems.length).toBeGreaterThanOrEqual(3);
    expect(new Set(webSocketItems.flatMap((item) => (
      isRecord(item) && typeof item.direction === 'string' ? [item.direction] : []
    )))).toEqual(new Set(['client-to-server', 'server-to-client']));
    const clientValue = successfulValue(
      toolResult(bodyRequests[4]!, 'call-ws-client'),
      'call-ws-client',
    );
    expect(arrayField(clientValue, 'items').every((item) => (
      isRecord(item) && item.direction === 'client-to-server'
    ))).toBe(true);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-body-first'),
    )).toHaveAttribute('data-summary-kind', 'body');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-ws-all'),
    )).toHaveAttribute('data-summary-kind', 'websocket');
    await screenshotStep('用户操作：同一Chat按真实bodyId读取有限正文，并分页读取全部与单方向WebSocket消息。 / User action: read a bounded body by its real bodyId, then page all and one-direction WebSocket messages in the same Chat.');

    // 准备：完全通过产品Certificates UI启用localhost解密，再运行正式Playground gRPC场景。
    // Arrange: enable localhost decryption entirely through product Certificates UI, then run the official Playground gRPC scenario.
    tlsStateTouched = true;
    await enableHttpsDecryption(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await runPlaygroundCaptureScenario(browserPage, 'grpc-unary-json');
    const grpcExchangeId = await capturedExchangeId(desktopApp.page, GRPC_PATH);
    await screenshotStep('准备：完全通过产品Certificates UI启用localhost解密，再运行正式Playground gRPC场景。 / Arrange: enable localhost decryption entirely through product Certificates UI, then run the official Playground gRPC scenario.');

    // 用户操作与断言：读取gRPC两侧envelope元数据，验证side、offset、length与完成状态。
    // User action and assertions: read both gRPC envelope sides and verify side, offset, length, and completion state.
    const grpcOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-grpc-request',
      name: 'capture_list_grpc_messages',
      arguments: { exchangeId: grpcExchangeId, side: 'request', limit: 200 },
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'call-grpc-response',
      name: 'capture_list_grpc_messages',
      arguments: { exchangeId: grpcExchangeId, side: 'response', limit: 200 },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [GRPC_ANSWER] });
    await completeMessage(desktopApp.page, GRPC_PROMPT);
    const grpcRequests = openAiCompatibleLab.requestsForAssertions().slice(grpcOffset);
    expect(grpcRequests).toHaveLength(3);
    const grpcRequestValue = successfulValue(
      toolResult(grpcRequests[1]!, 'call-grpc-request'),
      'call-grpc-request',
    );
    const grpcResponseValue = successfulValue(
      toolResult(grpcRequests[2]!, 'call-grpc-response'),
      'call-grpc-response',
    );
    expect(grpcRequestValue).toMatchObject({
      recognized: true,
      side: 'request',
      hasMore: false,
    });
    expect(grpcResponseValue).toMatchObject({
      recognized: true,
      side: 'response',
      hasMore: false,
    });
    for (const item of [
      ...arrayField(grpcRequestValue, 'items'),
      ...arrayField(grpcResponseValue, 'items'),
    ]) {
      expect(item).toMatchObject({
        envelopeOffset: expect.any(Number),
        payloadOffset: expect.any(Number),
        payloadLength: expect.any(Number),
        compressed: false,
        truncated: false,
      });
    }
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-grpc-response'),
    )).toHaveAttribute('data-summary-kind', 'grpc');
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await screenshotStep('用户操作与断言：读取gRPC两侧envelope元数据，验证side、offset、length与完成状态。 / User action and assertions: read both gRPC envelope sides and verify side, offset, length, and completion state.');

    // 清理特权状态：在重启前经产品UI关闭MITM、移除例外、卸载并删除本轮CA。
    // Privileged cleanup: before restart, disable MITM, remove the exception, uninstall and delete this CA through product UI.
    await disableHttpsDecryption(desktopApp.page);
    tlsStateTouched = false;
    desktopApp.releasePreservedUserData();
    await browser.close();
    browser = null;

    // 重启：恢复完整Tool轨迹但不重放Model或Tool调用。
    // Restart: restore the complete Tool trace without replaying any Model or Tool call.
    const requestCountBeforeRestart = openAiCompatibleLab.evidence().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo, sensitiveTexts);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of sensitiveTexts) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    const restartRequestCount = openAiCompatibleLab.evidence().length - requestCountBeforeRestart;
    expect(restartRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const callId of ['call-body-first', 'call-body-rest', 'call-ws-all', 'call-grpc-response']) {
      await expect(getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolResult(callId),
      )).toBeVisible();
    }

    // 用户操作：关闭三项Agent开关后，新Chat不可发现也不可猜测调用；随后恢复全部开关。
    // User action: after disabling all three Agent switches, a new Chat cannot discover or guess-call them; restore every switch afterward.
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of NEW_TOOL_NAMES) {
      const toggle = getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolAgentSwitch(name),
      );
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'disabled-discover',
      name: 'discover_tools',
      arguments: { capabilityId: 'capture' },
    });
    for (const name of NEW_TOOL_NAMES) {
      openAiCompatibleLab.enqueueToolCall({
        callId: `disabled-${name}`,
        name,
        arguments: name === 'capture_get_exchange_body'
          ? { exchangeId: httpExchangeId, bodyId }
          : name === 'capture_list_websocket_messages'
            ? { exchangeId: webSocketExchangeId }
            : { exchangeId: grpcExchangeId, side: 'response' },
      });
    }
    openAiCompatibleLab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
    await completeMessage(relaunchedApp.page, DISABLED_PROMPT, true);
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(disabledRequests).toHaveLength(5);
    expect(discoveredNames(toolResult(disabledRequests[1]!, 'disabled-discover')))
      .toEqual(DISCOVERED_TRAFFIC_TOOL_NAMES.filter((name) => !NEW_TOOL_NAMES.includes(
        name as typeof NEW_TOOL_NAMES[number],
      )));
    const disabledErrorCodes = NEW_TOOL_NAMES.map((name, index) => {
      const result = toolResult(disabledRequests[index + 2]!, `disabled-${name}`);
      expect(result).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
      return isRecord(result.error) && typeof result.error.code === 'string'
        ? result.error.code
        : '';
    });
    for (const name of NEW_TOOL_NAMES) {
      const toggle = getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolAgentSwitch(name),
      );
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    await screenshotStep('用户操作：关闭三项Agent开关后，新Chat不可发现也不可猜测调用；随后恢复全部开关。 / User action: after disabling all three Agent switches, a new Chat cannot discover or guess-call them; restore every switch afterward.');

    // Evidence：只保存identity、计数、状态码和请求hash，不附加Prompt或正文。
    // Evidence: retain only identities, counts, status codes, and request hashes, never prompts or body content.
    const evidence: BodyMessagesEvidence = {
      bodyId,
      bodyBytesRead: (firstBodyValue.bytesRead as number) + (restBodyValue.bytesRead as number),
      disabledErrorCodes,
      discoveredToolNames,
      grpcExchangeId,
      grpcRequestCount: arrayField(grpcRequestValue, 'items').length,
      grpcResponseCount: arrayField(grpcResponseValue, 'items').length,
      httpExchangeId,
      restartRequestCount,
      webSocketExchangeId,
      webSocketMessageCount: webSocketItems.length,
    };
    const evidencePath = testInfo.outputPath('agent-tool-body-messages.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-body-messages.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
    await screenshotStep('Evidence：只保存identity、计数、状态码和请求hash，不附加Prompt或正文。 / Evidence: retain only identities, counts, status codes, and request hashes, never prompts or body content.');
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：任何阶段失败都先尝试恢复本轮TLS状态，再关闭Browser与活动Electron generation。
    // Teardown: on every failure, first try to restore this workflow's TLS state, then close Browser and the active Electron generation.
    if (tlsStateTouched && relaunchedApp === null) {
      try {
        await disableHttpsDecryption(desktopApp.page);
        tlsStateTouched = false;
        desktopApp.releasePreservedUserData();
      } catch (error) {
        cleanupError = error;
      }
    }
    if (relaunchedApp === null && workflowError !== undefined) {
      try {
        await closeGeneration(desktopApp, testInfo, sensitiveTexts, false);
      } catch (error) {
        cleanupError ??= error;
        await desktopApp.forceCleanup().catch(() => undefined);
      }
    }
    await browser?.close().catch((error) => {
      cleanupError ??= error;
    });
    if (relaunchedApp !== null) {
      try {
        await closeGeneration(
          relaunchedApp,
          testInfo,
          sensitiveTexts,
          workflowError === undefined,
        );
      } catch (error) {
        cleanupError ??= error;
        await relaunchedApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Body/message Tool workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});