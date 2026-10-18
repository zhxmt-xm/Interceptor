import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import {
  cancelMacosFileDialog,
  prepareMacosFileDialogPath,
  submitMacosFileDialogPath,
} from '../../fixtures/ui/macos-file-dialog';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;
type ToolOutcome =
  | { readonly kind: 'result'; readonly value: ToolResult }
  | { readonly kind: 'error'; readonly error: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readToolValue(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || result.isError === true || !Array.isArray(result.content)) {
    throw new Error('The Collection file Tool failed.');
  }
  const text = result.content.find((part) => isRecord(part) && part.type === 'text');
  if (!isRecord(text) || typeof text.text !== 'string') throw new Error('The Tool omitted its JSON result.');
  const value: unknown = JSON.parse(text.text);
  if (!isRecord(value)) throw new Error('The Tool result is not an object.');
  return value;
}

test('composer file guide keeps native dialogs and import confirmation for actual MCP Tools', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  const language = await page.locator('html').getAttribute('lang');
  if (!language) throw new Error('The ready App omitted its language.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-collection-files-'));
  const exportFile = path.join(directory, 'guide-tool-collection.json');
  const cancelledFile = path.join(directory, 'guide-cancelled-collection.json');
  const requestName = 'Guide file request';
  const clientName = 'Guide Collection files';
  const url = httpTrafficRunner.url('/guide/collection-file-tools');
  const owner = desktopApp.nativeFileDialogOwner();
  const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
  const importDialog = getByAutomationId(page, AUTOMATION_IDS.composer.import.dialog);
  const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
  const mcpClient = new Client({ name: 'guide-collection-files', version: '1.0.0' }, {
    supportedProtocolVersions: ['2026-07-28'],
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  });
  let pending: Promise<ToolOutcome> | undefined;
  let media: GuidebookMedia | undefined;
  let nativePending = false;
  let clientClosed = false;
  let completed = false;
  let endpoint = '';
  let originalRequestId = '';
  let initialRevision = -1;

  const beginCall = (name: string): void => {
    pending = mcpClient.callTool({ name, arguments: {} }).then<ToolOutcome, ToolOutcome>(
      (value) => ({ kind: 'result', value }),
      (error: unknown) => ({ kind: 'error', error }),
    );
  };
  const finishCall = async (): Promise<ToolResult> => {
    if (!pending) throw new Error('No Collection file call is pending.');
    const outcome = await pending;
    pending = undefined;
    if (outcome.kind === 'error') throw new Error('Collection file transport failed.', { cause: outcome.error });
    return outcome.value;
  };
  const checkRows = async (count: number): Promise<void> => {
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest)).toHaveCount(count);
    await expect(getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(originalRequestId)))
      .toContainText(requestName);
    await expect(collection).toHaveAttribute('data-save-state', 'saved');
    const ids = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest)
      .evaluateAll(rows => rows.map(row => row.getAttribute('data-automation-id')));
    expect(new Set(ids).size).toBe(count);
    expect(ids.every(id => id?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest))).toBe(true);
    expect(httpTrafficRunner.evidence()).toHaveLength(0);
  };

  try {
    // 准备：独立Ask Client由产品创建；凭据只留在SDK内存，不录复制内容。
    // Arrange: create a separate Ask Client through the product; keep credentials only in SDK memory and exclude copied configuration from media.
    await openMcpSettings(page);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill(clientName);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const clientId = await page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
    if (!clientId) throw new Error('The created Client omitted its public identity.');
    const config = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
    endpoint = config.url;
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
    }));
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-file-tools');

    // 用户操作：唯一导入文件必须先由本流程中的产品Export产生，不预造业务输入。
    // User actions: produce the sole import file through this flow's product Export, never fabricated business input.
    await media.step('01-request', '创建并命名本轮请求 / Create and name this request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest);
      await expect(row).toHaveCount(1);
      const id = await row.getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('The created request omitted its identity.');
      originalRequestId = id.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
      await row.click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(originalRequestId, 'rename')).click();
      const rename = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(originalRequestId));
      await rename.fill(requestName);
      await rename.press('Enter');
    });
    await media.step('02-url', '填写本轮公开测试地址 / Enter the public test URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url);
    });
    await media.step('03-header', '保存公开Header但不Send / Save a public Header without sending', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-guide-file');
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('public-collection');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
      await expect(collection).toHaveAttribute('data-save-state', 'saved');
      const revision = await collection.getAttribute('data-revision');
      if (!revision || !/^\d+$/.test(revision)) throw new Error('The saved Collection omitted its revision.');
      initialRevision = Number(revision);
    });
    await media.step('04-export-ask', '检查Collection Export审批 / Inspect Collection Export approval', async () => {
      beginCall('composer_export_collection');
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_export_collection');
    });
    await media.step('05-export-deny', 'Deny不写出文件 / Deny without writing a file', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect(await finishCall()).toMatchObject({ isError: true });
      expect(await readdir(directory)).toEqual([]);
    });
    await media.step('06-export-cancel-ask', '再次请求Export并Allow / Request Export again and allow it', async () => {
      beginCall('composer_export_collection');
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_export_collection');
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      nativePending = true;
    });
    await prepareMacosFileDialogPath(owner, cancelledFile);
    await media.nativeDialogStep('07-save-cancel-panel', '在自有目录查看Save面板 / Inspect Save in the owned directory');
    await cancelMacosFileDialog(owner);
    nativePending = false;
    await media.step('08-save-cancelled', '取消原生Save后没有导出 / Native Save cancellation does not export', async () => {
      expect(readToolValue(await finishCall())).toEqual({ exported: false });
      expect(await readdir(directory)).toEqual([]);
      await checkRows(1);
    });
    await media.step('09-export-save-ask', '请求真正保存的Export / Request the Export to save', async () => {
      beginCall('composer_export_collection');
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_export_collection');
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      nativePending = true;
    });
    await submitMacosFileDialogPath(owner, exportFile, () =>
      media!.nativeDialogStep('10-save-file', '保存guide-tool-collection.json / Save guide-tool-collection.json'));
    nativePending = false;
    await media.step('11-export-result', '检查产品实际导出的文件 / Inspect the file actually exported by the product', async () => {
      expect(readToolValue(await finishCall())).toEqual({ exported: true });
      const exported: unknown = JSON.parse(await readFile(exportFile, 'utf8'));
      expect(exported).toMatchObject({ nodes: [{
        kind: 'request', id: originalRequestId, name: requestName, url,
        headers: [{ name: 'x-guide-file', value: 'public-collection', enabled: true }],
      }] });
      expect(await readdir(directory)).toEqual([path.basename(exportFile)]);
    });
    await media.step('12-import-deny-ask', '检查Import自己的审批 / Inspect the separate Import approval', async () => {
      beginCall('composer_import_collection');
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_import_collection');
    });
    await media.step('13-import-denied', 'Deny不导入Collection / Deny without importing the Collection', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect(await finishCall()).toMatchObject({ isError: true });
      await checkRows(1);
    });
    await media.step('14-open-cancel-ask', 'Allow后仍需要Open面板 / Allow still requires an Open panel', async () => {
      beginCall('composer_import_collection');
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_import_collection');
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      nativePending = true;
    });
    await prepareMacosFileDialogPath(owner, exportFile);
    await media.nativeDialogStep('15-open-cancel-panel', '只选择本流程导出的文件 / Select only this flow’s exported file');
    await cancelMacosFileDialog(owner);
    nativePending = false;
    await media.step('16-open-cancelled', '取消Open保留原集合 / Cancel Open and retain the original Collection', async () => {
      expect(readToolValue(await finishCall())).toEqual({ imported: false });
      await checkRows(1);
    });
    for (const mode of ['cancel-preview', 'confirm-preview'] as const) {
      await media.step(`${mode}-ask`, '再次检查Import审批 / Review Import approval again', async () => {
        beginCall('composer_import_collection');
        await expect(approval).toHaveAttribute('data-tool-name', 'composer_import_collection');
        await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
        nativePending = true;
      });
      await submitMacosFileDialogPath(owner, exportFile, () =>
        media!.nativeDialogStep(`${mode}-open`, '打开同一份产品文件 / Open the same product-created file'));
      nativePending = false;
      await media.step(`${mode}-preview`, '读取真实导入预览 / Read the actual import preview', async () => {
        await expect(importDialog).toBeVisible();
        await expect(getByAutomationId(page, AUTOMATION_IDS.composer.import.fileName)).toContainText(path.basename(exportFile));
      });
      await media.step(`${mode}-decision`, mode === 'cancel-preview'
        ? '取消预览不修改集合 / Cancel preview without changing the Collection'
        : '确认追加而不覆盖原请求 / Confirm append without replacing the original request', async () => {
        await getByAutomationId(page, mode === 'cancel-preview'
          ? AUTOMATION_IDS.composer.import.cancel : AUTOMATION_IDS.composer.import.confirm).click();
        const value = readToolValue(await finishCall());
        if (mode === 'cancel-preview') {
          expect(value).toEqual({ imported: false });
          await checkRows(1);
          await expect(collection).toHaveAttribute('data-revision', String(initialRevision));
        } else {
          expect(value).toMatchObject({
            imported: true, revision: initialRevision + 1,
            requestCount: 1, folderCount: 0, skippedCount: 0,
          });
          await checkRows(2);
        }
        await expect(importDialog).toHaveCount(0);
      });
    }
    await media.step('auto-mode', '为本轮重复导入选择Auto / Select Auto for this repeated import', async () => {
      await openMcpSettings(page);
      await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId))).toHaveAttribute('data-execution-mode', 'auto');
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    });
    beginCall('composer_import_collection');
    nativePending = true;
    await submitMacosFileDialogPath(owner, exportFile, () =>
      media!.nativeDialogStep('auto-open', 'Auto仍使用真实Open / Auto still uses native Open'));
    nativePending = false;
    await media.step('auto-preview', 'Auto仍等待产品预览确认 / Auto still waits for product preview confirmation', async () => {
      await expect(importDialog).toBeVisible();
      await expect(approval).toHaveCount(0);
      await checkRows(2);
    });
    await media.step('auto-confirm', '确认第二次追加并检查独立身份 / Confirm the second append and check distinct identities', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.import.confirm).click();
      expect(readToolValue(await finishCall())).toMatchObject({
        imported: true, revision: initialRevision + 2, requestCount: 1, folderCount: 0, skippedCount: 0,
      });
      await checkRows(3);
    });
    await media.step('stop-server', '关闭本轮MCP Server / Disable this run’s MCP Server', async () => {
      await mcpClient.close();
      clientClosed = true;
      await openMcpSettings(page);
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });

    // 业务断言与证据：只追加真实产品文件，不自动发请求；身份与原节点分别核对。
    // Assertions and evidence: append only the product-created file, without sending; verify identities and original nodes separately.
    expect(httpTrafficRunner.evidence()).toHaveLength(0);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    completed = true;
  } finally {
    // 清理：取消本次原生面板/预览/审批，关闭SDK，原driver验证正常退出与宿主恢复。
    // Cleanup: cancel this run’s native panel, preview or approval and close the SDK; the existing driver verifies normal exit and host restoration.
    try {
      if (nativePending) await cancelMacosFileDialog(owner);
      if (await importDialog.isVisible()) await getByAutomationId(page, AUTOMATION_IDS.composer.import.cancel).click();
      if (pending && await approval.isVisible()) await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      if (!clientClosed) await mcpClient.close();
      if (pending) await pending;
    } finally {
      if (media) await media.stop({
        caller: 'Official local SDK, not a commercial Host UI', clientName, endpoint,
        requestName, url, header: 'x-guide-file: public-collection',
        exportedFile: path.basename(exportFile), cancelledFile: path.basename(cancelledFile),
        sourceOfImport: 'The same file exported by the product in this workflow',
        importSemantics: 'Cancel does not write; confirmation appends with fresh request identities; Auto still confirms',
        networkRequests: '0; file Tools do not Send',
      });
      if (completed) await rm(directory, { recursive: true, force: true });
    }
  }
});
