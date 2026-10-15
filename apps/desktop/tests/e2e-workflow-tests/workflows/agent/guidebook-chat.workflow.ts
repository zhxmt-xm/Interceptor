import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('agent guide records real configuration and chat with a clearly identified local demo endpoint', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const profileName = 'Guide local demo';
  const modelId = 'guide-demo-model';
  const prompt = 'Explain Pause and Clear. Do not change settings.';
  const answer = 'Demo response: Pause stops recording new requests. Clear removes captured records. Neither restores the system proxy.';
  const pausePrompt = 'Pause recording after asking me.';
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'agent');
  try {
    // 准备与操作：无Key本地兼容服务只演示产品流程，不冒充付费模型能力。
    // Arrange and act: a keyless local endpoint demonstrates product flow, not a commercial model's intelligence.
    await media.step('01-settings', '打开 Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-agent-settings', '进入 Agent 设置 / Open Agent settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    });
    await media.step('03-add', '添加模型 / Add a model', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
    });
    await media.step('04-custom', '选择 Custom / Choose Custom', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toBeVisible();
    });
    await media.step('05-name', '命名 Guide local demo / Name the profile', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(profileName);
    });
    await media.step('06-endpoint', '填写本地演示地址 / Enter the local demo URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('guide'));
    });
    await media.step('07-model', '填写 guide-demo-model / Enter the model ID', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(modelId);
    });
    await media.step('08-context', '填写 Context Window 131072 / Set the context window', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
    });
    await media.step('09-output', '填写 Maximum Output 8192 / Set maximum output', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.save)).toBeDisabled();
    });
    await media.step('10-test', '测试实际 HTTP 连接 / Test the actual connection', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
    });
    await media.step('11-save', '保存已验证模型 / Save the verified model', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.models.list)).toHaveAttribute('data-model-count', '1');
    });
    await media.step('12-panel', '打开 Agent 面板 / Open the Agent panel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toBeVisible();
    });
    await media.step('13-chat', '新建 Chat / Create a Chat', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toBeVisible();
    });
    await media.step('14-prompt', '输入明确的只读问题 / Enter a scoped question', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
    });
    await media.step('15-send', '发送并读取演示回复 / Send and read the demo response', async () => {
      openAiCompatibleLab.enqueueTurn({ textChunks: [answer],
        usage: { inputTokens: 64, outputTokens: 32, cacheHitInputTokens: 0, cacheMissInputTokens: 64 } });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).toContainText(answer);
    });
    await media.step('16-context', '查看 Context 用量 / Inspect context usage', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.context).getByRole('button').focus();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.usage.panel)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.usage.panel)).toHaveAttribute('data-input-tokens', '64');
    });
    await page.mouse.move(900, 800);
    await media.step('17-auto', '观察 Auto 模式 / Inspect Auto mode', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-tool-execution-mode', 'auto');
    });
    await media.step('18-ask', '恢复 Ask / Restore Ask', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.ask).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-tool-execution-mode', 'ask');
    });
    await media.step('18a-tool-question', '请求一个需审批的 Tool / Request a Tool requiring approval', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-discover', name: 'discover_tools', arguments: { capabilityId: 'capture' } });
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-stop-deny', name: 'capture_stop_recording', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo result: the requested action was denied.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(pausePrompt);
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-stop-deny'))).toHaveAttribute('data-approval-status', 'pending');
    });
    await media.step('18b-deny', '拒绝一次 Tool / Deny one Tool call', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolDeny('guide-stop-deny')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-stop-deny'))).toHaveAttribute('data-approval-status', 'denied');
    });
    await media.step('18c-tool-again', '重新请求并检查目标 / Request again and review the target', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-stop-allow', name: 'capture_stop_recording', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo result: recording is paused.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(pausePrompt);
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-stop-allow'))).toHaveAttribute('data-approval-status', 'pending');
    });
    await media.step('18d-allow', '允许实际暂停录制 / Allow actual Recording pause', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAllow('guide-stop-allow')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-stop-allow'))).toHaveAttribute('data-approval-status', 'allowed');
    });
    await media.step('19-stream', '发起可停止的演示 / Start a stoppable demonstration', async () => {
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo streaming response.'], holdOpen: true });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill('Show a streaming demonstration.');
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop)).toBeVisible();
    });
    await media.step('20-stop', 'Stop 并保留历史 / Stop while retaining history', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'cancelled');
    });
    await media.step('21-retry', 'Retry 新尝试 / Retry as a new attempt', async () => {
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo retry complete.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.turn.retry).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript)).toContainText('Demo retry complete.');
    });
    // 证据：原生产品、真实模型HTTP边界与固定公开回复，未使用真实Key。
    // Evidence: real product and HTTP boundaries with fixed public demo replies, never real keys.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ profileName, modelId, baseUrl: openAiCompatibleLab.baseUrl('guide'),
      contextWindow: '131072', maximumOutput: '8192', prompt, pausePrompt, answer,
      modelKind: 'deterministic local demonstration, not a commercial model acceptance' });
  }
  // 清理：正式退出取消在途模型连接，并核对Core、端口与系统设置。
  // Cleanup: normal exit cancels model connections and verifies Core, ports and system settings.
});
