import type { Page } from '@playwright/test';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('agent guide records keyboard usage, running Chat deletion, real restart and last-model removal', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(540_000);
  const { page } = desktopApp;
  const profileName = 'Guide session demo';
  const modelId = 'guide-session-model';
  const retainedTitle = 'Guide retained chat';
  const freshTitle = 'Guide fresh context';
  const runningTitle = 'Guide running delete';
  const prompt = 'Explain why a fresh Chat has separate context.';
  const answer = 'Demo response: this local example reports usage; a new Chat starts a separate history.';
  const initialLanguage = await page.locator('html').getAttribute('lang');
  let restarted: LocalElectronApplicationDriver | undefined;
  let after: GuidebookMedia | undefined;
  const rename = async (current: Page, title: string): Promise<void> => {
    await getByAutomationId(current, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(current, AUTOMATION_IDS.agent.chat.rename).click();
    await getByAutomationId(current, AUTOMATION_IDS.agent.chat.title).fill(title);
    await getByAutomationId(current, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(getByAutomationId(current, AUTOMATION_IDS.agent.chat.selector)).toContainText(title);
  };
  // 准备：已公开说明的无Key本地演示模型，Usage来自其真实HTTP返回而非注入UI。
  // Arrange: use the explicitly identified keyless local model; Usage comes from its HTTP response, not injected UI.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(profileName);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('guide-session'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(modelId);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
  const modelRow = page.locator('[data-automation-id^="agent.model.row."]').filter({ hasText: profileName });
  const modelIdentity = await modelRow.getAttribute('data-automation-id');
  if (!modelIdentity?.startsWith('agent.model.row.')) throw new Error('The demo model omitted its identity.');
  const providerId = modelIdentity.slice('agent.model.row.'.length);
  const before = await GuidebookMedia.start(desktopApp, testInfo, 'agent-session-lifecycle');
  try {
    await before.step('01-panel', '打开Agent面板 / Open the Agent panel', async () => { await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click(); });
    await before.step('02-chat', '新建需要保留的Chat / Create the Chat to retain', async () => { await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click(); });
    await before.step('03-name', '命名Guide retained chat / Name it Guide retained chat', async () => { await rename(page, retainedTitle); });
    await before.step('04-prompt', '输入本轮公开问题 / Enter this run’s public prompt', async () => { await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt); });
    await before.step('05-keyboard-send', '用Command+Enter发送 / Send with Command+Enter', async () => {
      openAiCompatibleLab.enqueueTurn({
        textChunks: [answer], usage: { inputTokens: 120000, outputTokens: 48, cacheHitInputTokens: 0, cacheMissInputTokens: 120000 },
      });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).press('Meta+Enter');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).toContainText(answer);
    });
    await before.step('06-keyboard-context', '通过真实Tab导航读取Context / Use actual Tab navigation to read Context', async () => {
      const input = getByAutomationId(page, AUTOMATION_IDS.agent.message.input);
      await input.click();
      const button = getByAutomationId(page, AUTOMATION_IDS.agent.context).getByRole('button');
      for (let index = 0; index < 24 && !await button.evaluate(element => element === document.activeElement); index++) {
        await page.keyboard.press('Shift+Tab');
      }
      await expect(button).toBeFocused();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.usage.panel)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.usage.panel)).toHaveAttribute('data-input-tokens', '120000');
    });
    await before.step('07-dismiss-context', '离开Context焦点 / Move focus away from Context', async () => {
      await page.keyboard.press('Tab');
      await page.mouse.move(800, 300);
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.usage.panel)).toBeHidden();
    });
    await before.step('08-fresh-chat', '参考用量后新建独立Chat / Start a separate Chat after reviewing usage', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).not.toContainText(answer);
    });
    await before.step('09-fresh-name', '命名Guide fresh context / Name it Guide fresh context', async () => { await rename(page, freshTitle); });
    await before.step('10-running-chat', '再建运行中删除示例 / Create the running-deletion example', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      await rename(page, runningTitle);
    });
    await before.step('11-running-prompt', '发起保持流式响应的本地演示 / Start the local held-stream example', async () => {
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo running response before deletion.'], holdOpen: true });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill('Keep this local demonstration response open.');
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop)).toBeVisible();
    });
    await before.step('12-running-delete-dialog', '运行中打开删除确认 / Open deletion confirmation while running', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.delete).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.dialog)).toBeVisible();
    });
    await before.step('13-delete-running', '确认删除并取消这条流 / Confirm deletion and cancel that stream', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.confirm).click();
      await expect.poll(() => openAiCompatibleLab.evidence().at(-1)?.aborted).toBe(true);
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await expect(page.getByRole('option').filter({ hasText: runningTitle })).toHaveCount(0);
    });
    await before.step('14-retained-chat', '回到保留的Chat / Return to the retained Chat', async () => {
      await page.getByRole('option').filter({ hasText: retainedTitle }).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).toContainText(answer);
    });
    await before.step('15-before-close', '确认持久内容后正常关闭 / Confirm persistent content before normal Close', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).hover();
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    const stop = getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop);
    if (await stop.isVisible()) await stop.click();
    await before.stop({
      profileName, modelId, endpoint: openAiCompatibleLab.baseUrl('guide-session'), prompt, answer,
      reportedInputTokens: '120000 (deliberately reported by the local demo, not commercial billing)',
      retainedChat: retainedTitle, freshChat: freshTitle, deletedRunningChat: runningTitle,
      closeImage: 'Before the actual Close; the driver verifies the real shutdown between recordings',
    });
  }
  const requestsBeforeRestart = openAiCompatibleLab.evidence().length;
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
  try {
    // 重启：同一真实profile回载，不重新创建模型/会话，也不重放先前模型请求。
    // Restart: reload the same real profile without recreating models/Chats or replaying prior model requests.
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'agent-reopened',
    });
    await restarted.waitUntilReady();
    const current = restarted.page;
    await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(current, AUTOMATION_IDS.settings.section.agent).click();
    after = await GuidebookMedia.start(restarted, testInfo, 'agent-session-restart');
    await after.step('01-open', '重开Agent面板 / Reopen the Agent panel', async () => {
      if (!await getByAutomationId(current, AUTOMATION_IDS.agent.panel.root).isVisible()) await getByAutomationId(current, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.agent.chat.selector)).toBeVisible();
    });
    await after.step('02-chats', '检查真实回载的Chat列表 / Inspect the actually restored Chat list', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.agent.chat.selector).click();
      await expect(current.getByRole('option').filter({ hasText: retainedTitle })).toBeVisible();
      await expect(current.getByRole('option').filter({ hasText: freshTitle })).toBeVisible();
      await expect(current.getByRole('option').filter({ hasText: runningTitle })).toHaveCount(0);
    });
    await after.step('03-history', '读取保留的真实历史 / Read the retained history', async () => {
      await current.getByRole('option').filter({ hasText: retainedTitle }).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.agent.session.transcript)).toContainText(prompt);
      await expect(getByAutomationId(current, AUTOMATION_IDS.agent.session.transcript)).toContainText(answer);
      expect(openAiCompatibleLab.evidence()).toHaveLength(requestsBeforeRestart);
    });
    await after.step('04-model-settings', '检查仍保存的模型配置 / Inspect the retained model configuration', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(current, AUTOMATION_IDS.settings.section.agent).click();
      await expect(getByAutomationId(current, AutomationIdFactory.agentModelRow(providerId))).toBeVisible();
    });
    await after.step('05-last-model-dialog', '打开最后一个模型的删除确认 / Open deletion confirmation for the last model', async () => {
      await getByAutomationId(current, AutomationIdFactory.agentModelRemove(providerId)).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.agent.removeProvider.dialog)).toBeVisible();
    });
    await after.step('06-remove-last', '删除最后模型并检查未配置状态 / Remove the last model and inspect the unconfigured state', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.agent.removeProvider.confirm).click();
      await expect(current.locator('[data-automation-id^="agent.model.row."]')).toHaveCount(0);
      await expect(getByAutomationId(current, AUTOMATION_IDS.agent.configure)).toBeVisible();
      expect(openAiCompatibleLab.evidence()).toHaveLength(requestsBeforeRestart);
    });
    await expect(current.locator('html')).toHaveAttribute('lang', initialLanguage!);
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (after) await after.stop({
        profileName, retainedChat: retainedTitle, freshChat: freshTitle, deletedRunningChat: runningTitle,
        retainedPrompt: prompt, retainedAnswer: answer, modelCallsOnRestart: '0',
        finalModelState: 'No provider remains; the panel is unconfigured',
        evidenceGeneration: 'agent-reopened',
      });
    } finally {
      if (restarted) {
        await restarted.captureFinalScreenshot(testInfo);
        await restarted.stopTrace(testInfo);
        await restarted.closeGracefully();
        await restarted.writeEvidence(testInfo);
        await restarted.forceCleanup();
      }
    }
  }
  // 清理：两代Main/Core/Worker均正常退出，8888释放，宿主代理与日常CA恢复。
  // Cleanup: both generations exit normally, release port 8888 and restore host proxy settings and the daily CA.
});
