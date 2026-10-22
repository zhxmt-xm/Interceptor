import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Collection, CollectionNode, CollectionRequest } from '@interceptor/core-protocol';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const TOOL_NAMES = ['composer_get_collection', 'composer_replace_collection'] as const;
const PROMPT = ['Inspect and update', 'the saved Composer collection.'].join(' ');
const ANSWER = ['The collection', 'step is complete.'].join(' ');
const SECRETS = {
  query: ['collection-query-', 'private-value'].join(''),
  header: ['Bearer collection-', 'header-private-value'].join(''),
  auth: ['collection-auth-', 'private-value'].join(''),
};
const BODY = ['{"collection":', '"owned-body"}'].join('');

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing Collection Tool result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Collection Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('collection-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('collection-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function callAgentTool(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny',
): Promise<Readonly<Record<string, unknown>>> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: args });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    const approval = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
    await expect(approval).toHaveAttribute('data-approval-status', 'pending');
    expect(JSON.parse((await approval.getAttribute('data-effect-metadata')) ?? 'null')).toEqual({
      beforeRequestCount: 2, afterRequestCount: 2, beforeFolderCount: 1, afterFolderCount: 1,
    });
    await screenshotStep(`检查Collection替换审批，准备${verdict} / Review Collection replacement before ${verdict}`, {
      highlights: [{ target: approval, label: '1' }],
    });
    await getByAutomationId(page, verdict === 'allow'
      ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return resultForCall(openAiCompatibleLab, callId);
}

function collectionValue(result: Readonly<Record<string, unknown>>): Collection {
  expect(result.ok).toBe(true);
  if (!isRecord(result.value) || !isRecord(result.value.collection) || !Array.isArray(result.value.collection.nodes)) {
    throw new Error('Collection query omitted the saved tree.');
  }
  return result.value.collection as unknown as Collection;
}

function requests(nodes: readonly CollectionNode[]): CollectionRequest[] {
  return nodes.flatMap((node) => node.kind === 'folder' ? requests(node.children) : [node]);
}

function renamedTree(nodes: readonly CollectionNode[], requestId: string, name: string): CollectionNode[] {
  return nodes.map((node) => node.kind === 'folder'
    ? { ...node, children: renamedTree(node.children, requestId, name) }
    : { ...node, ...(node.id === requestId ? { name } : {}) });
}

async function createCollection(page: Page, url: string): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await screenshotStep('新建待保存的Collection请求 / Create the Collection request to save', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
  });
  const firstRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
  const automationId = await firstRow.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('Collection request has no public ID.');
  const firstId = automationId.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${url}?token=${SECRETS.query}`);
  await screenshotStep('填写带Query的请求URL，尚未发送 / Enter the request URL with its query before sending', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.method).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await screenshotStep('选择POST方法 / Set the request method to POST', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.method), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1).click();
  await screenshotStep('选择HTTP/1.1协议 / Select HTTP/1.1', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('Authorization');
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(SECRETS.header);
  await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
  await screenshotStep('添加已启用的请求Header / Add the enabled request Header', {
    highlights: [{ target: page.locator('input[value="Authorization"]').locator('..'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-e2e-disabled');
  await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('omitted');
  await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
  const disabledHeader = page.locator('input[value="x-e2e-disabled"]').locator('..').getByRole('checkbox');
  await expect(disabledHeader).toBeVisible();
  await screenshotStep('添加第二条Header，尚未停用 / Add the second Header before disabling it', {
    highlights: [{ target: page.locator('input[value="x-e2e-disabled"]').locator('..'), label: '1' }],
  });
  await disabledHeader.click();
  await screenshotStep('停用并保留第二条Header / Disable and retain the second Header', {
    highlights: [{ target: page.locator('input[value="x-e2e-disabled"]').locator('..'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('scope');
  await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill('retained');
  await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
  await screenshotStep('添加scope=retained的Query行 / Add the scope=retained Query row', {
    highlights: [{ target: page.locator('input[value="scope"]').locator('..'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.authType).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await screenshotStep('选择Bearer认证，尚未填写值 / Select Bearer authentication before entering its value', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.authType), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(SECRETS.auth);
  await screenshotStep('填写请求Auth示例字段 / Enter the request authentication example', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.body).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(BODY);
  await screenshotStep('输入JSON正文，尚未Send / Enter the JSON body without sending', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.body), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${url}/second`);
  await screenshotStep('创建第二条独立请求 / Create the second independent request', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
  });
  const secondRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
  const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
  const folderAutomationId = await rename.getAttribute('data-automation-id');
  if (!folderAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename)) throw new Error('Collection folder has no public ID.');
  const folderId = folderAutomationId.slice(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename.length);
  await rename.fill('Collection group');
  await rename.press('Enter');
  await screenshotStep('创建Collection group目录，尚未移入请求 / Create Collection group before moving the request', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(folderId)), label: '1' }],
  });
  await secondRow.dragTo(getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(folderId)));
  await screenshotStep('将第二条请求移入Collection group / Move the second request into Collection group', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(folderId)), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(firstId)).click();
  return firstId;
}

async function verifyCredentials(page: Page, requestId: string): Promise<void> {
  await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('POST');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1)).toHaveAttribute('aria-checked', 'true');
  await screenshotStep('打开保存的请求并检查方法与协议 / Open the saved request and inspect its method and protocol', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.composer.method), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.composer.protocol.h1), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toHaveValue(SECRETS.auth);
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue(new RegExp(SECRETS.query));
  await screenshotStep('检查已保存并回载的Auth字段 / Inspect the saved and restored Auth field', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
  await expect.poll(() => page.locator('input').evaluateAll((inputs, value) => inputs.some((input) => input instanceof HTMLInputElement && input.value === value), SECRETS.header)).toBe(true);
  const disabledHeader = page.locator('input[value="x-e2e-disabled"]').locator('..');
  await expect(disabledHeader.getByRole('checkbox')).not.toBeChecked();
  await screenshotStep('检查回载的Headers及停用状态 / Inspect restored Headers and their disabled state', {
    highlights: [{ target: disabledHeader, label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  await expect(page.locator('input[value="retained"]')).toBeVisible();
  await screenshotStep('检查回载的Query行 / Inspect the restored Query row', {
    highlights: [{ target: page.locator('input[value="retained"]').locator('..'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.body)).toContainText('owned-body');
  await screenshotStep('检查回载的JSON正文，尚未发送 / Inspect the restored JSON body before sending', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.body), label: '1' }],
  });
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Collection MCP lab');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client has no public identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    servers: { interceptor: { url: string; headers: { Authorization: string } } };
  };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'collection-workflow', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
  return { client, clientId };
}

function mcpValue(result: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP result omitted text.');
  const value: unknown = JSON.parse(content.text);
  if (!isRecord(value)) throw new Error('MCP result omitted structured value.');
  return value;
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  try {
    const rendererErrors = desktopApp.rendererPageErrors();
    if (!desktopApp.page.isClosed()) {
      const closePanel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await closePanel.isVisible()) await closePanel.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await desktopApp.startTrace(testInfo);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
    expect(rendererErrors).toEqual([]);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('composer.tools.collection reads and replaces the saved tree without disclosing credentials', async ({
  desktopApp, openAiCompatibleLab, httpTrafficRunner: loopbackLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'composer.tools.collection' });
  const sensitiveTexts = [PROMPT, ANSWER, BODY, ...Object.values(SECRETS)];
  for (const text of sensitiveTexts) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  const originPath = '/e2e/collection/no-send';
  try {
    // 准备与 Red 入口：通过真实 Settings 配置 Provider，并要求发现两项正式集合 Tool。
    // Arrange and Red anchor: configure the Provider through real Settings and require discovery of both Collection Tools.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const discovery = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-discover', 'discover_tools', { capabilityId: 'composer' });
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((match) => isRecord(match) && isRecord(match.descriptor) && match.descriptor.name === name)).toBe(true);

    // 用户操作：UI 创建两条请求和一级目录；查询只读Core保存态，秘密字段不得进入Model。
    // User actions: create two requests and a folder through UI; the query reads persisted Core state without exposing secrets to the Model.
    const requestId = await createCollection(desktopApp.page, loopbackLab.url(originPath));
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    const original = collectionValue(await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-get', TOOL_NAMES[0], {}));
    expect(requests(original.nodes)).toHaveLength(2);
    expect(original.nodes.filter((node) => node.kind === 'folder')).toHaveLength(1);
    expect(requests(original.nodes).find((request) => request.id === requestId)?.bodyText).toBe(BODY);
    for (const secret of Object.values(SECRETS)) expect(JSON.stringify(original)).not.toContain(secret);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('collection-get'))).toHaveCount(0);
    await screenshotStep('用户操作：UI 创建两条请求和一级目录；查询只读Core保存态，秘密字段不得进入Model。 / User actions: create two requests and a folder through UI; the query reads persisted Core state without exposing secrets to the Model.');

    // 审批与替换：Deny零写入，Allow/Auto更新已挂载UI；凭据往返保持，旧revision不能覆盖。
    // Approval and replacement: Deny performs no write, Allow and Auto update the mounted UI, secrets survive round trips, and stale revisions cannot overwrite.
    const allowedNodes = renamedTree(original.nodes, requestId, 'Collection allowed');
    const denied = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-deny', TOOL_NAMES[1], { baseRevision: original.revision, nodes: allowedNodes }, 'deny');
    expect(denied).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    await screenshotStep('拒绝Collection替换 / Deny Collection replacement');
    expect(collectionValue(await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-after-deny', TOOL_NAMES[0], {}))).toEqual(original);
    const allowed = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-allow', TOOL_NAMES[1], { baseRevision: original.revision, nodes: allowedNodes }, 'allow');
    expect(allowed).toEqual({ ok: true, value: { revision: original.revision + 1 } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText('Collection allowed');
    await screenshotStep('Allow后Collection名称立即更新 / Inspect the updated Collection name after Allow', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.composerCollectionRequest(requestId)), label: '1' }],
    });
    await verifyCredentials(desktopApp.page, requestId);
    const saved = collectionValue(await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-after-allow', TOOL_NAMES[0], {}));
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await screenshotStep('切换Agent为Auto模式 / Switch Agent to Auto mode', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto), label: '1' }],
    });
    const automatic = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-auto', TOOL_NAMES[1], { baseRevision: saved.revision, nodes: renamedTree(saved.nodes, requestId, 'Collection automatic') });
    expect(automatic).toEqual({ ok: true, value: { revision: saved.revision + 1 } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText('Collection automatic');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('collection-auto'))).toHaveCount(0);
    await screenshotStep('Auto替换后查看Collection新名称 / Inspect the Collection name after Auto replacement', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.composerCollectionRequest(requestId)), label: '1' }],
    });
    expect(await callAgentTool(desktopApp.page, openAiCompatibleLab, 'collection-stale', TOOL_NAMES[1], { baseRevision: original.revision, nodes: allowedNodes }))
      .toMatchObject({ ok: false, error: { code: 'invalid_arguments' } });
    await screenshotStep('旧revision被拒绝，不覆盖当前Collection / Reject a stale revision without overwriting the current Collection');
    await verifyCredentials(desktopApp.page, requestId);
    expect(loopbackLab.evidence()).toHaveLength(0);
    await screenshotStep('审批与替换：Deny零写入，Allow/Auto更新已挂载UI；凭据往返保持，旧revision不能覆盖。 / Approval and replacement: Deny performs no write, Allow and Auto update the mounted UI, secrets survive round trips, and stale revisions cannot overwrite.');

    // 授权与MCP：分别关闭Agent两项，MCP仍可读取并审批替换；MCP撤权对现有连接即时生效。
    // Authorization and MCP: disable both Agent Tools while MCP can still read and approve replacement; MCP revocation immediately affects the existing connection.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('collection');
    for (const name of TOOL_NAMES) await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const name of TOOL_NAMES) expect(await callAgentTool(desktopApp.page, openAiCompatibleLab, `disabled-${name}`, name, name === TOOL_NAMES[0] ? {} : { baseRevision: 0, nodes: [] }))
      .toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    const mcpCollection = mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: {} })).collection as unknown as Collection;
    const replacement = { baseRevision: mcpCollection.revision, nodes: renamedTree(mcpCollection.nodes, requestId, 'Collection MCP') };
    const mcpApproval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    const deniedCall = client.callTool({ name: TOOL_NAMES[1], arguments: replacement });
    await expect(mcpApproval).toHaveAttribute('data-tool-name', TOOL_NAMES[1]);
    await screenshotStep('检查MCP Collection替换审批，准备Deny / Review MCP Collection replacement before Deny', {
      highlights: [{ target: mcpApproval, label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(deniedCall).resolves.toMatchObject({ isError: true });
    const allowedCall = client.callTool({ name: TOOL_NAMES[1], arguments: replacement });
    await expect(mcpApproval).toHaveAttribute('data-tool-name', TOOL_NAMES[1]);
    await screenshotStep('检查MCP Collection替换审批，准备Allow / Review MCP Collection replacement before Allow', {
      highlights: [{ target: mcpApproval, label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    expect(mcpValue(await allowedCall)).toEqual({ revision: mcpCollection.revision + 1 });
    for (const name of TOOL_NAMES) await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => TOOL_NAMES.some((name) => name === tool.name)).length).toBe(0);
    for (const name of TOOL_NAMES) await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.composer).click();
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText('Collection MCP');
    await verifyCredentials(desktopApp.page, requestId);
    await screenshotStep('授权与MCP：分别关闭Agent两项，MCP仍可读取并审批替换；MCP撤权对现有连接即时生效。 / Authorization and MCP: disable both Agent Tools while MCP can still read and approve replacement; MCP revocation immediately affects the existing connection.');

    // 重启与证据：同profile保留集合/授权且Model和origin零重放，最终只归档脱敏哈希与结论。
    // Restart and evidence: preserve the collection and permissions without Model or origin replay, retaining only redacted hashes and outcomes.
    const requestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const text of sensitiveTexts) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - requestCount).toBe(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.composer).click();
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.composerCollectionRequest(requestId))).toContainText('Collection MCP');
    await screenshotStep('重启后查看保留的Collection请求 / Inspect the retained Collection request after restarting', {
      highlights: [{ target: getByAutomationId(relaunchedApp.page, AutomationIdFactory.composerCollectionRequest(requestId)), label: '1' }],
    });
    await verifyCredentials(relaunchedApp.page, requestId);
    expect(loopbackLab.evidence()).toHaveLength(0);

    // 用户操作与断言：重启后不重填字段，只明确Send一次，核对真实出站字节。
    // User actions and assertions: after restart, send once without refilling fields and verify the actual wire data.
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.composer.send).click();
    const sentPath = `${originPath}?token=${SECRETS.query}&scope=retained`;
    await expect.poll(() => loopbackLab.observation(sentPath)?.method).toBe('POST');
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.composer.send)).toBeEnabled();
    const sent = loopbackLab.observation(sentPath);
    expect(sent?.body.toString('utf8')).toBe(BODY);
    expect(sent?.headers.authorization).toBe(`Bearer ${SECRETS.auth}`);
    expect(sent?.headers['x-e2e-disabled']).toBeUndefined();
    expect(loopbackLab.evidence()).toHaveLength(1);
    await screenshotStep('重启后由用户明确发送已保存请求 / Explicitly send the saved request after restarting');
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('collection');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('composer-tools-collection.json');
    await writeFile(evidencePath, JSON.stringify({
      initialRevision: original.revision, finalRevision: mcpCollection.revision + 1,
      treeHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'),
      requestCount: 2, folderCount: 1, credentialsPreserved: true, staleRejected: true,
      agentAndMcpRevoked: true, restartModelRequests: 0,
      collectionCommandsOriginRequests: 0, explicitUiSendOriginRequests: loopbackLab.evidence().length,
      persistedRequestBytesVerified: true,
    }, null, 2), 'utf8');
    await testInfo.attach('composer-tools-collection.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：关闭MCP与两代Electron，验证宿主、8888和脱敏产物，不把强制恢复当正常退出。
    // Teardown: close MCP and both Electron generations, verify the host, port 8888 and redacted evidence, and never count forced recovery as graceful shutdown.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Collection workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Collection cleanup failed.');
});