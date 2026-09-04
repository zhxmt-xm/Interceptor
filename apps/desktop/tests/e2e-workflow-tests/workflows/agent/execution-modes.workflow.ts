import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const DENY_PROMPT = phrase('Keep capture active', 'and ask before changing it.');
const DENY_ANSWER = phrase('Capture remains active', 'after denial.');
const ALLOW_PROMPT = phrase('Pause capture', 'after explicit approval.');
const ALLOW_ANSWER = phrase('Capture is now paused', 'after approval.');
const AUTO_PROMPT = phrase('Pause capture', 'using this Chat mode.');
const AUTO_ANSWER = phrase('Capture was paused', 'automatically.');
const DISABLED_PROMPT = phrase('Try the disabled', 'recording Tool.');
const DISABLED_ANSWER = phrase('The recording Tool', 'is unavailable.');
const SENSITIVE_TEXTS = [
  DENY_PROMPT,
  DENY_ANSWER,
  ALLOW_PROMPT,
  ALLOW_ANSWER,
  AUTO_PROMPT,
  AUTO_ANSWER,
  DISABLED_PROMPT,
  DISABLED_ANSWER,
];

interface ExecutionModeEvidence {
  readonly deniedErrorCode: string;
  readonly disabledErrorCode: string;
  readonly firstSessionId: string;
  readonly newSessionDefaultMode: string;
  readonly restartRequestCount: number;
  readonly requestBodyHashes: readonly string[];
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Execution mode lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('execution-modes'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('execution-mode-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Queue discovery, one capture_stop_recording call and the answer after its Result. */
function enqueueDiscoveredStop(
  lab: OpenAiCompatibleLab,
  discoveryCallId: string,
  stopCallId: string,
  answer: string,
): void {
  lab.enqueueToolCall({
    callId: discoveryCallId,
    name: 'discover_tools',
    arguments: { capabilityId: 'capture' },
  });
  enqueueStop(lab, stopCallId, answer);
}

/** Queue one capture_stop_recording call and its following final answer. */
function enqueueStop(lab: OpenAiCompatibleLab, callId: string, answer: string): void {
  lab.enqueueToolCall({ callId, name: 'capture_stop_recording', arguments: {} });
  lab.enqueueTurn({ textChunks: [answer] });
}

/** Send one user message through the current Chat. */
async function sendMessage(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

/** Read the current Session ID from its public Renderer state. */
async function currentSessionId(page: Page): Promise<string> {
  const sessionId = await getByAutomationId(page, AUTOMATION_IDS.agent.session.root)
    .getAttribute('data-session-id');
  if (!sessionId) throw new Error('Agent Session root did not expose its Session ID.');
  return sessionId;
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

/** Resume Capture through the same public recording control. */
async function resumeRecording(page: Page): Promise<void> {
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') return;
  await recording.click();
  const readinessEnable = getByAutomationId(page, AUTOMATION_IDS.capture.readiness.enable);
  await readinessEnable.waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => readinessEnable.click())
    .catch(() => undefined);
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
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

test('agent.tools.execution-modes gates change Tools per Session and persists state', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.execution-modes',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let deniedErrorCode = '';
  let disabledErrorCode = '';
  let firstSessionId = '';
  let newSessionDefaultMode = '';
  let restartRequestCount = -1;

  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  try {
    // 准备：通过真实Settings配置本地Provider，经Capture UI开始Recording，再创建默认Ask的Chat。
    // Arrange: configure a local Provider in real Settings, start Recording in Capture, then create a default-Ask Chat.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const sessionRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root);
    await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'ask');
    firstSessionId = await currentSessionId(desktopApp.page);

    // 业务断言：Mode属于Session，新Chat固定Ask且返回原Chat恢复其Auto。
    // Business assertion: Mode belongs to a Session; a new Chat starts Ask and returning restores the original Auto.
    await setExecutionMode(desktopApp.page, 'auto');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    newSessionDefaultMode = await sessionRoot.getAttribute('data-tool-execution-mode') ?? '';
    expect(newSessionDefaultMode).toBe('ask');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentSessionOption(firstSessionId),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'auto');
    await setExecutionMode(desktopApp.page, 'ask');
    await desktopApp.stopTrace(testInfo);

    // 用户操作：Ask下change Tool先进入pending；切Auto不处置它，跨Chat返回后Deny也不改变Recording。
    // User actions: Ask makes the change Tool pending; switching Auto does not resolve it, and Deny after Chat switching keeps Recording.
    enqueueDiscoveredStop(
      openAiCompatibleLab,
      'deny-discover',
      'deny-stop',
      DENY_ANSWER,
    );
    await sendMessage(desktopApp.page, DENY_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    const deniedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('deny-stop'),
    );
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'pending');
    await expect(deniedApproval).toHaveAttribute('data-tool-kind', 'change');
    await expect(deniedApproval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'pending');
    await setExecutionMode(desktopApp.page, 'auto');
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await expect(deniedApproval).toHaveCount(0);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentSessionOption(firstSessionId),
    ).click();
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('deny-stop'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'denied');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('deny-stop'),
    )).toHaveCount(0);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');
    const deniedResult = resultForCall(openAiCompatibleLab.requestsForAssertions(), 'deny-stop');
    deniedErrorCode = isRecord(deniedResult.error) && typeof deniedResult.error.code === 'string'
      ? deniedResult.error.code
      : '';
    expect(deniedErrorCode).toBe('tool_denied');

    // 用户操作：Ask中Allow执行正式stop命令；Auto下后续调用不显示问询并直接暂停Capture。
    // User actions: Allow in Ask executes the formal stop command; a later Auto call pauses Capture without an approval.
    await setExecutionMode(desktopApp.page, 'ask');
    enqueueStop(openAiCompatibleLab, 'allow-stop', ALLOW_ANSWER);
    await sendMessage(desktopApp.page, ALLOW_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    const allowedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('allow-stop'),
    );
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('allow-stop'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(allowedApproval).toHaveAttribute('data-approval-status', 'allowed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('allow-stop'),
    )).toHaveCount(0);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');
    await resumeRecording(desktopApp.page);
    await setExecutionMode(desktopApp.page, 'auto');
    enqueueStop(openAiCompatibleLab, 'auto-stop', AUTO_ANSWER);
    await sendMessage(desktopApp.page, AUTO_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('auto-stop'),
    )).toHaveCount(0);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');

    // 用户操作：Settings关闭项优先于Auto；schema移除，猜测调用返回unknown_tool且不触达Recording。
    // User actions: a Settings disable overrides Auto; schema disappears and a guessed call returns unknown_tool without touching Recording.
    await resumeRecording(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording'),
    ).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueStop(openAiCompatibleLab, 'disabled-stop', DISABLED_ANSWER);
    await sendMessage(desktopApp.page, DISABLED_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    expect(requestToolNames(disabledRequests[0]!)).not.toContain('capture_stop_recording');
    const disabledResult = resultForCall(disabledRequests, 'disabled-stop');
    disabledErrorCode = isRecord(disabledResult.error) && typeof disabledResult.error.code === 'string'
      ? disabledResult.error.code
      : '';
    expect(disabledErrorCode).toBe('unknown_tool');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');

    // 重启与销毁：恢复Auto和关闭项且零重放，随后经UI恢复Ask、Tool与Recording默认状态。
    // Restart and teardown: restore Auto and the disabled Tool with zero replay, then reset Ask, Tool and Recording through UI.
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
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    const stopRecordingSwitch = getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording'),
    );
    await expect(stopRecordingSwitch).toHaveAttribute('aria-checked', 'false');
    await stopRecordingSwitch.click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await setExecutionMode(relaunchedApp.page, 'ask');
    await resumeRecording(relaunchedApp.page);

    const evidence: ExecutionModeEvidence = {
      deniedErrorCode,
      disabledErrorCode,
      firstSessionId,
      newSessionDefaultMode,
      restartRequestCount,
      requestBodyHashes: openAiCompatibleLab.evidence()
        .map((observation) => observation.requestBodyHash),
    };
    const evidencePath = testInfo.outputPath('agent-tool-execution-modes.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-execution-modes.json', {
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
      'Agent execution mode workflow and cleanup failed.',
    );
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});