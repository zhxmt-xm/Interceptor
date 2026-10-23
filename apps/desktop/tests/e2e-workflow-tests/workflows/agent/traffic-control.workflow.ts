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
} from '../../fixtures/ui/automation';
import { CaptureWorkflowFixture, startRecording } from '../../fixtures/ui/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { createWorkflowMcpClient } from '../../fixtures/ui/mcp-workflow';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const START_DENY_PROMPT = phrase('Keep recording paused', 'when asked to start it.');
const START_DENY_ANSWER = phrase('Recording stayed paused', 'after denial.');
const START_ALLOW_PROMPT = phrase('Start recording', 'after explicit approval.');
const START_ALLOW_ANSWER = phrase('Recording started', 'after approval.');
const START_AUTO_PROMPT = phrase('Start recording', 'using automatic execution.');
const START_AUTO_ANSWER = phrase('Recording started', 'automatically.');
const CLEAR_DENY_PROMPT = phrase('Inspect storage, then preserve', 'the current capture.');
const CLEAR_DENY_ANSWER = phrase('Capture was preserved', 'after denial.');
const CLEAR_ALLOW_PROMPT = phrase('Clear the current capture', 'after explicit approval.');
const CLEAR_ALLOW_ANSWER = phrase('Capture was cleared', 'after approval.');
const CLEAR_AUTO_PROMPT = phrase('Clear the current capture', 'using automatic execution.');
const CLEAR_AUTO_ANSWER = phrase('Capture was cleared', 'automatically.');
const DISABLED_PROMPT = phrase('Try both disabled', 'Traffic control Tools.');
const DISABLED_ANSWER = phrase('Both Traffic control Tools', 'are unavailable.');
const FIRST_CAPTURE_PATH = '/e2e/agent/traffic-control/first';
const SENSITIVE_TEXTS = [
  START_DENY_PROMPT,
  START_DENY_ANSWER,
  START_ALLOW_PROMPT,
  START_ALLOW_ANSWER,
  START_AUTO_PROMPT,
  START_AUTO_ANSWER,
  CLEAR_DENY_PROMPT,
  CLEAR_DENY_ANSWER,
  CLEAR_ALLOW_PROMPT,
  CLEAR_ALLOW_ANSWER,
  CLEAR_AUTO_PROMPT,
  CLEAR_AUTO_ANSWER,
  DISABLED_PROMPT,
  DISABLED_ANSWER,
];

interface TrafficControlEvidence {
  readonly clearEffect: {
    readonly bodyCount: number;
    readonly exchangeCount: number;
  };
  readonly deniedErrorCodes: readonly string[];
  readonly disabledErrorCodes: readonly string[];
  readonly immediateClearState: {
    readonly getOptions: number;
    readonly inspector: number;
    readonly methodGroupCount: string | null;
    readonly rows: number;
  };
  readonly restartRequestCount: number;
  readonly requestBodyHashes: readonly string[];
  readonly ruleHitAfterClear: string | null;
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName)
    .fill('Traffic control lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('traffic-control'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId)
    .fill('traffic-control-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Read the dynamic suffix from one public automation ID. */
async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Element did not expose automation prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create and apply one real header Rule through the Rules workspace. */
async function createHeaderRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await automationSuffix(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'),
  ).fill(FIRST_CAPTURE_PATH);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill('x-agent-traffic-control');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill('active');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state))
    .toHaveAttribute('data-state', 'applied');
  return ruleId;
}

/** Queue initial Traffic discovery followed by one change Tool and final answer. */
function enqueueDiscoveredChange(
  lab: OpenAiCompatibleLab,
  discoveryCallId: string,
  callId: string,
  name: 'capture_start_recording' | 'capture_clear',
  answer: string,
): void {
  lab.enqueueToolCall({
    callId: discoveryCallId,
    name: 'discover_tools',
    arguments: { capabilityId: 'capture' },
  });
  enqueueChange(lab, callId, name, answer);
}

/** Queue one change Tool and the final answer after its Result. */
function enqueueChange(
  lab: OpenAiCompatibleLab,
  callId: string,
  name: 'capture_start_recording' | 'capture_clear',
  answer: string,
): void {
  lab.enqueueToolCall({ callId, name, arguments: {} });
  lab.enqueueTurn({ textChunks: [answer] });
}

/** Queue storage inspection, Clear, and the final answer after its verdict. */
function enqueueInspectedClear(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({ callId: 'clear-storage', name: 'capture_get_storage_status', arguments: {} });
  enqueueChange(lab, 'clear-deny', 'capture_clear', CLEAR_DENY_ANSWER);
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

/** Return one successful Tool Result value. */
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

/** Return model-visible Tool names from one Chat Completions request. */
function requestToolNames(request: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(request.tools)) return [];
  return request.tools.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return [];
    return typeof entry.function.name === 'string' ? [entry.function.name] : [];
  });
}

/** Return whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Close one generation while preserving lifecycle and sensitive-data evidence. */
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

test('agent.tools.traffic-control synchronizes Recording and Capture cleanup', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.traffic-control',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let clearEffect = { bodyCount: -1, exchangeCount: -1 };
  const deniedErrorCodes: string[] = [];
  const disabledErrorCodes: string[] = [];
  let immediateClearState = {
    getOptions: -1,
    inspector: -1,
    methodGroupCount: null as string | null,
    rows: -1,
  };
  let restartRequestCount = -1;
  let ruleHitAfterClear: string | null = null;

  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  try {
    // 准备：通过真实Settings配置Provider、真实Rules UI创建规则，并从Capture UI进入暂停状态。
    // Arrange: configure the Provider in real Settings, create a Rule in real Rules UI, and pause through Capture UI.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    const ruleId = await createHeaderRule(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/agent/traffic-control');
    const expandedFacetToggles: Locator[] = [];
    const facetToggles = desktopApp.page.locator('[data-automation-id^="capture.filter.toggle."]');
    for (let index = 0; index < await facetToggles.count(); index += 1) {
      const toggle = facetToggles.nth(index);
      if (await toggle.getAttribute('aria-expanded') === 'true') {
        expandedFacetToggles.push(toggle);
        await toggle.click();
      }
    }
    await startRecording(desktopApp);
    const recording = getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.recordingToggle,
    );
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const sessionRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root);
    await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'ask');
    await desktopApp.stopTrace(testInfo);

    // 用户操作：capture_start_recording在Ask下分别Deny/Allow，再在Auto下无问询执行，Capture toggle始终同步。
    // User actions: capture_start_recording is denied and allowed in Ask, then runs without a prompt in Auto while the toggle stays synchronized.
    enqueueDiscoveredChange(
      openAiCompatibleLab,
      'start-discover',
      'start-deny',
      'capture_start_recording',
      START_DENY_ANSWER,
    );
    await sendMessage(desktopApp.page, START_DENY_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    const startDeniedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('start-deny'),
    );
    await expect(startDeniedApproval).toHaveAttribute('data-tool-name', 'capture_start_recording');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('start-deny'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    deniedErrorCodes.push(errorCode(
      openAiCompatibleLab.requestsForAssertions(),
      'start-deny',
    ));

    enqueueChange(
      openAiCompatibleLab,
      'start-allow',
      'capture_start_recording',
      START_ALLOW_ANSWER,
    );
    await sendMessage(desktopApp.page, START_ALLOW_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('start-allow'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('start-allow'),
    )).toHaveAttribute('data-summary-kind', 'proxy');

    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await setExecutionMode(desktopApp.page, 'auto');
    enqueueChange(
      openAiCompatibleLab,
      'start-auto',
      'capture_start_recording',
      START_AUTO_ANSWER,
    );
    await sendMessage(desktopApp.page, START_AUTO_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('start-auto'),
    )).toHaveCount(0);
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await setExecutionMode(desktopApp.page, 'ask');
    await screenshotStep('用户操作：capture_start_recording在Ask下分别Deny/Allow，再在Auto下无问询执行，Capture toggle始终同步。 / User actions: capture_start_recording is denied and allowed in Ask, then runs without a prompt in Auto while the toggle stays synchronized.');

    // Tool完成后Stop：取消后续模型解释，不撤销已经允许的暂停操作。
    // Stop after Tool completion: cancel the later explanation without undoing the allowed pause.
    openAiCompatibleLab.enqueueToolCall({ callId: 'stop-after-tool', name: 'capture_stop_recording', arguments: {} });
    openAiCompatibleLab.enqueueTurn({ textChunks: ['The owned pause has completed.'], holdOpen: true });
    await sendMessage(desktopApp.page, 'Pause recording, then explain until stopped.');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('stop-after-tool')))
      .toHaveAttribute('data-approval-status', 'pending');
    await screenshotStep('允许暂停后再继续模型解释 / Approve the pause before continuing the model explanation', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAllow('stop-after-tool')), label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAllow('stop-after-tool')).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.transcript)).toContainText('The owned pause has completed.');
    await screenshotStep('暂停已经完成，Stop只取消仍在生成的解释 / The pause is complete and Stop only cancels the ongoing explanation', {
      highlights: [
        { target: recording, label: '1' },
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.turn.stop), label: '2' },
      ],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.turn.stop).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'cancelled');
    await expect.poll(() => openAiCompatibleLab.evidence().at(-1)?.aborted).toBe(true);
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await screenshotStep('Stop模型回复不撤销已完成的暂停 / Stopping the model response does not undo a completed pause');
    openAiCompatibleLab.enqueueTurn({ textChunks: ['Explanation only; Recording remains paused.'] });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.turn.retry).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await screenshotStep('Retry只解释时不重复执行业务动作 / An explanation-only Retry does not repeat the business action');
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.clearSearch).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue('');
    for (const toggle of expandedFacetToggles) await toggle.click();

    // 准备与断言：真实GET建立row、selection、method facet和Rule hit，Clear的动态影响必须匹配当前storage。
    // Arrange and assert: a real GET creates a row, selection, method facet, and Rule hit; Clear must describe current storage counts.
    const firstCapture = await CaptureWorkflowFixture.captureAndSelect(
      desktopApp,
      loopbackLab,
      { requestPath: FIRST_CAPTURE_PATH, method: 'GET' },
    );
    await expect.poll(
      () => loopbackLab.observation(FIRST_CAPTURE_PATH)
        ?.headers['x-agent-traffic-control'],
    ).toBe('active');
    const methodToggle = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.captureFacetToggle('method'),
    );
    if (await methodToggle.getAttribute('aria-expanded') !== 'true') {
      await methodToggle.click();
    }
    const methodGroupCount = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.captureFacetGroupCount('method'),
    );
    const getOption = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.captureFacetOption('method', 'GET'),
    );
    const methodGroupCountBeforeClear = (
      await methodGroupCount.textContent()
    )?.trim() ?? '';
    expect(Number(methodGroupCountBeforeClear)).toBeGreaterThan(0);
    await getOption.click();
    await expect(firstCapture.row).toBeVisible();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    const ruleHitCount = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.ruleHitCount(ruleId),
    );
    await expect(ruleHitCount).toHaveAttribute('data-count', '1');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');

    enqueueInspectedClear(openAiCompatibleLab);
    await sendMessage(desktopApp.page, CLEAR_DENY_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    const clearDeniedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('clear-deny'),
    );
    const storage = successfulValue(
      openAiCompatibleLab.requestsForAssertions(),
      'clear-storage',
    );
    const effectMetadataJson = await clearDeniedApproval.getAttribute('data-effect-metadata');
    if (effectMetadataJson === null) {
      throw new Error('Clear approval did not expose structured effect metadata.');
    }
    const effectMetadata: unknown = JSON.parse(effectMetadataJson);
    if (!isRecord(effectMetadata)) {
      throw new Error('Clear approval effect metadata is invalid.');
    }
    clearEffect = {
      exchangeCount: Number(effectMetadata.exchangeCount),
      bodyCount: Number(effectMetadata.bodyCount),
    };
    expect(effectMetadata.scope).toBe('all');
    expect(clearEffect.exchangeCount).toBe(Number(storage.exchangeCount));
    expect(clearEffect.bodyCount).toBe(Number(storage.bodyCount));
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('clear-deny'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    deniedErrorCodes.push(errorCode(
      openAiCompatibleLab.requestsForAssertions(),
      'clear-deny',
    ));
    expect(deniedErrorCodes).toEqual(['tool_denied', 'tool_denied']);
    await expect(firstCapture.row).toBeVisible();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close))
      .toBeVisible();
    await expect.poll(async () => Number(await methodGroupCount.textContent()))
      .toBeGreaterThan(0);
    await expect(getOption).toBeVisible();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(ruleHitCount).toHaveAttribute('data-count', '1');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await desktopApp.stopTrace(testInfo);

    // 用户操作与业务断言：Allow和Auto都经同一reset清空所有镜像，且清空后Recording继续接收新流量。
    // User actions and assertions: Allow and Auto share one reset for every mirror, and Recording accepts new traffic after each clear.
    enqueueChange(
      openAiCompatibleLab,
      'clear-allow',
      'capture_clear',
      CLEAR_ALLOW_ANSWER,
    );
    await sendMessage(desktopApp.page, CLEAR_ALLOW_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('clear-allow'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const rows = getByAutomationIdPrefix(
      desktopApp.page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    );
    await expect(rows).toHaveCount(0);
    const clearAllowResult = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('clear-allow'),
    );
    await expect(clearAllowResult).toHaveAttribute('data-summary-kind', 'storage');
    await expect(clearAllowResult).toHaveAttribute('data-storage-exchange-count', '0');
    await expect(clearAllowResult).toHaveAttribute('data-storage-body-count', '0');
    immediateClearState = {
      rows: await rows.count(),
      inspector: await getByAutomationId(
        desktopApp.page,
        AUTOMATION_IDS.capture.inspector.close,
      ).count(),
      methodGroupCount: (await methodGroupCount.textContent())?.trim() ?? null,
      getOptions: await getOption.count(),
    };
    expect(immediateClearState).toEqual({
      rows: 0,
      inspector: 0,
      methodGroupCount: '0',
      getOptions: 0,
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(ruleHitCount).toHaveAttribute('data-count', '0');
    ruleHitAfterClear = await ruleHitCount.getAttribute('data-count');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');

    await CaptureWorkflowFixture.captureAndSelect(
      desktopApp,
      loopbackLab,
      { requestPath: '/e2e/agent/traffic-control/after-allow', method: 'GET' },
    );
    await setExecutionMode(desktopApp.page, 'auto');
    enqueueChange(
      openAiCompatibleLab,
      'clear-auto',
      'capture_clear',
      CLEAR_AUTO_ANSWER,
    );
    await sendMessage(desktopApp.page, CLEAR_AUTO_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('clear-auto'),
    )).toHaveCount(0);
    await expect(rows).toHaveCount(0);
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep('用户操作与业务断言：Allow和Auto都经同一reset清空所有镜像，且清空后Recording继续接收新流量。 / User actions and assertions: Allow and Auto share one reset for every mirror, and Recording accepts new traffic after each clear.');

    // 用户操作：关闭两项后schema和执行均拒绝；保留的row与暂停态证明没有触达业务命令。
    // User actions: disabling both removes their schemas and rejects execution; the retained row and paused state prove no business command ran.
    const preservedCapture = await CaptureWorkflowFixture.captureAndSelect(
      desktopApp,
      loopbackLab,
      { requestPath: '/e2e/agent/traffic-control/disabled-preserved', method: 'GET' },
    );
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const toolName of ['capture_start_recording', 'capture_clear'] as const) {
      await getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolAgentSwitch(toolName),
      ).click();
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'disabled-start',
      name: 'capture_start_recording',
      arguments: {},
    });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'disabled-clear',
      name: 'capture_clear',
      arguments: {},
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
    await sendMessage(desktopApp.page, DISABLED_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(requestToolNames(disabledRequests[0]!)).not.toContain('capture_start_recording');
    expect(requestToolNames(disabledRequests[0]!)).not.toContain('capture_clear');
    disabledErrorCodes.push(
      errorCode(disabledRequests, 'disabled-start'),
      errorCode(disabledRequests, 'disabled-clear'),
    );
    expect(disabledErrorCodes).toEqual(['unknown_tool', 'unknown_tool']);
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await expect(preservedCapture.row).toBeVisible();
    await screenshotStep('用户操作：关闭两项后schema和执行均拒绝；保留的row与暂停态证明没有触达业务命令。 / User actions: disabling both removes their schemas and rejects execution; the retained row and paused state prove no business command ran.');

    // 重启与销毁：同profile恢复Auto和关闭项且零重放，再经公开UI恢复设置并完整审计两代进程。
    // Restart and teardown: the same profile restores Auto and disabled Tools with zero replay, then public UI restores settings and audits both generations.
    const requestCountBeforeRestart = openAiCompatibleLab.evidence().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of SENSITIVE_TEXTS) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    restartRequestCount = openAiCompatibleLab.evidence().length - requestCountBeforeRestart;
    expect(restartRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.session.root))
      .toHaveAttribute('data-tool-execution-mode', 'auto');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolApproval('clear-deny'),
    )).toHaveAttribute('data-effect-metadata', JSON.stringify({
      scope: 'all',
      exchangeCount: clearEffect.exchangeCount,
      bodyCount: clearEffect.bodyCount,
    }));
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const toolName of ['capture_start_recording', 'capture_clear'] as const) {
      const toolSwitch = getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolAgentSwitch(toolName),
      );
      await expect(toolSwitch).toHaveAttribute('aria-checked', 'false');
      await toolSwitch.click();
    }
    await setExecutionMode(relaunchedApp.page, 'ask');

    const evidence: TrafficControlEvidence = {
      clearEffect,
      deniedErrorCodes,
      disabledErrorCodes,
      immediateClearState,
      restartRequestCount,
      requestBodyHashes: openAiCompatibleLab.evidence()
        .map((observation) => observation.requestBodyHash),
      ruleHitAfterClear,
    };
    const evidencePath = testInfo.outputPath('agent-tool-traffic-control.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-traffic-control.json', {
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
    } else {
      try {
        await closeGeneration(desktopApp, testInfo);
      } catch (error) {
        cleanupError = error;
        await desktopApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError(
      [workflowError, cleanupError],
      'Agent Traffic control workflow and cleanup failed.',
    );
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});

test('capture.start-recording executes through the current MCP Host', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(120_000);
  const { page } = desktopApp;
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  let client: Awaited<ReturnType<typeof createWorkflowMcpClient>>['client'] | null = null;

  const pauseRecording = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    if (await recording.getAttribute('aria-pressed') === 'true') {
      await expect(recording).toHaveAttribute('aria-busy', 'false');
      await recording.click();
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    }
  };

  try {
    await pauseRecording();
    const configured = await createWorkflowMcpClient(
      desktopApp,
      testInfo,
      'Capture start current Host',
      'capture-start-recording',
    );
    client = configured.client;
    const [askResult] = await Promise.all([
      client.callTool({ name: 'capture_start_recording', arguments: {} }),
      (async () => {
        await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root))
          .toHaveAttribute('data-tool-name', 'capture_start_recording');
        await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      })(),
    ]);
    expect(askResult.isError).not.toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');

    await pauseRecording();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await automaticallyExecuteMcpClientTools(page, configured.clientId);
    const autoResult = await client.callTool({
      name: 'capture_start_recording',
      arguments: {},
    });
    expect(autoResult.isError).not.toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    await pauseRecording();

    await testInfo.attach('capture-start-recording-current-host.json', {
      body: Buffer.from(JSON.stringify({
        ask: true,
        auto: true,
        restoredPaused: true,
      })),
      contentType: 'application/json',
    });
  } finally {
    await pauseRecording();
    await client?.close();
  }
});