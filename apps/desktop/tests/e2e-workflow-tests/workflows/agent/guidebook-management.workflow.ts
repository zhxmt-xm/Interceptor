import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('agent management guide separates defaults, per-Chat model selection and real capability enforcement', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const panel = getByAutomationId(page, AUTOMATION_IDS.agent.panel.root);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'agent-management');
  const ids: string[] = [];
  const configure = async (name: string, modelId: string, profile: string): Promise<void> => {
    await media.step(`${profile}-01-dialog`, `添加 ${name} / Add ${name}`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
    });
    await media.step(`${profile}-02-name`, `填写 ${name} / Enter ${name}`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(name);
    });
    await media.step(`${profile}-03-endpoint`, '填写本地演示 endpoint / Enter the local demo endpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl(profile));
    });
    await media.step(`${profile}-04-model`, `填写 ${modelId} / Enter ${modelId}`, async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(modelId);
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
    });
    await media.step(`${profile}-05-test`, '测试连接 / Test the connection', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
    });
    await media.step(`${profile}-06-save`, '保存已验证配置 / Save verified configuration', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
    });
    const row = page.locator('[data-automation-id^="agent.model.row."]').filter({ hasText: name });
    const value = await row.getAttribute('data-automation-id');
    if (!value?.startsWith('agent.model.row.')) throw new Error('The Provider row has no public identity.');
    ids.push(value.slice('agent.model.row.'.length));
  };
  const renameChat = async (name: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.rename).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.title).fill(name);
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.confirm).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector)).toContainText(name);
  };
  try {
    // 准备：两个明确标记的本地无Key服务，不配置或记录真实模型凭据。
    // Arrange: use two explicitly identified keyless local endpoints, never real provider credentials.
    await media.step('01-settings', '打开 Agent 设置 / Open Agent settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    });
    await configure('Guide model one', 'guide-one', 'guide-one');
    await configure('Guide model two', 'guide-two', 'guide-two');
    const [first, second] = ids;
    if (!first || !second) throw new Error('The two demo Providers were not created.');
    await media.step('02-edit', '编辑第二个 Model ID / Edit the second Model ID', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentModelEdit(second)).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('guide-two-edited');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.save)).toBeDisabled();
    });
    await media.step('03-retest', '更改后重新测试 / Retest changed configuration', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.save)).toBeEnabled();
    });
    await media.step('04-save-edit', '保存编辑 / Save the edit', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
    });
    await media.step('05-first-chat', '建立使用第一个默认模型的 Chat / Create a Chat with the first default', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      await expect(panel.getByRole('button').filter({ hasText: 'Guide model one' })).toBeVisible();
    });
    await media.step('06-chat-name', '重命名 Guide chat one / Rename Guide chat one', async () => { await renameChat('Guide chat one'); });
    await media.step('07-default', '将第二个模型设为全局默认 / Make the second model the default', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentModelSetDefault(second)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentModelRow(second))).toHaveAttribute('data-default', 'true');
      await expect(panel.getByRole('button').filter({ hasText: 'Guide model one' })).toBeVisible();
    });
    await media.step('08-current-model', '只改变当前 Chat 模型 / Change only the current Chat model', async () => {
      await panel.getByRole('button').filter({ hasText: 'Guide model one' }).click();
      await page.getByRole('option').filter({ hasText: 'Guide model two' }).click();
      await expect(panel.getByRole('button').filter({ hasText: 'Guide model two' })).toBeVisible();
    });
    await media.step('09-new-chat', '新建第二个 Chat / Create a second Chat', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      await expect(panel.getByRole('button').filter({ hasText: 'Guide model two' })).toBeVisible();
    });
    await media.step('10-second-name', '重命名 Guide chat two / Rename Guide chat two', async () => { await renameChat('Guide chat two'); });
    await media.step('11-switch-chat', '切回 Guide chat one / Return to Guide chat one', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await page.getByRole('option').filter({ hasText: 'Guide chat one' }).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector)).toContainText('Guide chat one');
    });
    await media.step('12-delete-dialog', '检查删除 Chat 确认 / Review Chat deletion', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.delete).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.dialog)).toBeVisible();
    });
    await media.step('13-cancel-delete', '取消删除 / Cancel deletion', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.cancel).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector)).toContainText('Guide chat one');
    });
    await media.step('14-disable-tool', '关闭 Agent 暂停录制权限 / Disable the Agent stop-recording Tool', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('capture_stop_recording');
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording'))).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('15-enforcement', '验证被禁用 Tool 不能执行 / Verify a disabled Tool cannot execute', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-disabled-stop', name: 'capture_stop_recording', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: the Tool is unavailable; no operation was performed.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill('Request the disabled capture_stop_recording Tool for this demo.');
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-disabled-stop'))).toHaveCount(0);
      const history = openAiCompatibleLab.requestsForAssertions().at(-1);
      expect(JSON.stringify(history?.messages)).toContain('unknown_tool');
    });
    await media.step('16-restore-tool', '恢复原权限 / Restore the original capability', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_stop_recording'))).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('17-remove-model-dialog', '检查删除无用 Provider / Review removing an unused Provider', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentModelRemove(first)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.removeProvider.dialog)).toBeVisible();
    });
    await media.step('18-remove-model', '删除第一个演示 Provider / Remove the first demo Provider', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.removeProvider.confirm).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.models.list)).toHaveAttribute('data-model-count', '1');
    });
    await media.step('19-delete-chat-dialog', '再次检查删除 Chat / Review deleting the demo Chat', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.delete).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.dialog)).toBeVisible();
    });
    await media.step('20-delete-chat', '确认删除 Guide chat one / Delete Guide chat one', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.confirm).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.selector).click();
      await expect(page.getByRole('option').filter({ hasText: 'Guide chat one' })).toHaveCount(0);
      await expect(page.getByRole('option').filter({ hasText: 'Guide chat two' })).toBeVisible();
    });
    // 证据：不只拍开关；拒绝的调用与默认/当前Chat模型分别由实际状态核对。
    // Evidence: verify enforcement and separate default/Chat selection, not just switch appearance.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ firstProfile: 'Guide model one', secondProfile: 'Guide model two',
      firstModel: 'guide-one', editedModel: 'guide-two-edited',
      firstEndpoint: openAiCompatibleLab.baseUrl('guide-one'), secondEndpoint: openAiCompatibleLab.baseUrl('guide-two'),
      firstChat: 'Guide chat one', secondChat: 'Guide chat two', tool: 'capture_stop_recording', credentials: 'none' });
  }
  // 清理：driver使用正式Close核对进程、listener和宿主恢复。
  // Cleanup: the driver verifies actual Close, process/listener shutdown and host recovery.
});
