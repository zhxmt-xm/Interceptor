import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const QUERY_SECRETS = ['one', 'two'].map((suffix) => ['diagnostics-secret', suffix].join('-'));
const REQUEST_PATHS = QUERY_SECRETS.map((secret, index) => (
  `/agent-e2e/diagnostics/${index + 1}?access_token=${secret}`
));
const FIRST_PROMPT = phrase('Inspect successful Composer diagnostics', 'without exposing request secrets.');
const FIRST_ANSWER = phrase('Four successful Composer diagnostic records', 'are available in newest-first order.');
const DISABLED_PROMPT = phrase('Try the disabled', 'Diagnostics Tool.');
const DISABLED_ANSWER = phrase('The Diagnostics Tool', 'is unavailable.');
const RESTORED_PROMPT = phrase('Discover the restored', 'Diagnostics Tool.');
const RESTORED_ANSWER = phrase('The Diagnostics Tool', 'is available again.');
const DIAGNOSTICS_TOOL_NAMES = ['diagnostics_query', 'diagnostics_get_trace', 'diagnostics_get_recent', 'diagnostics_export'] as const;
const SENSITIVE_TEXTS = [
  ...QUERY_SECRETS,
  ...REQUEST_PATHS,
  FIRST_PROMPT,
  FIRST_ANSWER,
  DISABLED_PROMPT,
  DISABLED_ANSWER,
  RESTORED_PROMPT,
  RESTORED_ANSWER,
];

interface DiagnosticsToolEvidence {
  readonly recordCount: number;
  readonly recordSequences: readonly number[];
  readonly commands: readonly string[];
  readonly processes: readonly string[];
  readonly outcomes: readonly string[];
  readonly hasMore: boolean;
  readonly droppedCount: number;
  readonly firstRequestToolNames: readonly string[];
  readonly disclosedToolNames: readonly string[];
  readonly restartModelRequestCount: number;
  readonly restartOriginRequestCount: number;
  readonly disabledDiscoveryNames: readonly string[];
  readonly disabledErrorCode: string;
  readonly restoredDiscoveryNames: readonly string[];
  readonly requestBodyHashes: readonly string[];
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName)
    .fill('Diagnostics Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('diagnostics-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId)
    .fill('diagnostics-tool-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Send one direct request through the real Composer UI and wait for the origin. */
async function sendComposerRequest(
  page: Page,
  loopbackLab: HttpTrafficRunner,
  requestPath: string,
): Promise<void> {
  const send = getByAutomationId(page, AUTOMATION_IDS.composer.send);
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(requestPath));
  await send.click();
  await expect.poll(() => loopbackLab.observation(requestPath)?.method).toBe('GET');
  await expect(send).toBeEnabled();
}

/** Queue discovery, one filtered query, and the final answer. */
function enqueueFirstTurn(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'diagnostics-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'diagnostics' },
  });
  lab.enqueueToolCall({
    callId: 'diagnostics-query',
    name: 'diagnostics_query',
    arguments: {
      process: 'core',
      command: 'composer.send',
      outcome: 'success',
      limit: 10,
    },
  });
  lab.enqueueTurn({ textChunks: [FIRST_ANSWER] });
}

/** Queue discovery followed by a deliberate call to the disabled Tool. */
function enqueueDisabledTurn(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'disabled-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'diagnostics' },
  });
  lab.enqueueToolCall({
    callId: 'disabled-query',
    name: 'diagnostics_query',
    arguments: { command: 'composer.send', limit: 10 },
  });
  lab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
}

/** Queue discovery after Settings enables the Tool again. */
function enqueueRestoredTurn(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'restored-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'diagnostics' },
  });
  lab.enqueueTurn({ textChunks: [RESTORED_ANSWER] });
}

/** Create a new Chat, send one prompt, and wait for durable completion. */
async function completeNewChat(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
}

/** Return Model-visible Tool names from one captured Chat Completions request. */
function requestToolNames(request: Readonly<Record<string, unknown>>): string[] {
  if (!Array.isArray(request.tools)) return [];
  return request.tools.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return [];
    return typeof entry.function.name === 'string' ? [entry.function.name] : [];
  });
}

/** Parse one normalized Tool Result from Provider history. */
function toolResult(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  if (!Array.isArray(request.messages)) throw new Error('Provider request has no messages.');
  const message = request.messages.find((entry) => (
    isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
  ));
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error(`Provider request has no Tool Result ${callId}.`);
  }
  const parsed: unknown = JSON.parse(message.content);
  if (!isRecord(parsed)) throw new Error(`Tool Result ${callId} is not an object.`);
  return parsed;
}

/** Return one successful Tool Result value. */
function successfulValue(
  request: Readonly<Record<string, unknown>>,
  callId: string,
): Readonly<Record<string, unknown>> {
  const result = toolResult(request, callId);
  if (result.ok !== true || !isRecord(result.value)) {
    throw new Error(`Tool Result ${callId} was not successful.`);
  }
  return result.value;
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

/** Open Agent Settings and wait for Tool capability state. */
async function openAgentSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.tools.capabilities)).toBeVisible();
}

/** Read ordered Tool names from the public Transcript contract. */
async function transcriptToolNames(page: Page): Promise<string[]> {
  return getByAutomationId(page, AUTOMATION_IDS.agent.tools.activity)
    .locator('[data-tool-name]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-tool-name') ?? ''));
}

/** Close one App generation with process, trace, and sensitive-evidence verification. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  try {
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    for (const text of SENSITIVE_TEXTS) {
      await desktopApp.assertSensitiveTextAbsentFromEvidence(text);
    }
    await desktopApp.writeEvidence(testInfo);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('agent.tools.diagnostics queries real redacted records in stable order', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.diagnostics',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  try {
    // 准备：经产品Settings配置Provider；停止trace后由Composer UI发送两次带敏感query的真实请求。
    // Arrange: configure the Provider through Settings; after stopping trace, send two real requests with sensitive queries through Composer UI.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.composer).click();
    for (const requestPath of REQUEST_PATHS) {
      await sendComposerRequest(desktopApp.page, loopbackLab, requestPath);
    }
    const originRequestCount = loopbackLab.evidence().length;
    expect(originRequestCount).toBe(2);

    // 业务断言：Diagnostics UI必须先看到两组composer.send记录，查询本身不得制造记录。
    // Business assertion: Diagnostics UI must first observe two composer.send groups without the query recording itself.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
    const composerRows = desktopApp.page.getByRole('button').filter({ hasText: 'composer.send' });
    await expect.poll(() => composerRows.count()).toBe(2);
    await screenshotStep('业务断言：Diagnostics UI必须先看到两组composer.send记录，查询本身不得制造记录。 / Business assertion: Diagnostics UI must first observe two composer.send groups without the query recording itself.');

    // 用户操作：默认Ask Chat依次发现Diagnostics并执行组合过滤query，不出现change审批。
    // User actions: a default Ask Chat discovers Diagnostics and runs the filtered query without change approval.
    enqueueFirstTurn(openAiCompatibleLab);
    const firstRequestOffset = openAiCompatibleLab.requestsForAssertions().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await completeNewChat(desktopApp.page, FIRST_PROMPT);
    const sessionRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root);
    await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'ask');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('diagnostics-query'),
    )).toHaveCount(0);
    await expect(desktopApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(FIRST_ANSWER);
    expect(await transcriptToolNames(desktopApp.page)).toEqual([
      'discover_tools',
      'diagnostics_query',
    ]);
    await screenshotStep('用户操作：默认Ask Chat依次发现Diagnostics并执行组合过滤query，不出现change审批。 / User actions: a default Ask Chat discovers Diagnostics and runs the filtered query without change approval.');

    // 业务断言：首次仅有discovery；两次请求各有action和command记录，最新优先且不含Composer敏感输入。
    // Business assertions: only discovery is initially exposed; each request has action and command records, newest first and free of sensitive Composer input.
    const firstRequests = openAiCompatibleLab.requestsForAssertions().slice(firstRequestOffset);
    expect(firstRequests).toHaveLength(3);
    const firstRequestToolNames = requestToolNames(firstRequests[0]!);
    const disclosedToolNames = requestToolNames(firstRequests[1]!);
    expect(firstRequestToolNames).toEqual(['discover_tools']);
    expect(disclosedToolNames).toEqual(['discover_tools', ...DIAGNOSTICS_TOOL_NAMES]);
    expect(requestToolNames(firstRequests[2]!)).toEqual(disclosedToolNames);
    expect(discoveredNames(toolResult(firstRequests[1]!, 'diagnostics-discover')))
      .toEqual(DIAGNOSTICS_TOOL_NAMES);
    const queryValue = successfulValue(firstRequests[2]!, 'diagnostics-query');
    if (!Array.isArray(queryValue.records)) {
      throw new Error('Diagnostics Tool Result has no records.');
    }
    const records = queryValue.records.filter(isRecord);
    expect(records).toHaveLength(4);
    const sequences = records.map((record) => record.sequence);
    expect(sequences.every((sequence) => typeof sequence === 'number')).toBe(true);
    expect(sequences).toEqual([...sequences].sort((left, right) => Number(right) - Number(left)));
    expect(new Set(sequences).size).toBe(4);
    expect(records.map((record) => record.command)).toEqual(Array(4).fill('composer.send'));
    expect(records.map((record) => record.process)).toEqual(Array(4).fill('core'));
    expect(records.map((record) => record.outcome)).toEqual(Array(4).fill('success'));
    expect(records.map((record) => record.phase)).toEqual([
      'command.completed',
      'action.completed',
      'command.completed',
      'action.completed',
    ]);
    expect(records[0]!.traceId).toBe(records[1]!.traceId);
    expect(records[2]!.traceId).toBe(records[3]!.traceId);
    expect(records[0]!.traceId).not.toBe(records[2]!.traceId);
    expect(queryValue.hasMore).toBe(false);
    expect(queryValue.droppedCount).toBe(0);
    const serializedQueryValue = JSON.stringify(queryValue);
    for (const secret of [...QUERY_SECRETS, ...REQUEST_PATHS]) {
      expect(serializedQueryValue).not.toContain(secret);
    }
    const querySummary = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('diagnostics-query'),
    );
    await expect(querySummary).toHaveAttribute('data-summary-kind', 'diagnostics');
    await expect(querySummary).toHaveAttribute('data-diagnostics-count', '4');
    await expect(querySummary).toHaveAttribute('data-diagnostics-has-more', 'false');
    await expect(querySummary).toHaveAttribute('data-diagnostics-dropped-count', '0');
    await screenshotStep('业务断言：首次仅有discovery；两次请求各有action和command记录，最新优先且不含Composer敏感输入。 / Business assertions: only discovery is initially exposed; each request has action and command records, newest first and free of sensitive Composer input.');

    // 重启：隐藏敏感Transcript并完整销毁第一代；同profile恢复轨迹但不重放Model、Tool或Composer请求。
    // Restart: hide the sensitive Transcript and fully destroy generation one; restore it without replaying Model, Tool, or Composer requests.
    const modelRequestCountBeforeRestart = openAiCompatibleLab.evidence().length;
    const originRequestCountBeforeRestart = loopbackLab.evidence().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of SENSITIVE_TEXTS) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    const restartModelRequestCount = openAiCompatibleLab.evidence().length
      - modelRequestCountBeforeRestart;
    const restartOriginRequestCount = loopbackLab.evidence().length
      - originRequestCountBeforeRestart;
    expect(restartModelRequestCount).toBe(0);
    expect(restartOriginRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    expect(await transcriptToolNames(relaunchedApp.page)).toEqual([
      'discover_tools',
      'diagnostics_query',
    ]);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(FIRST_ANSWER);

    // 用户操作：关闭全部Diagnostics Tool后验证discovery与原查询不可达，再整组开启并恢复discovery。
    // User actions: disable every Diagnostics Tool, verify discovery and the original query are inaccessible, then restore the entire group.
    await openAgentSettings(relaunchedApp.page);
    for (const name of DIAGNOSTICS_TOOL_NAMES) {
      const diagnosticsSwitch = getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name));
      await diagnosticsSwitch.click();
      await expect(diagnosticsSwitch).toHaveAttribute('aria-checked', 'false');
    }
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueDisabledTurn(openAiCompatibleLab);
    await completeNewChat(relaunchedApp.page, DISABLED_PROMPT);
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(disabledRequests).toHaveLength(3);
    const disabledDiscoveryNames = discoveredNames(
      toolResult(disabledRequests[1]!, 'disabled-discover'),
    );
    expect(disabledDiscoveryNames).toEqual([]);
    expect(requestToolNames(disabledRequests[1]!)).toEqual(['discover_tools']);
    const disabledResult = toolResult(disabledRequests[2]!, 'disabled-query');
    expect(disabledResult).toMatchObject({
      ok: false,
      error: { code: 'unknown_tool' },
    });
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolCall('disabled-query'),
    )).toHaveAttribute('data-tool-status', 'failed');

    for (const name of DIAGNOSTICS_TOOL_NAMES) {
      const diagnosticsSwitch = getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name));
      await diagnosticsSwitch.click();
      await expect(diagnosticsSwitch).toHaveAttribute('aria-checked', 'true');
    }
    const restoredOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueRestoredTurn(openAiCompatibleLab);
    await completeNewChat(relaunchedApp.page, RESTORED_PROMPT);
    const restoredRequests = openAiCompatibleLab.requestsForAssertions().slice(restoredOffset);
    expect(restoredRequests).toHaveLength(2);
    const restoredDiscoveryNames = discoveredNames(
      toolResult(restoredRequests[1]!, 'restored-discover'),
    );
    expect(restoredDiscoveryNames).toEqual(DIAGNOSTICS_TOOL_NAMES);
    await screenshotStep('用户操作：关闭全部Diagnostics Tool后验证discovery与原查询不可达，再整组开启并恢复discovery。 / User actions: disable every Diagnostics Tool, verify discovery and the original query are inaccessible, then restore the entire group.');

    // 证据与销毁：只写计数、顺序、协议字段和request hash；关闭Panel后恢复trace并完整销毁第二代。
    // Evidence and teardown: write only counts, order, protocol fields, and request hashes; hide the Panel before final teardown.
    const evidence: DiagnosticsToolEvidence = {
      recordCount: records.length,
      recordSequences: sequences.map(Number),
      commands: records.map((record) => String(record.command)),
      processes: records.map((record) => String(record.process)),
      outcomes: records.map((record) => String(record.outcome)),
      hasMore: queryValue.hasMore === true,
      droppedCount: Number(queryValue.droppedCount),
      firstRequestToolNames,
      disclosedToolNames,
      restartModelRequestCount,
      restartOriginRequestCount,
      disabledDiscoveryNames,
      disabledErrorCode: isRecord(disabledResult.error)
        ? String(disabledResult.error.code)
        : '',
      restoredDiscoveryNames,
      requestBodyHashes: openAiCompatibleLab.evidence()
        .map((observation) => observation.requestBodyHash),
    };
    const evidencePath = testInfo.outputPath('agent-tool-diagnostics.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-diagnostics.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await relaunchedApp.startTrace(testInfo);
    await screenshotStep('证据与销毁：只写计数、顺序、协议字段和request hash；关闭Panel后恢复trace并完整销毁第二代。 / Evidence and teardown: write only counts, order, protocol fields, and request hashes; hide the Panel before final teardown.');
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
    } else {
      try {
        await desktopApp.stopTrace(testInfo);
        await desktopApp.closeGracefully();
        await desktopApp.writeEvidence(testInfo);
      } catch (error) {
        cleanupError = error;
      } finally {
        await desktopApp.forceCleanup();
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Diagnostics Tool workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});