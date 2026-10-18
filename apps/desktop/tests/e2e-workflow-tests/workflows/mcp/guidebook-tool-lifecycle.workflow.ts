import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';
import { cancelMacosFileDialog, prepareMacosFileDialogPath, submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function payload(result: unknown): Record<string, unknown> {
  if (!record(result) || result.isError === true || !Array.isArray(result.content)) throw new Error('The actual MCP operation failed.');
  const text = result.content.find(item => record(item) && item.type === 'text');
  if (!record(text) || typeof text.text !== 'string') throw new Error('The actual MCP result has no text payload.');
  const parsed: unknown = JSON.parse(text.text);
  if (!record(parsed)) throw new Error('The actual MCP payload is not an object.');
  return parsed;
}

test('mcp guide records query results, native export cancellation and revoking a Client with an in-flight request', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-mcp-tools-'));
  const canceledFile = path.join(directory, 'guide-mcp-cancelled.jsonl');
  const exportFile = path.join(directory, 'guide-mcp-diagnostics.jsonl');
  const longPath = '/guide/mcp-tools/in-flight';
  const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
  let client: Client | undefined;
  let pending: ReturnType<Client['callTool']> | undefined;
  let nativeCancelPending = false;
  let releaseResponse: (() => void) | undefined;
  let longOutcome: Promise<unknown> | undefined;
  let completed = false;
  const abortController = new AbortController();
  const connect = async (url: string, token: string): Promise<Client> => {
    const connected = new Client({ name: 'guide-mcp-tools', version: '1.0.0' }, {
      supportedProtocolVersions: ['2026-07-28'], versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
    await connected.connect(new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    }));
    return connected;
  };
  // 准备：产品创建独立Ask Client；配置只放SDK内存，记录来自真正的Composer Send。
  // Arrange: create a separate Ask Client through the product; keep configuration in SDK memory and create records by real Composer Send.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/mcp-tools');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url('/guide/mcp-tools/source'));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => httpTrafficRunner.observation('/guide/mcp-tools/source')?.method).toBe('GET');
  await openMcpSettings(page);
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Guide MCP lifecycle');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const clientId = await page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
  if (!clientId) throw new Error('The created Client has no public identity.');
  const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  client = await connect(configuration.url, configuration.token);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'mcp-tool-lifecycle');
  try {
    await media.step('01-client', '查看本次真实SDK Client / Inspect this actual SDK Client', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId)).scrollIntoViewIfNeeded();
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId))).toHaveAttribute('data-execution-mode', 'ask');
    });
    await media.step('02-pause-permission', '定位本次暂停Tool的MCP权限 / Locate MCP permission for this pause Tool', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('capture_stop_recording');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch('capture_stop_recording'))).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('03-pending-ask', '发起一个尚待审批的操作 / Start an operation awaiting approval', async () => {
      pending = client!.callTool({ name: 'capture_stop_recording', arguments: {} }, { signal: abortController.signal });
      await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
    });
    await media.step('04-caller-abort', '调用方真实取消该请求 / Have the caller actually cancel the request', async () => {
      if (!pending) throw new Error('The cancellable MCP call was not started.');
      const rejected = expect(pending).rejects.toThrow();
      abortController.abort(new Error('The owned demo Host cancelled this call.'));
      await rejected;
      pending = undefined;
      await expect(approval).toHaveCount(0);
      expect(payload(await client!.callTool({ name: 'capture_get_proxy_status', arguments: {} }))).toMatchObject({ recording: true });
    });
    await media.step('05-diagnostics-permissions', '定位Diagnostics查询与导出权限 / Locate Diagnostics query and export permissions', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('diagnostics');
      for (const name of ['diagnostics_get_recent', 'diagnostics_get_trace', 'diagnostics_export']) {
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'true');
      }
    });
    let traceId = '';
    await media.step('06-recent', 'SDK实际查询Recent且不出现审批 / Query Recent through the SDK without approval', async () => {
      const value = payload(await client!.callTool({ name: 'diagnostics_get_recent', arguments: { limit: 200 } }));
      if (!Array.isArray(value.records)) throw new Error('Recent omitted records.');
      const source = value.records.find(item => record(item) && item.command === 'composer.send' && typeof item.traceId === 'string');
      if (!record(source) || typeof source.traceId !== 'string') throw new Error('The actual Composer trace is missing.');
      traceId = source.traceId;
      await expect(approval).toHaveCount(0);
    });
    await media.step('07-trace', '用返回的traceId查询Trace / Query Trace using the returned traceId', async () => {
      const value = payload(await client!.callTool({ name: 'diagnostics_get_trace', arguments: { traceId } }));
      if (!Array.isArray(value.records)) throw new Error('Trace omitted records.');
      expect(value.records.length).toBeGreaterThan(0);
      expect(value.records.every(item => record(item) && item.traceId === traceId)).toBe(true);
      await expect(approval).toHaveCount(0);
    });
    await media.step('08-export-ask', '请求导出并检查实际参数 / Request export and review actual arguments', async () => {
      pending = client!.callTool({ name: 'diagnostics_export', arguments: { process: 'core', level: 'info', outcome: 'success' } });
      await expect(approval).toHaveAttribute('data-tool-name', 'diagnostics_export');
    });
    await media.step('09-deny', 'Deny不打开文件窗口 / Deny without opening a file window', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect(await pending).toMatchObject({ isError: true });
      pending = undefined;
      expect(await readdir(directory)).toEqual([]);
    });
    await media.step('10-export-again', '再次请求导出 / Request export again', async () => {
      pending = client!.callTool({ name: 'diagnostics_export', arguments: {} });
      await expect(approval).toHaveAttribute('data-tool-name', 'diagnostics_export');
    });
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    nativeCancelPending = true;
    await prepareMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), canceledFile);
    await media.nativeDialogStep('11-native-panel', 'Allow后仍有真正的Save窗口 / Allow still opens a real Save window');
    await media.step('12-native-cancel', '真实取消原生Save / Actually cancel native Save', async () => {
      await cancelMacosFileDialog(desktopApp.nativeFileDialogOwner());
      nativeCancelPending = false;
      expect(payload(await pending)).toMatchObject({ started: false });
      pending = undefined;
      expect(await readdir(directory)).toEqual([]);
    });
    await media.step('13-export-save', '重新请求需要保存的导出 / Request the export to save', async () => {
      pending = client!.callTool({ name: 'diagnostics_export', arguments: { process: 'core', level: 'info', outcome: 'success' } });
      await expect(approval).toHaveAttribute('data-tool-name', 'diagnostics_export');
    });
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), exportFile, () => media.nativeDialogStep(
      '14-save', '保存guide-mcp-diagnostics.jsonl / Save guide-mcp-diagnostics.jsonl',
    ));
    await media.step('15-job-completed', '查询真实任务并核对文件 / Query the actual task and verify the file', async () => {
      const value = payload(await pending);
      pending = undefined;
      if (value.started !== true || !record(value.job) || typeof value.job.id !== 'string') throw new Error('Export did not return a started task.');
      const jobId = value.job.id;
      await expect.poll(async () => {
        const snapshot = payload(await client!.callTool({ name: 'capture_get_transfer_job', arguments: { jobId } }));
        return record(snapshot.job) ? snapshot.job.state : undefined;
      }).toBe('completed');
      const records: unknown[] = (await readFile(exportFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ command: 'composer.send' })]));
    });
    await media.step('16-clear-search', '清空搜索返回Client控制 / Clear search and return to Client controls', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('');
      await getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId)).scrollIntoViewIfNeeded();
    });
    await media.step('17-auto', '本次长调用选择Auto / Select Auto for this long-call example', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId))).toHaveAttribute('data-execution-mode', 'auto');
    });
    await media.step('18-long-request', '发起真实未完成的Composer请求 / Start an actual unfinished Composer request', async () => {
      releaseResponse = httpTrafficRunner.holdResponse(longPath);
      longOutcome = client!.callTool({
        name: 'composer_send_request',
        arguments: { method: 'GET', url: httpTrafficRunner.url(longPath), headers: [], protocol: 'http/1.1' },
      }).then(result => ({ kind: 'result', result }),
        (error: unknown) => ({ kind: 'error', message: error instanceof Error ? error.message : String(error) }));
      await expect.poll(() => httpTrafficRunner.observation(longPath)?.method).toBe('GET');
      expect(httpTrafficRunner.responseWasAborted(longPath)).toBe(false);
      await expect(approval).toHaveCount(0);
    });
    await media.step('19-revoke-dialog', '在途调用期间打开撤销确认 / Open revocation confirmation during the call', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeDialog)).toBeVisible();
    });
    await media.step('20-revoke', '撤销Client并核对真实请求取消 / Revoke the Client and verify actual request cancellation', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
      await expect.poll(() => httpTrafficRunner.responseWasAborted(longPath)).toBe(true);
      const result = await longOutcome;
      if (!record(result)) throw new Error('The in-flight call has no terminal outcome.');
      if (result.kind === 'result') expect(result.result).toMatchObject({ isError: true });
      else expect(result.kind).toBe('error');
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId))).toHaveCount(0);
    });
    await media.step('21-old-identity', '旧Client身份不能再查询 / Verify the old Client identity cannot query again', async () => {
      await expect(client!.callTool({ name: 'capture_get_proxy_status', arguments: {} })).rejects.toThrow();
    });
    await media.step('22-stop', '关闭本轮MCP Server / Disable this run’s MCP Server', async () => {
      await client!.close();
      client = undefined;
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    // 证据：SDK结果、原生文件和真实socket取消分别核对；App画面不冒充商业Host界面。
    // Evidence: independently verify SDK results, native files and actual socket cancellation; App images are not commercial Host screens.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    try {
      if (nativeCancelPending) await cancelMacosFileDialog(desktopApp.nativeFileDialogOwner());
      if (pending && await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).isVisible()) {
        await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
        await pending;
      }
      releaseResponse?.();
      await longOutcome;
      await client?.close();
    } finally {
      await media.stop({
        caller: 'Official SDK on localhost; App-side UI, not an external Host settings page',
        clientName: 'Guide MCP lifecycle', endpoint: configuration.url,
        queries: 'diagnostics_get_recent and diagnostics_get_trace using the actual returned traceId',
        file: 'guide-mcp-diagnostics.jsonl', cancelledFile: 'guide-mcp-cancelled.jsonl',
        inFlightUrl: httpTrafficRunner.url(longPath), revocation: 'The owned Composer socket is cancelled and the old Client can no longer query',
      });
      if (completed) await rm(directory, { recursive: true, force: true });
    }
  }
  // 清理：关闭SDK、释放自有响应gate，正常Close核对App进程、代理、CA和8888。
  // Cleanup: close the SDK, release the owned response gate and verify App processes, proxy/CA and port 8888 through normal Close.
});
