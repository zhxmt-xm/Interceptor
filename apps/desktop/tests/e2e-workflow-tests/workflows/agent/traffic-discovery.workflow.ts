import { createHash } from 'node:crypto';
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
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

const REQUEST_PATH = '/agent-e2e/traffic';
const phrase = (...parts: readonly string[]): string => parts.join(' ');
const FIRST_PROMPT = phrase('Inspect Capture storage and the latest', 'captured request, then', 'summarize their status.');
const FIRST_ANSWER_PREFIX = phrase('The latest', 'exchange is');
const DISABLED_PROMPT = phrase('Try the disabled', 'storage Tool.');
const DISABLED_ANSWER = phrase('The storage Tool', 'is unavailable.');
const RESTORED_PROMPT = phrase('Discover the restored', 'storage Tool.');
const RESTORED_ANSWER = phrase('The storage Tool', 'is available again.');
const FIRST_CALLS = [
  ['call-discover', 'discover_tools'],
  ['call-storage', 'get_storage_status'],
  ['call-proxy', 'get_proxy_status'],
  ['call-list', 'list_exchanges'],
  ['call-detail', 'get_exchange'],
] as const;
const SENSITIVE_TEXTS = [
  FIRST_PROMPT,
  DISABLED_PROMPT,
  DISABLED_ANSWER,
  RESTORED_PROMPT,
  RESTORED_ANSWER,
];

interface TrafficToolEvidence {
  exchangeId: string;
  firstCallNames: readonly string[];
  firstRequestToolNames: readonly string[];
  disclosedToolNames: readonly string[];
  restartRequestCount: number;
  disabledDiscoveryNames: readonly string[];
  disabledErrorCode: string;
  restoredDiscoveryNames: readonly string[];
  storageStatus: StorageStatusEvidence | null;
  requestBodyHashes: readonly string[];
}

interface StorageStatusEvidence {
  readonly sessionCount: number;
  readonly exchangeCount: number;
  readonly bodyCount: number;
  readonly databaseBytes: number;
  readonly blobBytes: number;
  readonly totalBytes: number;
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Traffic Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('traffic-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('traffic-tool-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Extract the Core-owned exchange ID from a public Capture row. */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

/** Queue the complete first discovery and four-query model sequence. */
function enqueueFirstTurn(lab: OpenAiCompatibleLab, capturedExchangeId: string): string {
  lab.enqueueToolCall({
    callId: 'call-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'traffic' },
  });
  lab.enqueueToolCall({ callId: 'call-storage', name: 'get_storage_status', arguments: {} });
  lab.enqueueToolCall({ callId: 'call-proxy', name: 'get_proxy_status', arguments: {} });
  lab.enqueueToolCall({
    callId: 'call-list',
    name: 'list_exchanges',
    arguments: { search: REQUEST_PATH, limit: 10 },
  });
  lab.enqueueToolCall({
    callId: 'call-detail',
    name: 'get_exchange',
    arguments: { exchangeId: capturedExchangeId },
  });
  const answer = `Capture storage is non-empty. ${FIRST_ANSWER_PREFIX} ${capturedExchangeId}: GET ${REQUEST_PATH} 200.`;
  lab.enqueueTurn({ textChunks: [answer] });
  return answer;
}

/** Queue discovery followed by a deliberate call to a disabled Tool. */
function enqueueDisabledTurn(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'disabled-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'traffic' },
  });
  lab.enqueueToolCall({
    callId: 'disabled-storage',
    name: 'get_storage_status',
    arguments: {},
  });
  lab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
}

/** Queue discovery after Settings enables the Tool again. */
function enqueueRestoredTurn(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'restored-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'traffic' },
  });
  lab.enqueueTurn({ textChunks: [RESTORED_ANSWER] });
}

/** Create a new Chat, send one prompt and wait for durable completion. */
async function completeNewChat(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
}

/** Return model-visible Tool names from one captured Chat Completions request. */
function requestToolNames(request: Readonly<Record<string, unknown>>): string[] {
  if (!Array.isArray(request.tools)) return [];
  return request.tools.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return [];
    return typeof entry.function.name === 'string' ? [entry.function.name] : [];
  });
}

/** Return one correlated Tool message from a captured Provider request. */
function toolMessage(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  if (!Array.isArray(request.messages)) throw new Error('Provider request has no messages.');
  const message = request.messages.find((entry) => (
    isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
  ));
  if (!isRecord(message)) throw new Error(`Provider request has no Tool Result ${callId}.`);
  return message;
}

/** Parse one normalized Tool Result from Provider history. */
function toolResult(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  const content = toolMessage(request, callId).content;
  if (typeof content !== 'string') throw new Error(`Tool Result ${callId} has no content.`);
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) throw new Error(`Tool Result ${callId} is not an object.`);
  return parsed;
}

/** Return discovered descriptor names from one successful Tool Result. */
function discoveredNames(result: Readonly<Record<string, unknown>>): string[] {
  if (result.ok !== true || !isRecord(result.value) || !Array.isArray(result.value.matches)) {
    return [];
  }
  return result.value.matches.flatMap((match) => {
    if (!isRecord(match) || !isRecord(match.descriptor)) return [];
    return typeof match.descriptor.name === 'string' ? [match.descriptor.name] : [];
  });
}

/** Return whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read one required numeric field from a Tool Result. */
function numericField(value: Readonly<Record<string, unknown>>, name: string): number {
  const field = value[name];
  if (typeof field !== 'number') throw new Error(`Storage status ${name} is not numeric.`);
  return field;
}

/** Read ordered Tool names from the public Transcript contract. */
async function transcriptToolNames(page: Page): Promise<string[]> {
  return getByAutomationId(page, AUTOMATION_IDS.agent.tools.activity)
    .locator('[data-tool-name]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-tool-name') ?? ''));
}

/** Open Agent Settings and wait for Tool capability state. */
async function openAgentSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.tools.capabilities)).toBeVisible();
}

/** Close one app generation and preserve lifecycle evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  for (const text of SENSITIVE_TEXTS) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(text);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

test('agent.tools.traffic-discovery discovers, executes and restores query Tools', async ({
  desktopApp,
  loopbackLab,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.traffic-discovery',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let firstAnswer = '';
  const evidence: TrafficToolEvidence = {
    exchangeId: '',
    firstCallNames: [],
    firstRequestToolNames: [],
    disclosedToolNames: [],
    restartRequestCount: -1,
    disabledDiscoveryNames: [],
    disabledErrorCode: '',
    restoredDiscoveryNames: [],
    storageStatus: null,
    requestBodyHashes: [],
  };

  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  try {
    // 准备：经真实Settings配置本地Provider，再从Capture UI开始Recording并通过8888产生一条真实流量。
    // Arrange: configure the local Provider through Settings, start Recording in Capture and create real traffic through 8888.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    await expect(loopbackLab.requestThroughProxy(
      desktopApp.capturePort(),
      REQUEST_PATH,
    )).resolves.toMatchObject({ statusCode: 200 });
    const row = getByAutomationIdPrefix(
      desktopApp.page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    ).filter({ hasText: REQUEST_PATH }).last();
    await expect(row).toBeVisible();
    evidence.exchangeId = await exchangeId(row);

    // 用户操作：本地Model依次发现能力并调用四个query Tool；所有输入都来自产品UI与真实Capture。
    // User actions: the local Model discovers capabilities and calls four query Tools using only UI and real Capture input.
    const firstRequestOffset = openAiCompatibleLab.requestsForAssertions().length;
    firstAnswer = enqueueFirstTurn(openAiCompatibleLab, evidence.exchangeId);
    desktopApp.registerSensitiveTextForEvidenceAudit(firstAnswer);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await completeNewChat(desktopApp.page, FIRST_PROMPT);
    await expect(desktopApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(firstAnswer);
    evidence.firstCallNames = await transcriptToolNames(desktopApp.page);
    expect(evidence.firstCallNames).toEqual(FIRST_CALLS.map(([, name]) => name));
    for (const [callId] of FIRST_CALLS) {
      await expect(getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolCall(callId),
      )).toHaveAttribute('data-tool-status', 'completed');
      await expect(getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolResult(callId),
      )).toBeVisible();
    }

    // 业务断言：首次只披露discover_tools；发现后披露全部已接Traffic schema，仍只调用本workflow拥有的四项query。
    // Business assertions: initially disclose only discovery, then every connected Traffic schema while calling only this workflow's four queries.
    const firstRequests = openAiCompatibleLab.requestsForAssertions().slice(firstRequestOffset);
    expect(firstRequests).toHaveLength(6);
    evidence.firstRequestToolNames = requestToolNames(firstRequests[0]!);
    evidence.disclosedToolNames = requestToolNames(firstRequests[1]!);
    expect(evidence.firstRequestToolNames).toEqual(['discover_tools']);
    expect(evidence.disclosedToolNames).toEqual([
      'discover_tools',
      'get_proxy_status',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'stop_recording',
    ]);
    for (const names of firstRequests.slice(1).map(requestToolNames)) {
      expect(names).toEqual(evidence.disclosedToolNames);
    }
    const discoveryResult = toolResult(firstRequests[1]!, 'call-discover');
    expect(discoveredNames(discoveryResult)).toEqual([
      'get_proxy_status',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'stop_recording',
    ]);
    const storageResult = toolResult(firstRequests[2]!, 'call-storage');
    expect(storageResult).toMatchObject({
      ok: true,
      value: {
        sessionCount: expect.any(Number),
        exchangeCount: expect.any(Number),
        bodyCount: expect.any(Number),
        databaseBytes: expect.any(Number),
        blobBytes: expect.any(Number),
        totalBytes: expect.any(Number),
      },
    });
    const storageValue = storageResult.value;
    if (!isRecord(storageValue)) throw new Error('Storage Tool Result has no value.');
    const storageStatus: StorageStatusEvidence = {
      sessionCount: numericField(storageValue, 'sessionCount'),
      exchangeCount: numericField(storageValue, 'exchangeCount'),
      bodyCount: numericField(storageValue, 'bodyCount'),
      databaseBytes: numericField(storageValue, 'databaseBytes'),
      blobBytes: numericField(storageValue, 'blobBytes'),
      totalBytes: numericField(storageValue, 'totalBytes'),
    };
    evidence.storageStatus = storageStatus;
    expect(storageStatus.sessionCount).toBeGreaterThanOrEqual(1);
    expect(storageStatus.exchangeCount).toBeGreaterThanOrEqual(1);
    expect(storageStatus.bodyCount).toBeGreaterThanOrEqual(1);
    expect(storageStatus.blobBytes).toBeGreaterThan(0);
    expect(storageStatus.totalBytes).toBe(
      storageStatus.databaseBytes + storageStatus.blobBytes,
    );
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-storage'),
    )).toHaveAttribute('data-summary-kind', 'storage');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-storage'),
    )).toHaveAttribute('data-storage-exchange-count', String(storageStatus.exchangeCount));
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-storage'),
    )).toHaveAttribute('data-storage-body-count', String(storageStatus.bodyCount));
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-storage'),
    )).toHaveAttribute('data-storage-total-bytes', String(storageStatus.totalBytes));
    expect(toolResult(firstRequests[3]!, 'call-proxy')).toMatchObject({
      ok: true,
      value: {
        listening: true,
        recording: true,
        host: '127.0.0.1',
        port: 8888,
      },
    });
    const listResult = toolResult(firstRequests[4]!, 'call-list');
    expect(listResult).toMatchObject({
      ok: true,
      value: {
        items: [{
          id: evidence.exchangeId,
          method: 'GET',
          path: REQUEST_PATH,
          statusCode: 200,
        }],
        hasMore: false,
      },
    });
    const detailResult = toolResult(firstRequests[5]!, 'call-detail');
    expect(detailResult).toMatchObject({
      ok: true,
      value: {
        detail: {
          summary: {
            id: evidence.exchangeId,
            method: 'GET',
            path: REQUEST_PATH,
            statusCode: 200,
          },
          url: loopbackLab.url(REQUEST_PATH),
        },
      },
    });
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-detail'),
    )).toHaveAttribute('data-summary-kind', 'exchange');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('call-detail'),
    )).toContainText(`GET ${REQUEST_PATH} · 200`);
    expect(desktopApp.rendererPageErrors()).toEqual([]);

    // 重启：完整销毁第一代；同一profile恢复Tool轨迹和回答，启动不得重放Model或Tool调用。
    // Restart: fully destroy generation one; restore Tool history and the answer without replaying Model or Tool calls.
    const requestCountBeforeRestart = openAiCompatibleLab.evidence().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of [...SENSITIVE_TEXTS, firstAnswer]) {
      relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    }
    await relaunchedApp.waitUntilReady();
    evidence.restartRequestCount = openAiCompatibleLab.evidence().length - requestCountBeforeRestart;
    expect(evidence.restartRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    expect(await transcriptToolNames(relaunchedApp.page)).toEqual(evidence.firstCallNames);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(firstAnswer);

    // 用户操作：关闭get_storage_status后新建Chat；discovery与下一次schema都移除它，直接猜测调用得到unknown_tool。
    // User actions: disable get_storage_status in a new Chat; discovery and schemas omit it and a guessed call returns unknown_tool.
    await openAgentSettings(relaunchedApp.page);
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_storage_status'),
    ).click();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_storage_status'),
    )).toHaveAttribute('aria-checked', 'false');
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueDisabledTurn(openAiCompatibleLab);
    await completeNewChat(relaunchedApp.page, DISABLED_PROMPT);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(DISABLED_ANSWER);
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(disabledRequests).toHaveLength(3);
    evidence.disabledDiscoveryNames = discoveredNames(
      toolResult(disabledRequests[1]!, 'disabled-discover'),
    );
    expect(evidence.disabledDiscoveryNames).toEqual([
      'get_proxy_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'stop_recording',
    ]);
    expect(requestToolNames(disabledRequests[1]!)).toEqual([
      'discover_tools',
      'get_proxy_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'stop_recording',
    ]);
    const disabledResult = toolResult(disabledRequests[2]!, 'disabled-storage');
    expect(disabledResult).toMatchObject({
      ok: false,
      error: { code: 'unknown_tool' },
    });
    evidence.disabledErrorCode = isRecord(disabledResult.error)
      && typeof disabledResult.error.code === 'string'
      ? disabledResult.error.code
      : '';
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolCall('disabled-storage'),
    )).toHaveAttribute('data-tool-status', 'failed');

    // 用户操作：重新开启后再新建Chat，discovery与下一次schema必须恢复get_storage_status。
    // User actions: re-enable the Tool, then prove a new Chat discovers and receives its schema again.
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_storage_status'),
    ).click();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_storage_status'),
    )).toHaveAttribute('aria-checked', 'true');
    const restoredOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueRestoredTurn(openAiCompatibleLab);
    await completeNewChat(relaunchedApp.page, RESTORED_PROMPT);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(RESTORED_ANSWER);
    const restoredRequests = openAiCompatibleLab.requestsForAssertions().slice(restoredOffset);
    expect(restoredRequests).toHaveLength(2);
    evidence.restoredDiscoveryNames = discoveredNames(
      toolResult(restoredRequests[1]!, 'restored-discover'),
    );
    expect(evidence.restoredDiscoveryNames).toEqual([
      'get_proxy_status',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'stop_recording',
    ]);
    expect(requestToolNames(restoredRequests[1]!)).toEqual(evidence.disclosedToolNames);
    expect(relaunchedApp.rendererPageErrors()).toEqual([]);

    // 证据与销毁：只附加协议ID、schema名和请求hash；关闭含Transcript的Panel后恢复trace并完整销毁。
    // Evidence and teardown: attach only protocol IDs, schema names and request hashes; hide Transcript before tracing teardown.
    evidence.requestBodyHashes = openAiCompatibleLab.evidence()
      .map((observation) => observation.requestBodyHash);
    const evidencePath = testInfo.outputPath('agent-tool-traffic-discovery.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-traffic-discovery.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
  } catch (error) {
    workflowError = error;
  } finally {
    if (relaunchedApp !== null) {
      try {
        await closeGeneration(relaunchedApp, testInfo);
      } catch (error) {
        cleanupError = error;
        await relaunchedApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Traffic Tool workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
