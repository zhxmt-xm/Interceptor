import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const CHAT_A_PROMPT = phrase('E2E', 'recovery', 'chat', 'A');
const CHAT_A_ANSWER = phrase('Recovery', 'answer', 'A');
const CHAT_A_FOLLOW_UP = phrase('E2E', 'follow', 'up', 'A');
const CHAT_A_FOLLOW_UP_ANSWER = phrase('Recovery', 'follow-up', 'answer', 'A');
const CHAT_B_PROMPT = phrase('E2E', 'recovery', 'chat', 'B');
const CHAT_B_ANSWER = phrase('Recovery', 'answer', 'B');
const CHAT_A_TITLE = phrase('Renamed', 'recovery', 'chat', 'A');
const SENSITIVE_TEXTS = [
  CHAT_A_PROMPT,
  CHAT_A_ANSWER,
  CHAT_A_FOLLOW_UP,
  CHAT_A_FOLLOW_UP_ANSWER,
  CHAT_B_PROMPT,
  CHAT_B_ANSWER,
];

interface RecoveryEvidence {
  readonly firstGenerationRequestCount: number;
  readonly relaunchStartupRequestCount: number;
  readonly finalRequestCount: number;
  readonly sessionIds: readonly string[];
  readonly transcriptHashes: readonly string[];
}

/** Configure a keyless local model through the real Settings UI. */
async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Recovery lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('recovery'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('recovery-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Create one Chat, send one message and wait for its exact answer. */
async function createChatAndComplete(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  prompt: string,
  answer: string,
): Promise<string> {
  openAiCompatibleLab.enqueueTurn({
    textChunks: [answer.slice(0, 8), answer.slice(8)],
    usage: {
      inputTokens: 10,
      outputTokens: 2,
      cacheHitInputTokens: 5,
      cacheMissInputTokens: 5,
    },
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  const sessionRoot = getByAutomationId(page, AUTOMATION_IDS.agent.session.root);
  await expect(sessionRoot).toBeVisible();
  const sessionId = await sessionRoot.getAttribute('data-session-id');
  if (!sessionId) throw new Error('Agent Session ID is unavailable.');
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(page.locator('[data-agent-item-kind="assistant-message"]').last()).toContainText(answer);
  return sessionId;
}

/** Open the current Chat menu and choose one public command. */
async function openChatCommand(page: Page, automationId: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
  await getByAutomationId(page, automationId).click();
}

/** Gracefully close one generation and save its evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  for (const sensitiveText of SENSITIVE_TEXTS) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

/** Attach only IDs, counts and hashes; never Transcript text or Provider payloads. */
async function attachRecoveryEvidence(
  testInfo: TestInfo,
  evidence: RecoveryEvidence,
): Promise<void> {
  const evidencePath = testInfo.outputPath('agent-restart-recovery.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('agent-restart-recovery.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
}

test('agent.chat.restart-recovery restores isolated Chats without replaying model calls', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.chat.restart-recovery',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let chatAId = '';
  let chatBId = '';
  let firstGenerationRequestCount = -1;
  let relaunchStartupRequestCount = -1;
  let finalRequestCount = -1;

  for (const sensitiveText of SENSITIVE_TEXTS) {
    desktopApp.registerSensitiveTextForEvidenceAudit(sensitiveText);
  }

  try {
    // 准备：产品UI配置Provider并打开Panel；敏感Transcript进入DOM前停止trace快照。
    // Arrange: configure through product UI and open the Panel; stop trace snapshots before sensitive Transcript content enters DOM.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.root))
      .toHaveAttribute('data-agent-provider', 'configured');
    await desktopApp.stopTrace(testInfo);

    // 用户操作：创建并完成Chat A，使用正式菜单重命名；再创建并完成当前Chat B。
    // User actions: create and complete Chat A, rename it through the real menu, then create and complete current Chat B.
    chatAId = await createChatAndComplete(
      desktopApp.page,
      openAiCompatibleLab,
      CHAT_A_PROMPT,
      CHAT_A_ANSWER,
    );
    await openChatCommand(desktopApp.page, AUTOMATION_IDS.agent.chat.rename);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.dialog))
      .toHaveAttribute('data-mode', 'rename');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title)).toBeFocused();
    await desktopApp.page.keyboard.press('Shift+Tab');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm)).toBeFocused();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title).focus();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title).fill(CHAT_A_TITLE);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector)).toBeFocused();

    chatBId = await createChatAndComplete(
      desktopApp.page,
      openAiCompatibleLab,
      CHAT_B_PROMPT,
      CHAT_B_ANSWER,
    );
    expect(chatBId).not.toBe(chatAId);
    await openChatCommand(desktopApp.page, AUTOMATION_IDS.agent.chat.rename);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title))
      .toHaveValue('New chat');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.cancel).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector)).toBeFocused();
    firstGenerationRequestCount = openAiCompatibleLab.evidence().length;

    // 重启：第一代完整销毁；同一profile恢复Provider、A/B顺序、当前B，且不自动重放Model Call。
    // Restart: fully destroy generation one; the same profile restores Provider, A/B order and current B without replay.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const sensitiveText of SENSITIVE_TEXTS) {
      relaunchedApp.registerSensitiveTextForEvidenceAudit(sensitiveText);
    }
    await relaunchedApp.waitUntilReady();
    relaunchStartupRequestCount = openAiCompatibleLab.evidence().length - firstGenerationRequestCount;
    expect(relaunchStartupRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    const restoredRoot = getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.session.root);
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatBId);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]'))
      .toContainText(CHAT_B_ANSWER);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.selector).click();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentSessionOption(chatAId),
    )).toContainText(CHAT_A_TITLE);
    const options = relaunchedApp.page.locator('[data-automation-id^="agent.session.option."]');
    await expect(options).toHaveCount(2);
    expect(await options.evaluateAll((elements) => elements.map(
      (element) => element.getAttribute('data-automation-id')?.replace('agent.session.option.', ''),
    ))).toEqual([chatBId, chatAId]);

    // 证据边界：恢复状态验证后关闭菜单并停止trace，再让A继续；请求不得包含B历史。
    // Evidence boundary: close the menu and stop trace after recovery checks, then continue A without sending B history.
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentSessionOption(chatAId),
    ).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);
    openAiCompatibleLab.enqueueTurn({
      textChunks: [CHAT_A_FOLLOW_UP_ANSWER],
      usage: {
        inputTokens: 16,
        outputTokens: 3,
        cacheHitInputTokens: 12,
        cacheMissInputTokens: 4,
      },
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.input)
      .fill(CHAT_A_FOLLOW_UP);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.send).click();
    await expect(restoredRoot).toHaveAttribute('data-turn-status', 'completed');
    const followUpRequest = openAiCompatibleLab.requestsForAssertions().at(-1);
    expect(JSON.stringify(followUpRequest?.messages)).toContain(CHAT_A_PROMPT);
    expect(JSON.stringify(followUpRequest?.messages)).not.toContain(CHAT_B_PROMPT);

    // 用户操作：正式选择并删除B；创建空C再删除，A与Provider必须保持完整。
    // User actions: select and delete B; create and delete empty C while A and Provider remain intact.
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentSessionOption(chatBId),
    ).click();
    await openChatCommand(relaunchedApp.page, AUTOMATION_IDS.agent.chat.delete);
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.dialog))
      .toHaveAttribute('data-mode', 'delete');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);

    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const chatCId = await restoredRoot.getAttribute('data-session-id');
    expect(chatCId).not.toBe(chatAId);
    await openChatCommand(relaunchedApp.page, AUTOMATION_IDS.agent.chat.delete);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);
    await expect(relaunchedApp.page.locator('[data-agent-item-kind="assistant-message"]').last())
      .toContainText(CHAT_A_FOLLOW_UP_ANSWER);
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.root))
      .toHaveAttribute('data-agent-provider', 'configured');
    finalRequestCount = openAiCompatibleLab.evidence().length;
    expect(relaunchedApp.rendererPageErrors()).toEqual([]);

    // Evidence/teardown：关闭含Transcript的Panel后恢复trace，并保存两代销毁证据。
    // Evidence/teardown: close the Transcript Panel before resuming trace and save both generations' destroy evidence.
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
  } catch (error) {
    workflowError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await attachRecoveryEvidence(testInfo, {
        firstGenerationRequestCount,
        relaunchStartupRequestCount,
        finalRequestCount,
        sessionIds: [chatAId, chatBId].filter(Boolean),
        transcriptHashes: [CHAT_A_ANSWER, CHAT_B_ANSWER, CHAT_A_FOLLOW_UP_ANSWER]
          .map((text) => createHash('sha256').update(text).digest('hex')),
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (relaunchedApp !== null) {
      try {
        await closeGeneration(relaunchedApp, testInfo);
      } catch (error) {
        cleanupErrors.push(error);
        await relaunchedApp.forceCleanup().catch(() => undefined);
      }
    }
    if (cleanupErrors.length > 0) {
      cleanupError = new AggregateError(cleanupErrors, 'Restart recovery cleanup failed.');
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Restart recovery workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
