import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;
type ToolOutcome =
  | { readonly kind: 'result'; readonly result: ToolResult }
  | { readonly kind: 'error'; readonly error: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readToolPayload(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || result.isError === true || !Array.isArray(result.content)) {
    throw new Error('The actual Composer MCP operation failed.');
  }
  const text = result.content.find((item) => isRecord(item) && item.type === 'text');
  if (!isRecord(text) || typeof text.text !== 'string') {
    throw new Error('The Composer MCP result omitted its text payload.');
  }
  const value: unknown = JSON.parse(text.text);
  if (!isRecord(value)) throw new Error('The Composer MCP result is not an object.');
  return value;
}

function readSavedCollection(result: unknown) {
  const value = readToolPayload(result);
  if (!isRecord(value.collection)) throw new Error('The Collection query omitted its saved collection.');
  const { revision, nodes } = value.collection;
  if (typeof revision !== 'number' || !Number.isInteger(revision)
    || !Array.isArray(nodes) || !nodes.every(isRecord)) {
    throw new Error('The Collection query omitted its revision or complete node tree.');
  }
  return { revision, nodes };
}

test('composer guide records actual MCP Ask sending and notification-driven Collection replacement', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const initialLanguage = await page.locator('html').getAttribute('lang');
  if (!initialLanguage) throw new Error('The ready App has no declared language.');
  const clientName = 'Guide Composer tools';
  const originalName = 'Guide UI request';
  const replacedName = 'Guide MCP renamed request';
  const savedPath = '/guide/composer-tools/saved';
  const sentPath = '/guide/composer-tools/allowed';
  const savedUrl = httpTrafficRunner.url(savedPath);
  const sentUrl = httpTrafficRunner.url(sentPath);
  const requestBody = '{"message":"guide-tool-request"}';
  const responseBody = '{"message":"guide-tool-response"}';
  const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
  const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
  const mcpClient = new Client({ name: 'guide-composer-tools', version: '1.0.0' }, {
    supportedProtocolVersions: ['2026-07-28'],
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  });
  let pending: Promise<ToolOutcome> | undefined;
  let media: GuidebookMedia | undefined;
  let endpoint = '';
  let requestId = '';
  let originalRevision = -1;
  let finalRevision = -1;
  let replacementNodes: Record<string, unknown>[] = [];
  let clientClosed = false;

  const beginChange = (name: string, args: Record<string, unknown>): void => {
    pending = mcpClient.callTool({ name, arguments: args }).then<ToolOutcome, ToolOutcome>(
      (result) => ({ kind: 'result', result }),
      (error: unknown) => ({ kind: 'error', error }),
    );
  };
  const finishChange = async (): Promise<ToolResult> => {
    if (!pending) throw new Error('No Composer MCP call is awaiting completion.');
    const outcome = await pending;
    pending = undefined;
    if (outcome.kind === 'error') throw new Error('Composer MCP transport failed.', { cause: outcome.error });
    return outcome.result;
  };
  const readCollection = async () => readSavedCollection(
    await mcpClient.callTool({ name: 'composer_get_collection', arguments: {} }),
  );
  const sendArguments = {
    method: 'POST',
    url: sentUrl,
    headers: [{ name: 'x-guide-tool', value: 'public-example' }],
    body: requestBody,
    protocol: 'http/1.1',
    timeoutMs: 5000,
  };

  // 准备：自有服务、真实UI创建的Ask Client；SDK凭据不进入画面或公开清单。
  // Arrange: use owned origins and an Ask Client created through UI; keep SDK credentials out of images and public manifests.
  httpTrafficRunner.respondWith(savedPath, {
    body: '{"message":"guide-ui-response"}',
    headers: { 'content-type': 'application/json' },
  });
  httpTrafficRunner.respondWith(sentPath, {
    statusCode: 201,
    body: responseBody,
    headers: { 'content-type': 'application/json', 'x-guide-result': 'public-example' },
  });
  try {
    await openMcpSettings(page);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root))
      .toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill(clientName);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const clientId = await page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
    if (!clientId) throw new Error('The UI-created MCP Client has no public identity.');
    const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
    endpoint = configuration.url;
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
    }));
    media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-tools');

    // 用户操作：实际保存并发送UI请求，再分别演示发送与集合替换的Deny/Allow。
    // User actions: save and send a UI request, then independently demonstrate Deny/Allow for sending and replacing the Collection.
    await media.step('01-ask-client', '检查本次Client的Ask模式 / Inspect Ask for this Client', async () => {
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId)))
        .toHaveAttribute('data-execution-mode', 'ask');
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('composer');
      for (const name of ['composer_send_request', 'composer_get_collection', 'composer_replace_collection']) {
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)))
          .toHaveAttribute('aria-checked', 'true');
      }
    });
    await media.step('02-composer', '打开Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    });
    await media.step('03-create', '新建本次Collection请求 / Create this Collection request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest);
      await expect(rows).toHaveCount(1);
      const id = await rows.first().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) {
        throw new Error('The created Collection request has no public identity.');
      }
      requestId = id.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
    });
    await media.step('04-rename-menu', '打开请求的重命名入口 / Open the request rename action', async () => {
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)).click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename')).click();
    });
    await media.step('05-name', '保存名称Guide UI request / Save the name Guide UI request', async () => {
      const input = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
      await input.fill(originalName);
      await input.press('Enter');
    });
    await media.step('06-url', '填写本次自有UI请求地址 / Enter the owned UI request URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(savedUrl);
    });
    await media.step('07-header', '添加公开示例Header / Add the public example Header', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-guide-collection');
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('public-example');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    });
    await media.step('08-ui-send', '通过UI Send读取guide-ui-response / Send through UI and read guide-ui-response', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('guide-ui-response');
      await expect.poll(() => httpTrafficRunner.observation(savedPath)?.headers['x-guide-collection'])
        .toBe('public-example');
    });
    await media.step('09-saved', '等待Collection实际保存 / Wait for the Collection to be saved', async () => {
      await expect(collection).toHaveAttribute('data-save-state', 'saved');
      await expect(getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)))
        .toContainText(originalName);
    });
    await media.step('10-query', '只读获取实际保存的Collection / Query the actually saved Collection', async () => {
      const saved = await readCollection();
      originalRevision = saved.revision;
      expect(saved.nodes).toHaveLength(1);
      expect(saved.nodes[0]).toMatchObject({ id: requestId, kind: 'request', name: originalName, url: savedUrl });
      replacementNodes = saved.nodes.map((node) => node.id === requestId ? { ...node, name: replacedName } : node);
      await expect(approval).toHaveCount(0);
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
    });
    await media.step('11-send-ask', '检查Composer发送的实际审批 / Inspect the actual Composer send approval', async () => {
      beginChange('composer_send_request', sendArguments);
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_send_request');
      await expect(approval).toContainText(sentUrl);
      await expect(approval).toContainText('POST');
      expect(httpTrafficRunner.observation(sentPath)).toBeUndefined();
    });
    await media.step('12-send-deny', 'Deny不发送网络请求 / Deny without sending a network request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect(await finishChange()).toMatchObject({ isError: true });
      expect(httpTrafficRunner.observation(sentPath)).toBeUndefined();
      await expect(approval).toHaveCount(0);
    });
    await media.step('13-send-again', '重新请求同一个明确目标 / Request the same explicit destination again', async () => {
      beginChange('composer_send_request', sendArguments);
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_send_request');
      await expect(approval).toContainText(sentUrl);
    });
    await media.step('14-send-allow', 'Allow后核对真实POST与201结果 / Allow and verify the real POST and 201 result', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      const result = readToolPayload(await finishChange());
      expect(result).toMatchObject({ ok: true, method: 'POST', status: 201, httpVersion: 'HTTP/1.1' });
      expect(result.body).toMatchObject({ text: responseBody, truncated: false });
      const observation = httpTrafficRunner.observation(sentPath);
      expect(observation?.method).toBe('POST');
      expect(observation?.headers['x-guide-tool']).toBe('public-example');
      expect(observation?.body.toString('utf8')).toBe(requestBody);
    });
    await media.step('15-ui-response-kept', 'Tool结果不替换当前UI响应 / Tool results do not replace the current UI response', async () => {
      const address = new URL(savedUrl);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue(`${address.host}${address.pathname}`);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('guide-ui-response');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).not.toContainText('guide-tool-response');
      const saved = await readCollection();
      expect(saved.revision).toBe(originalRevision);
    });
    await media.step('16-replace-ask', '检查Collection替换的实际范围 / Inspect the actual Collection replacement scope', async () => {
      beginChange('composer_replace_collection', { baseRevision: originalRevision, nodes: replacementNodes });
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_replace_collection');
      const details = await approval.locator('dl dd').allTextContents();
      expect(details.slice(-2).map((line) => (line.match(/\d+/g) ?? []).map(Number)))
        .toEqual([[1, 1], [0, 0]]);
    });
    await media.step('17-replace-deny', 'Deny保留原Collection / Deny and retain the original Collection', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect(await finishChange()).toMatchObject({ isError: true });
      const saved = await readCollection();
      expect(saved.revision).toBe(originalRevision);
      expect(saved.nodes[0]).toMatchObject({ id: requestId, name: originalName });
      await expect(getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText(originalName);
    });
    await media.step('18-replace-again', '用同一已读取版本重新请求 / Request replacement from the same read revision again', async () => {
      beginChange('composer_replace_collection', { baseRevision: originalRevision, nodes: replacementNodes });
      await expect(approval).toHaveAttribute('data-tool-name', 'composer_replace_collection');
    });
    await media.step('19-replace-allow', 'Allow后查看当前UI自动同步 / Allow and observe notification-driven UI synchronization', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      const result = readToolPayload(await finishChange());
      expect(result.revision).toBe(originalRevision + 1);
      finalRevision = originalRevision + 1;
      await expect(getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText(replacedName);
      await expect(collection).toHaveAttribute('data-save-state', 'saved');
    });
    await media.step('20-query-latest', '重新读取最终保存版本 / Query the final saved revision', async () => {
      const saved = await readCollection();
      expect(saved.revision).toBe(finalRevision);
      expect(saved.nodes).toEqual(replacementNodes);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('guide-ui-response');
      expect(httpTrafficRunner.evidence()).toHaveLength(2);
    });
    await media.step('21-mcp-settings', '回到本次MCP设置 / Return to this MCP configuration', async () => {
      await openMcpSettings(page);
    });
    await media.step('22-disable', '关闭演示Client连接与Server / Close the demo Client connection and Server', async () => {
      await mcpClient.close();
      clientClosed = true;
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });

    // 业务断言与证据：只有两次真实发送，集合操作无网络副作用，语言保持。
    // Business assertions and evidence: exactly two real sends, no network side effects from Collection operations, and unchanged language.
    expect(httpTrafficRunner.evidence()).toHaveLength(2);
    await expect(page.locator('html')).toHaveAttribute('lang', initialLanguage);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    // 清理：拒绝未解决审批并关闭SDK，正常App退出及宿主恢复由原driver验证。
    // Cleanup: deny unresolved approvals and close the SDK; the existing driver verifies normal App shutdown and host restoration.
    try {
      if (pending && await approval.isVisible()) {
        await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      }
      if (!clientClosed) await mcpClient.close();
      if (pending) await pending;
    } finally {
      if (media) await media.stop({
        caller: 'Official local SDK; not a commercial Host interface',
        clientName, endpoint, originalName, replacedName, savedUrl, sentUrl,
        uiResponse: 'guide-ui-response', toolResponse: responseBody,
        method: 'POST', requestBody, requestHeader: 'x-guide-tool: public-example',
        collectionHeader: 'x-guide-collection: public-example',
        protocol: 'http/1.1', timeoutMs: '5000',
        originalRevision: String(originalRevision), finalRevision: String(finalRevision),
        uiBoundary: 'Tool sending returns to its caller; Collection replacement notifies the mounted Composer UI',
      });
    }
  }
});
