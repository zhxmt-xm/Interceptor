import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const phrase = (...parts: readonly string[]): string => parts.join(' ');
const CHAT_A_PROMPT = phrase('Explain Recording and Clear', 'without changing settings.');
const CHAT_A_ANSWER = phrase('Recording controls whether new traffic is stored;', 'Clear removes captured records.');
const CHAT_A_FOLLOW_UP = phrase('Does pausing Recording', 'restore the system proxy?');
const CHAT_A_FOLLOW_UP_ANSWER = phrase('No. Pause only stops recording new traffic;', 'restore the system proxy separately.');
const CHAT_B_PROMPT = phrase('Explain when to use Direct', 'and Manual upstream modes.');
const CHAT_B_ANSWER = phrase('Direct connects to the destination;', 'Manual routes requests through your configured upstream proxy.');
const CHAT_A_TITLE = phrase('Recording', 'and Clear');
const CHAT_B_TITLE = phrase('Upstream', 'modes');
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
async function configureProvider(
  page: Page, openAiCompatibleLab: OpenAiCompatibleLab,
  profileName = 'Recovery lab', modelId = 'recovery-model',
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(profileName);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('recovery'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(modelId);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
  const row = page.locator('[data-automation-id^="agent.model.row."]').filter({ hasText: profileName });
  const id = await row.getAttribute('data-automation-id');
  if (!id?.startsWith('agent.model.row.')) throw new Error('The configured Provider omitted its identity.');
  await screenshotStep(`保存用于对话的模型：${profileName} / Save the model used for conversation: ${profileName}`);
  return id.slice('agent.model.row.'.length);
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
  await screenshotStep('创建独立的新Chat并检查当前模型 / Create a separate Chat and inspect its selected model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await screenshotStep('填写本次问题并找到Send / Enter the question and locate Send', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.agent.message.input), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.agent.message.send), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
  await expect(page.locator('[data-agent-item-kind="assistant-message"]').last()).toContainText(answer);
  await screenshotStep('等待当前Chat的回复完成 / Wait for the current Chat to finish its response', {
    highlights: [{ target: page.locator('[data-agent-item-kind="assistant-message"]').last(), label: '1' }],
  });
  return sessionId;
}

/** Open the current Chat menu and choose one public command. */
async function openChatCommand(page: Page, automationId: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
  await screenshotStep('从当前Chat菜单选择操作 / Choose an action from the current Chat menu', {
    highlights: [{ target: getByAutomationId(page, automationId), label: '1' }],
  });
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
    const firstProvider = await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.root))
      .toHaveAttribute('data-agent-provider', 'configured');
    await screenshotStep('打开已配置模型的Agent面板 / Open the Agent panel with a configured model', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new), label: '1' }],
    });
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
    await screenshotStep('为第一个Chat填写清楚的名称 / Give the first Chat a descriptive name', {
      highlights: [
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title), label: '1' },
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm), label: '2' },
      ],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector)).toBeFocused();
    await screenshotStep('保存第一个Chat的新名称 / Save the first Chat name');

    // 模型选择：全局默认只影响新Chat，当前Chat的模型仍由自己的选择决定。
    // Model selection: the global default affects new Chats; each existing Chat keeps its own selection.
    const secondProvider = await configureProvider(desktopApp.page, openAiCompatibleLab, 'Recovery alternate', 'recovery-alternate');
    await screenshotStep('为后续新Chat设置另一个默认模型 / Set another default model for subsequent Chats', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelSetDefault(secondProvider)), label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelSetDefault(secondProvider)).click();
    const panel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.root);
    await expect(panel.getByRole('button').filter({ hasText: 'Recovery lab' })).toBeVisible();
    await screenshotStep('全局默认已改变，当前Chat仍使用原模型 / The global default changes while the current Chat retains its model', {
      highlights: [
        { target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelRow(secondProvider)), label: '1' },
        { target: panel.getByRole('button').filter({ hasText: 'Recovery lab' }), label: '2' },
      ],
    });
    await panel.getByRole('button').filter({ hasText: 'Recovery lab' }).click();
    await screenshotStep('为当前Chat单独选择模型 / Choose a model specifically for the current Chat', {
      highlights: [{ target: desktopApp.page.getByRole('option').filter({ hasText: 'Recovery alternate' }), label: '1' }],
    });
    await desktopApp.page.getByRole('option').filter({ hasText: 'Recovery alternate' }).click();
    await screenshotStep('当前Chat切换到Recovery alternate / Switch the current Chat to Recovery alternate');
    await panel.getByRole('button').filter({ hasText: 'Recovery alternate' }).click();
    await desktopApp.page.getByRole('option').filter({ hasText: 'Recovery lab' }).click();
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelRow(secondProvider)))
      .toHaveAttribute('data-default', 'true');
    await screenshotStep('当前Chat模型与全局默认相互独立 / Keep the current Chat model independent from the global default');

    chatBId = await createChatAndComplete(
      desktopApp.page,
      openAiCompatibleLab,
      CHAT_B_PROMPT,
      CHAT_B_ANSWER,
    );
    await expect(panel.getByRole('button').filter({ hasText: 'Recovery alternate' })).toBeVisible();
    expect(chatBId).not.toBe(chatAId);
    await openChatCommand(desktopApp.page, AUTOMATION_IDS.agent.chat.rename);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title))
      .toHaveValue('New chat');
    await screenshotStep('不想重命名时取消并保留当前Chat / Cancel renaming to retain the current Chat', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.cancel), label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.cancel).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.selector)).toBeFocused();
    await openChatCommand(desktopApp.page, AUTOMATION_IDS.agent.chat.rename);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title).fill(CHAT_B_TITLE);
    await screenshotStep('为第二个Chat命名以区分任务 / Name the second Chat to distinguish its task', {
      highlights: [
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.title), label: '1' },
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm), label: '2' },
      ],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    firstGenerationRequestCount = openAiCompatibleLab.evidence().length;
    await screenshotStep('用户操作：创建并完成Chat A，使用正式菜单重命名；再创建并完成当前Chat B。 / User actions: create and complete Chat A, rename it through the real menu, then create and complete current Chat B.');

    // 重启：第一代完整销毁；同一profile恢复Provider、A/B顺序、当前B，且不自动重放Model Call。
    // Restart: fully destroy generation one; the same profile restores Provider, A/B order and current B without replay.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await screenshotStep('保存Chat后关闭App / Close the App after saving the Chats', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.window.close), label: '1' }],
    });
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
    await screenshotStep('真实重启后重新打开上次的Chat / Reopen the previous Chat after a real restart');
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
    await screenshotStep('在Chat列表中核对保留的两个会话 / Inspect the two retained Chats in the selector', {
      highlights: [
        { target: getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentSessionOption(chatBId)), label: '1' },
        { target: getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentSessionOption(chatAId)), label: '2' },
      ],
    });

    // 证据边界：恢复状态验证后关闭菜单并停止trace，再让A继续；请求不得包含B历史。
    // Evidence boundary: close the menu and stop trace after recovery checks, then continue A without sending B history.
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentSessionOption(chatAId),
    ).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.root)
      .getByRole('button').filter({ hasText: 'Recovery lab' })).toBeVisible();
    await screenshotStep('切回第一个Chat并读取它自己的历史 / Return to the first Chat and read its own history');
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
    await screenshotStep('在原Chat中继续追问 / Ask a follow-up in the original Chat', {
      highlights: [{ target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.send), label: '1' }],
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.send).click();
    await expect(restoredRoot).toHaveAttribute('data-turn-status', 'completed');
    const followUpRequest = openAiCompatibleLab.requestsForAssertions().at(-1);
    expect(JSON.stringify(followUpRequest?.messages)).toContain(CHAT_A_PROMPT);
    expect(JSON.stringify(followUpRequest?.messages)).not.toContain(CHAT_B_PROMPT);
    await screenshotStep('证据边界：恢复状态验证后关闭菜单并停止trace，再让A继续；请求不得包含B历史。 / Evidence boundary: close the menu and stop trace after recovery checks, then continue A without sending B history.');

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
    await screenshotStep('删除前核对Chat名称并选择取消 / Review the Chat name and cancel deletion', {
      highlights: [
        { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.cancel), label: '1' },
        { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm), label: '2' },
      ],
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.cancel).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatBId);
    await screenshotStep('取消删除后第二个Chat仍然保留 / The second Chat remains after cancelling deletion');
    await openChatCommand(relaunchedApp.page, AUTOMATION_IDS.agent.chat.delete);
    await screenshotStep('再次核对并确认删除第二个Chat / Review and confirm removal of the second Chat', {
      highlights: [{ target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm), label: '1' }],
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);
    await screenshotStep('删除第二个Chat后回到保留的会话 / Return to the retained Chat after deleting the second one');

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
    await screenshotStep('用户操作：正式选择并删除B；创建空C再删除，A与Provider必须保持完整。 / User actions: select and delete B; create and delete empty C while A and Provider remain intact.');

    // 运行中删除：真实流式HTTP必须取消；随后删除最后模型回到未配置面板。
    // Running deletion: cancel the actual streaming HTTP; removing the last model returns to the unconfigured panel.
    openAiCompatibleLab.enqueueTurn({ textChunks: ['Owned response before Chat deletion.'], holdOpen: true });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.input).fill('Delete this owned streaming example.');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.message.send).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.turn.stop)).toBeVisible();
    await screenshotStep('新Chat正在接收模型回复 / A new Chat is receiving the model response');
    await openChatCommand(relaunchedApp.page, AUTOMATION_IDS.agent.chat.delete);
    await screenshotStep('运行中删除Chat前确认取消影响 / Confirm the cancellation impact before deleting a running Chat', {
      highlights: [{ target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm), label: '1' }],
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect.poll(() => openAiCompatibleLab.evidence().at(-1)?.aborted).toBe(true);
    await expect(restoredRoot).toHaveAttribute('data-session-id', chatAId);
    await screenshotStep('删除运行中Chat会取消真实模型连接 / Deleting a running Chat cancels the actual model connection');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const providerId of [secondProvider, firstProvider]) {
      await getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentModelRemove(providerId)).click();
      await screenshotStep('核对将要移除的模型配置 / Review the model profile to remove', {
        highlights: [{ target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.removeProvider.confirm), label: '1' }],
      });
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.removeProvider.confirm).click();
    }
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.configure)).toBeVisible();
    finalRequestCount = openAiCompatibleLab.evidence().length;
    await screenshotStep('删除最后模型后显示未配置状态 / Show the unconfigured state after removing the last model');

    // Evidence/teardown：关闭含Transcript的Panel后恢复trace，并保存两代销毁证据。
    // Evidence/teardown: close the Transcript Panel before resuming trace and save both generations' destroy evidence.
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
    await screenshotStep('Evidence/teardown：关闭含Transcript的Panel后恢复trace，并保存两代销毁证据。 / Evidence/teardown: close the Transcript Panel before resuming trace and save both generations\' destroy evidence.');
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
