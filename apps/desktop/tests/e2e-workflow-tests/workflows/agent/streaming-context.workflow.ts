import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type {
  OpenAiCompatibleLab,
  OpenAiCompatibleObservation,
} from '../../fixtures/agent/openai-compatible-lab';

interface StreamingEvidence {
  readonly eventSequences: readonly number[];
  readonly observations: readonly OpenAiCompatibleObservation[];
  readonly requestMessageCounts: readonly number[];
  readonly transcriptHashes: readonly string[];
}

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const FIRST_PROMPT = phrase('E2E', 'first', 'streaming', 'prompt');
const FIRST_REASONING = phrase('E2E', 'first', 'private', 'reasoning');
const FIRST_ANSWER = phrase('First', 'streamed', 'answer.');
const SECOND_PROMPT = phrase('E2E', 'follow', 'up');
const SECOND_REASONING = phrase('E2E', 'second', 'private', 'reasoning');
const SECOND_ANSWER = phrase('Second', 'streamed', 'answer.');
const STOP_PROMPT = phrase('E2E', 'stop', 'this', 'response');
const PARTIAL_ANSWER = phrase('Visible', 'partial', 'output');
const RETRY_ANSWER = phrase('Retry', 'completed', 'safely.');
const SENSITIVE_EVIDENCE_TEXTS = [
  FIRST_PROMPT,
  FIRST_REASONING,
  FIRST_ANSWER,
  SECOND_PROMPT,
  SECOND_REASONING,
  SECOND_ANSWER,
  STOP_PROMPT,
  PARTIAL_ANSWER,
  RETRY_ANSWER,
];

/** Configure one keyless Custom Provider entirely through Settings UI. */
async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Streaming lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('streaming'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('streaming-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.agent.provider.connectionStatus,
  )).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Wait for one terminal Turn status exposed by the public Session root. */
async function waitForTurnStatus(
  page: Page,
  status: 'completed' | 'cancelled' | 'failed',
): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', status);
}

/** Move off command tooltips, then reveal Session Usage through the public Context control. */
async function revealSessionUsage(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.agent.context).hover();
}

/** Read the ordered sequence probe installed over the public Session DOM state. */
async function eventSequences(page: Page): Promise<number[]> {
  return page.evaluate(() => (
    (window as unknown as { __agentEventSequences?: number[] }).__agentEventSequences ?? []
  ));
}

/** Stop trace, prove graceful teardown, scan sensitive evidence, and persist artifacts. */
async function closeApplication(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  for (const sensitiveText of SENSITIVE_EVIDENCE_TEXTS) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

/** Attach only hashes, counts, sequence numbers and redacted HTTP metadata. */
async function attachStreamingEvidence(
  testInfo: TestInfo,
  evidence: StreamingEvidence,
): Promise<void> {
  const evidencePath = testInfo.outputPath('agent-streaming-context.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('agent-streaming-context.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
}

test('agent.chat.streaming-context persists ordered Streaming, Usage, Stop and Retry', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.chat.streaming-context',
  });

  let workflowError: unknown;
  let cleanupError: unknown;
  let sequences: number[] = [];
  let requestMessageCounts: number[] = [];
  let transcriptHashes: string[] = [];

  for (const sensitiveText of SENSITIVE_EVIDENCE_TEXTS) {
    desktopApp.registerSensitiveTextForEvidenceAudit(sensitiveText);
  }

  try {
    // 准备：通过产品Settings配置真实本地Provider，再显式打开全局Agent Panel。
    // Arrange: configure a real local Provider through Settings, then explicitly open the global Agent Panel.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.root))
      .toHaveAttribute('data-agent-provider', 'configured');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new)).toBeEnabled();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root)).toBeVisible();

    await desktopApp.page.evaluate((automationId) => {
      const root = document.querySelector(`[data-automation-id="${automationId}"]`);
      if (!root) throw new Error('Agent Session root is unavailable.');
      const targetWindow = window as unknown as {
        __agentEventSequences?: number[];
        __agentSequenceObserver?: MutationObserver;
      };
      targetWindow.__agentEventSequences = [];
      const record = (): void => {
        const sequence = Number(root.getAttribute('data-sequence'));
        const last = targetWindow.__agentEventSequences?.at(-1);
        if (Number.isSafeInteger(sequence) && sequence !== last) {
          targetWindow.__agentEventSequences?.push(sequence);
        }
      };
      record();
      targetWindow.__agentSequenceObserver = new MutationObserver(record);
      targetWindow.__agentSequenceObserver.observe(root, {
        attributes: true,
        attributeFilter: ['data-sequence'],
      });
    }, AUTOMATION_IDS.agent.session.root);
    await screenshotStep('准备：通过产品Settings配置真实本地Provider，再显式打开全局Agent Panel。 / Arrange: configure a real local Provider through Settings, then explicitly open the global Agent Panel.');

    // 证据边界：Prompt/Reasoning进入DOM前停止快照trace，业务事实改由hash与公开状态记录。
    // Evidence boundary: stop snapshot tracing before Prompt/Reasoning enters DOM; retain hashes and public state instead.
    await desktopApp.stopTrace(testInfo);

    // 用户操作：第一轮必须逐chunk原位增长，并在终态显示精确Context与Usage。
    // User actions: the first turn must grow in place by chunk and expose exact terminal Context and Usage.
    openAiCompatibleLab.enqueueTurn({
      reasoningChunks: [FIRST_REASONING],
      textChunks: ['First ', 'streamed ', 'answer.'],
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        cacheHitInputTokens: 6,
        cacheMissInputTokens: 4,
      },
      delayMs: 100,
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.input).fill(FIRST_PROMPT);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.send).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root))
      .toHaveAttribute('data-turn-status', 'running');
    const assistantItems = desktopApp.page.locator('[data-agent-item-kind="assistant-message"]');
    await expect(assistantItems.last()).toContainText('First ');
    await expect(assistantItems.last()).toContainText(FIRST_ANSWER);
    await waitForTurnStatus(desktopApp.page, 'completed');
    const contextUsage = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.context);
    await expect(contextUsage).toHaveAttribute('data-current-tokens', '10');
    await expect(contextUsage).toHaveAttribute('data-window-tokens', '131072');
    await revealSessionUsage(desktopApp.page);
    const sessionUsage = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.usage.panel);
    await expect(sessionUsage)
      .toHaveAttribute('data-total-tokens', '12');
    const reasoning = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.reasoning).last();
    await reasoning.click();
    await expect(reasoning).toContainText(FIRST_REASONING);
    await screenshotStep('用户操作：第一轮必须逐chunk原位增长，并在终态显示精确Context与Usage。 / User actions: the first turn must grow in place by chunk and expose exact terminal Context and Usage.');

    // 用户操作：第二轮发送完整历史；Reasoning保持独立，Session Usage按Token加权聚合。
    // User actions: the second turn sends complete history; Reasoning stays separate and Session Usage is token-weighted.
    openAiCompatibleLab.enqueueTurn({
      reasoningChunks: [SECOND_REASONING],
      textChunks: ['Second ', 'streamed ', 'answer.'],
      usage: {
        inputTokens: 20,
        outputTokens: 4,
        cacheHitInputTokens: 18,
        cacheMissInputTokens: 2,
      },
      delayMs: 80,
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.input).fill(SECOND_PROMPT);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.send).click();
    await waitForTurnStatus(desktopApp.page, 'completed');
    const secondRequest = openAiCompatibleLab.requestsForAssertions().at(-1);
    const secondConversation = Array.isArray(secondRequest?.messages)
      ? secondRequest.messages.filter((message) => (
          typeof message === 'object'
          && message !== null
          && 'role' in message
          && message.role !== 'system'
        ))
      : [];
    expect(secondConversation).toMatchObject([
      { role: 'user', content: FIRST_PROMPT },
      { role: 'assistant', content: FIRST_ANSWER, reasoning_content: FIRST_REASONING },
      { role: 'user', content: SECOND_PROMPT },
    ]);
    await revealSessionUsage(desktopApp.page);
    await expect(sessionUsage)
      .toHaveAttribute('data-input-tokens', '30');
    await expect(sessionUsage)
      .toHaveAttribute('data-cache-hit-rate', '0.8');
    await screenshotStep('用户操作：第二轮发送完整历史；Reasoning保持独立，Session Usage按Token加权聚合。 / User actions: the second turn sends complete history; Reasoning stays separate and Session Usage is token-weighted.');

    // 用户操作：可见delta后Stop必须abort真实HTTP；Retry复用原user item且不伪造取消调用Usage。
    // User actions: Stop after a visible delta must abort real HTTP; Retry reuses the user item without fake cancelled-call Usage.
    openAiCompatibleLab.enqueueTurn({
      textChunks: [PARTIAL_ANSWER],
      delayMs: 80,
      holdOpen: true,
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.input).fill(STOP_PROMPT);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.message.send).click();
    await expect(assistantItems.last()).toContainText(PARTIAL_ANSWER);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.turn.stop).click();
    await waitForTurnStatus(desktopApp.page, 'cancelled');
    await expect.poll(() => openAiCompatibleLab.evidence().at(-1)?.aborted).toBe(true);

    openAiCompatibleLab.enqueueTurn({
      textChunks: ['Retry ', 'completed ', 'safely.'],
      usage: {
        inputTokens: 25,
        outputTokens: 5,
        cacheHitInputTokens: 20,
        cacheMissInputTokens: 5,
      },
      delayMs: 80,
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.turn.retry).click();
    await waitForTurnStatus(desktopApp.page, 'completed');
    await expect(assistantItems.last()).toContainText(RETRY_ANSWER);
    await expect(desktopApp.page.locator('[data-agent-item-kind="user-message"]'))
      .toHaveCount(3);
    await revealSessionUsage(desktopApp.page);
    await expect(sessionUsage)
      .toHaveAttribute('data-model-call-count', '3');
    await expect(sessionUsage)
      .toHaveAttribute('data-total-tokens', '66');
    await screenshotStep('用户操作：可见delta后Stop必须abort真实HTTP；Retry复用原user item且不伪造取消调用Usage。 / User actions: Stop after a visible delta must abort real HTTP; Retry reuses the user item without fake cancelled-call Usage.');

    // 业务断言：事件sequence严格递增；只把计数、hash和脱敏HTTP事实写入evidence。
    // Business assertions: event sequences strictly increase; evidence stores only counts, hashes and redacted HTTP facts.
    sequences = await eventSequences(desktopApp.page);
    expect(sequences.length).toBeGreaterThan(12);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    expect(new Set(sequences).size).toBe(sequences.length);
    requestMessageCounts = openAiCompatibleLab.requestsForAssertions()
      .slice(1)
      .map((request) => Array.isArray(request.messages) ? request.messages.length : 0);
    transcriptHashes = [FIRST_ANSWER, SECOND_ANSWER, PARTIAL_ANSWER, RETRY_ANSWER]
      .map((text) => createHash('sha256').update(text).digest('hex'));
    expect(desktopApp.rendererPageErrors()).toEqual([]);

    // Evidence/teardown：关闭Panel后恢复trace，确保任何Prompt/Reasoning都不进入保存的快照。
    // Evidence/teardown: close the Panel before resuming trace so no Prompt/Reasoning enters retained snapshots.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await screenshotStep('Evidence/teardown：关闭Panel后恢复trace，确保任何Prompt/Reasoning都不进入保存的快照。 / Evidence/teardown: close the Panel before resuming trace so no Prompt/Reasoning enters retained snapshots.');
  } catch (error) {
    workflowError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await attachStreamingEvidence(testInfo, {
        eventSequences: sequences,
        observations: openAiCompatibleLab.evidence(),
        requestMessageCounts,
        transcriptHashes,
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await closeApplication(desktopApp, testInfo);
    } catch (error) {
      cleanupErrors.push(error);
      await desktopApp.forceCleanup().catch(() => undefined);
    }
    if (cleanupErrors.length > 0) {
      cleanupError = new AggregateError(cleanupErrors, 'Streaming workflow cleanup failed.');
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Streaming workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
