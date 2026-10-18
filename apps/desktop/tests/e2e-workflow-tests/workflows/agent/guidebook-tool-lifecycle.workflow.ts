import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cancelMacosFileDialog, prepareMacosFileDialogPath, submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('agent guide separates completed Tool effects from Stop Retry and records actual Diagnostics file approval', async ({
  desktopApp, openAiCompatibleLab, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-agent-tools-'));
  const canceledFile = path.join(directory, 'guide-cancelled.jsonl');
  const exportedFile = path.join(directory, 'guide-agent-diagnostics.jsonl');
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const session = getByAutomationId(page, AUTOMATION_IDS.agent.session.root);
  const transcript = getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript);
  let completed = false;
  let nativeCancelPending = false;
  const toolValue = (callId: string): Record<string, unknown> => {
    for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
      if (!Array.isArray(request.messages)) continue;
      const message = request.messages.find(item => record(item) && item.role === 'tool' && item.tool_call_id === callId);
      if (!record(message) || typeof message.content !== 'string') continue;
      const payload: unknown = JSON.parse(message.content);
      if (record(payload) && payload.ok === false) throw new Error(`The actual Tool ${callId} failed: ${JSON.stringify(payload.error)}`);
      if (!record(payload) || payload.ok !== true || !record(payload.value)) throw new Error(`The actual Tool ${callId} failed or returned an invalid value.`);
      return payload.value;
    }
    throw new Error(`The actual Tool ${callId} has no returned message.`);
  };
  const send = async (prompt: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
    await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  };
  // 准备：模型无Key且由本机提供，Diagnostics的素材来自一次真实Composer Send。
  // Arrange: use a keyless local model and generate Diagnostics through a real Composer Send.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/agent-tools');
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url('/guide/agent-tools/source'));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => httpTrafficRunner.observation('/guide/agent-tools/source')?.method).toBe('GET');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Guide Tool demo');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('guide-tool-lifecycle'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('guide-tool-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'agent-tool-lifecycle');
  try {
    await media.step('01-agent', '打开Agent并建立Chat / Open Agent and create a Chat', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    });
    await media.step('02-ask', '明确选择Ask / Explicitly choose Ask', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.ask).click();
      await expect(session).toHaveAttribute('data-tool-execution-mode', 'ask');
    });
    await media.step('03-side-effect-prompt', '请求暂停后继续解释 / Ask to pause Recording and then continue explaining', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-lifecycle-discover', name: 'discover_tools', arguments: { capabilityId: 'capture' } });
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-lifecycle-pause', name: 'capture_stop_recording', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: Recording was paused. This explanation is still streaming.'], holdOpen: true });
      await send('Pause recording after asking me, then continue a streaming explanation.');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-lifecycle-pause'))).toHaveAttribute('data-approval-status', 'pending');
    });
    await media.step('04-allow-pause', '允许已明确的暂停操作 / Allow the explicit pause operation', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAllow('guide-lifecycle-pause')).click();
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
      await expect(transcript).toContainText('This explanation is still streaming.');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop)).toBeVisible();
    });
    await media.step('05-stop-after-tool', 'Stop模型回复不撤销已完成的Tool / Stop the response without undoing the completed Tool', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop).click();
      await expect(session).toHaveAttribute('data-turn-status', 'cancelled');
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-lifecycle-pause'))).toHaveAttribute('data-approval-status', 'allowed');
    });
    await media.step('06-retry', 'Retry本次只继续解释 / Retry with explanation only in this example', async () => {
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: Recording is already paused; this retry did not request another business action.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.turn.retry).click();
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('07-clarify', '重新明确只读目标 / Restate a read-only goal', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-status-discover', name: 'discover_tools', arguments: { capabilityId: 'capture' } });
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-lifecycle-status', name: 'capture_get_proxy_status', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: the actual status query confirms Recording remains paused.'] });
      await send('Keep recording paused. Only read and explain its current status.');
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-lifecycle-status'))).toHaveAttribute('data-summary-kind', 'proxy');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-lifecycle-status'))).toHaveCount(0);
    });
    await media.step('08-diagnostics-recent', '执行真实Diagnostics Recent查询 / Execute a real Diagnostics Recent query', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-discover', name: 'discover_tools', arguments: { capabilityId: 'diagnostics' } });
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-recent', name: 'diagnostics_get_recent', arguments: { limit: 200 } });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: these are the actual recent diagnostic records, not a business success guarantee.'] });
      await send('Read recent Diagnostics records without changing application state.');
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-diag-recent'))).toHaveAttribute('data-summary-kind', 'diagnosticsSnapshot');
    });
    const recent = toolValue('guide-diag-recent');
    if (!Array.isArray(recent.records)) throw new Error('Diagnostics Recent omitted records.');
    const source = recent.records.find(item => record(item) && item.command === 'composer.send' && typeof item.traceId === 'string');
    if (!record(source) || typeof source.traceId !== 'string') throw new Error('The actual Composer trace was not found.');
    const traceId = source.traceId;
    await media.step('09-read-trace', '用刚返回的traceId查询关联记录 / Query related records using the returned traceId', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-trace', name: 'diagnostics_get_trace', arguments: { traceId } });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: the selected trace contains the actual Composer operation.'] });
      await send('Read the trace returned by the previous Diagnostics query.');
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      const trace = toolValue('guide-diag-trace');
      if (!Array.isArray(trace.records)) throw new Error('Diagnostics Trace omitted records.');
      expect(trace.records.length).toBeGreaterThan(0);
      expect(trace.records.every(item => record(item) && item.traceId === traceId)).toBe(true);
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-diag-trace'))).toHaveAttribute('data-summary-kind', 'diagnosticsSnapshot');
    });
    await media.step('10-export-request', '请求需要审批的Diagnostics导出 / Request a Diagnostics export requiring approval', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-cancel', name: 'diagnostics_export', arguments: { process: 'core', level: 'info', outcome: 'success' } });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: the native file selection was cancelled; no export was started.'] });
      await send('Export the selected Diagnostics records after asking me.');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-diag-cancel'))).toHaveAttribute('data-approval-status', 'pending');
    });
    await getByAutomationId(page, AutomationIdFactory.agentToolAllow('guide-diag-cancel')).click();
    nativeCancelPending = true;
    await prepareMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), canceledFile);
    await media.nativeDialogStep('11-native-cancel-panel', '审批后仍需真实Save窗口 / Approval still leads to a real Save window');
    await media.step('12-cancel-native', '取消原生保存而不是伪造返回值 / Cancel native saving without replacing its return value', async () => {
      await cancelMacosFileDialog(desktopApp.nativeFileDialogOwner());
      nativeCancelPending = false;
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-diag-cancel'))).toHaveAttribute('data-summary-kind', 'exportCanceled');
      expect(await readdir(directory)).toEqual([]);
    });
    await media.step('13-export-again', '重新发起并检查参数 / Request export again and review parameters', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-export', name: 'diagnostics_export', arguments: { process: 'core', level: 'info', outcome: 'success' } });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: export was started. Query the returned job before treating it as complete.'] });
      await send('Export those Diagnostics records again, and let me choose the file.');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-diag-export'))).toHaveAttribute('data-approval-status', 'pending');
    });
    await getByAutomationId(page, AutomationIdFactory.agentToolAllow('guide-diag-export')).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), exportedFile, () => media.nativeDialogStep(
      '14-native-save', '保存guide-agent-diagnostics.jsonl / Save guide-agent-diagnostics.jsonl',
    ));
    await media.step('15-started-result', '区分任务已开始与完成 / Distinguish a started job from completion', async () => {
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-diag-export'))).toHaveAttribute('data-summary-kind', 'diagnosticsExport');
    });
    const exported = toolValue('guide-diag-export');
    if (exported.started !== true || !record(exported.job) || typeof exported.job.id !== 'string') throw new Error('The actual export did not return its job ID.');
    const jobId = exported.job.id;
    await media.step('16-completion-query', '查询实际文件任务直到完成 / Query the actual file task for completion', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-diag-job', name: 'capture_get_transfer_job', arguments: { jobId } });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: the task result reports completion. The actual file still needs a privacy review before sharing.'] });
      await send('Check whether the export task has finished.');
      await expect(session).toHaveAttribute('data-turn-status', 'completed');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('guide-diag-job'))).toHaveAttribute('data-transfer-job-state', 'completed');
      const records: unknown[] = (await readFile(exportedFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ command: 'composer.send' })]));
    });
    await media.step('17-final-state', '保留暂停状态并核对实际结果 / Retain the paused state and verify the actual result', async () => {
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop)).toHaveCount(0);
    });
    // 证据：Tool、Stop/Retry、原生取消和已完成文件分别核对，不从模型文字推断业务成功。
    // Evidence: verify Tools, Stop/Retry, native cancellation and file completion independently of model prose.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    if (nativeCancelPending) await cancelMacosFileDialog(desktopApp.nativeFileDialogOwner());
    const stop = getByAutomationId(page, AUTOMATION_IDS.agent.turn.stop);
    if (await stop.isVisible()) await stop.click();
    await media.stop({
      model: 'Guide Tool demo; deterministic local keyless endpoint', endpoint: openAiCompatibleLab.baseUrl('guide-tool-lifecycle'),
      pausePrompt: 'Pause recording after asking me, then continue a streaming explanation.',
      clarification: 'Keep recording paused. Only read and explain its current status.',
      queryTools: 'diagnostics_get_recent, diagnostics_get_trace', exportTool: 'diagnostics_export',
      taskQuery: 'capture_get_transfer_job', canceledFile: 'guide-cancelled.jsonl', savedFile: 'guide-agent-diagnostics.jsonl',
      stopBoundary: 'A completed Recording pause remains applied after stopping the later model reply',
      retryBoundary: 'This retry requests explanation only; other models may propose new actions and require fresh review',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：正式Close取消剩余模型连接并验证Main/Core/Worker、代理、CA和8888。
  // Cleanup: normal Close cancels remaining model connections and verifies Main/Core/Worker, proxy/CA and port 8888.
});
