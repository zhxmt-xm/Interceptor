import { writeFile } from 'node:fs/promises';

import type { Locator, Page, TestInfo } from '@playwright/test';

import type { RuleNode } from '../../../../src/shared/desktop-api';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';
import type { LoopbackLab } from '../../fixtures/loopback-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';

const RULE_PATH_PREFIX = '/e2e/agent/rules';
const RULE_HEADER = 'x-agent-rules';
const INITIAL_RULE_NAME = 'Agent initial header';
const INITIAL_HEADER_VALUE = 'initial';
const DENIED_RULE_NAME = 'Agent denied candidate';
const DENIED_HEADER_VALUE = 'denied';
const ALLOWED_RULE_NAME = 'Agent allowed header';
const ALLOWED_HEADER_VALUE = 'allowed';
const AUTO_RULE_NAME = 'Agent automatic header';
const AUTO_HEADER_VALUE = 'automatic';
const phrase = (...parts: readonly string[]): string => parts.join(' ');
const QUERY_PROMPT = phrase('Read the current Rules tree', 'and its captured hit counts.');
const QUERY_ANSWER = phrase('The Rules tree and hit counts', 'are available.');
const DENY_PROMPT = phrase('Prepare a Rule replacement', 'but preserve the current tree.');
const DENY_ANSWER = phrase('The Rule replacement', 'was denied.');
const ALLOW_PROMPT = phrase('Apply the approved', 'Rule replacement.');
const ALLOW_ANSWER = phrase('The Rule replacement', 'was applied.');
const HITS_PROMPT = phrase('Read the updated', 'Rule hit counts.');
const HITS_ANSWER = phrase('The updated Rule hits', 'are available.');
const AUTO_PROMPT = phrase('Apply the next Rule replacement', 'automatically.');
const AUTO_ANSWER = phrase('The automatic Rule replacement', 'was applied.');
const STALE_PROMPT = phrase('Try a stale Rule revision', 'without changing the current tree.');
const STALE_ANSWER = phrase('The stale Rule revision', 'was rejected.');
const DISABLED_PROMPT = phrase('Try all disabled', 'Rules Tools.');
const DISABLED_ANSWER = phrase('The Rules Tools', 'are unavailable.');
const SENSITIVE_TEXTS = [
  QUERY_PROMPT,
  QUERY_ANSWER,
  DENY_PROMPT,
  DENY_ANSWER,
  ALLOW_PROMPT,
  ALLOW_ANSWER,
  HITS_PROMPT,
  HITS_ANSWER,
  AUTO_PROMPT,
  AUTO_ANSWER,
  STALE_PROMPT,
  STALE_ANSWER,
  DISABLED_PROMPT,
  DISABLED_ANSWER,
];

interface RulesToolEvidence {
  readonly disabledErrorCodes: readonly string[];
  readonly firstRevision: number;
  readonly firstRuleHitCount: number;
  readonly folderId: string;
  readonly latestRevision: number;
  readonly requestBodyHashes: readonly string[];
  readonly restartRequestCount: number;
  readonly ruleId: string;
  readonly staleErrorCode: string;
}

/** Configure one keyless local Provider entirely through public Settings controls. */
async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Rules Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(lab.baseUrl('rules-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('rules-tool-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

/** Read the dynamic suffix from one public automation ID. */
async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Element did not expose automation prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create and apply one nested Rule entirely through public Rules controls. */
async function createInitialRule(page: Page): Promise<{
  folderId: string;
  revision: number;
  ruleId: string;
}> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.createFolder).click();
  const folderRename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await expect(folderRename).toHaveCount(1);
  const folderId = await automationSuffix(folderRename, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await folderRename.fill('Agent Rules');
  await folderRename.press('Enter');

  await getByAutomationId(page, AutomationIdFactory.ruleFolderRow(folderId)).hover();
  await getByAutomationId(page, AutomationIdFactory.ruleFolderMenu(folderId)).click();
  await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(folderId, 'new-rule')).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await automationSuffix(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(INITIAL_RULE_NAME);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'),
  ).fill(RULE_PATH_PREFIX);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill(RULE_HEADER);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill(INITIAL_HEADER_VALUE);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  const revisionNode = getByAutomationId(page, AUTOMATION_IDS.rules.status.revision);
  await expect(revisionNode).toHaveAttribute('data-revision', '1');
  return { folderId, revision: 1, ruleId };
}

/** Send one real request through 8888 and verify the active Rule at the origin. */
async function expectRuleEffect(
  desktopApp: LocalElectronApplicationDriver,
  loopbackLab: LoopbackLab,
  stage: string,
  expectedValue: string,
): Promise<void> {
  const requestPath = `${RULE_PATH_PREFIX}/${stage}`;
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect.poll(() => loopbackLab.observation(requestPath)?.headers[RULE_HEADER])
    .toBe(expectedValue);
}

/** Queue Rules discovery, both queries, and their final answer. */
function enqueueRulesQuery(lab: OpenAiCompatibleLab): void {
  lab.enqueueToolCall({
    callId: 'rules-discover',
    name: 'discover_tools',
    arguments: { capabilityId: 'rules' },
  });
  lab.enqueueToolCall({ callId: 'rules-get', name: 'get_rules', arguments: {} });
  lab.enqueueToolCall({ callId: 'rules-hits-initial', name: 'get_rule_hits', arguments: {} });
  lab.enqueueTurn({ textChunks: [QUERY_ANSWER] });
}

/** Queue one apply_rules call and its final answer. */
function enqueueApply(
  lab: OpenAiCompatibleLab,
  callId: string,
  baseRevision: number,
  nodes: readonly RuleNode[],
  answer: string,
): void {
  lab.enqueueToolCall({
    callId,
    name: 'apply_rules',
    arguments: { baseRevision, nodes },
  });
  lab.enqueueTurn({ textChunks: [answer] });
}

/** Send one user message through the current Chat. */
async function sendMessage(page: Page, prompt: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(prompt);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

/** Set one explicit Session execution mode through its segmented control. */
async function setExecutionMode(page: Page, mode: 'ask' | 'auto'): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode[mode]).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-tool-execution-mode', mode);
}

/** Return one model-visible Tool Result from captured Provider history. */
function resultForCall(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): Readonly<Record<string, unknown>> {
  for (const request of [...requests].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => (
      isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
    ));
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const parsed: unknown = JSON.parse(message.content);
    if (isRecord(parsed)) return parsed;
  }
  throw new Error(`Provider history has no Tool Result ${callId}.`);
}

/** Return one successful Tool Result value. */
function successfulValue(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): Readonly<Record<string, unknown>> {
  const result = resultForCall(requests, callId);
  if (result.ok !== true || !isRecord(result.value)) {
    throw new Error(`Tool Result ${callId} was not successful.`);
  }
  return result.value;
}

/** Return one stable error code from a failed Tool Result. */
function errorCode(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): string {
  const result = resultForCall(requests, callId);
  return isRecord(result.error) && typeof result.error.code === 'string'
    ? result.error.code
    : '';
}

/** Read one Rules Tool result into its formal revision and complete tree. */
function ruleSetFromResult(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): { revision: number; nodes: RuleNode[] } {
  const value = successfulValue(requests, callId);
  const ruleSet = value.ruleSet;
  if (!isRecord(ruleSet) || typeof ruleSet.revision !== 'number' || !Array.isArray(ruleSet.nodes)) {
    throw new Error(`Tool Result ${callId} has no RuleSet.`);
  }
  return {
    revision: ruleSet.revision,
    nodes: structuredClone(ruleSet.nodes) as RuleNode[],
  };
}

/** Return discovered Tool names from one successful discover_tools Result. */
function discoveredNames(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
): readonly string[] {
  const matches = successfulValue(requests, callId).matches;
  if (!Array.isArray(matches)) throw new Error(`Tool Result ${callId} has no matches.`);
  return matches.flatMap((match) => (
    isRecord(match)
    && isRecord(match.descriptor)
    && typeof match.descriptor.name === 'string'
      ? [match.descriptor.name]
      : []
  ));
}

/** Return one target Rule hit count from a get_rule_hits result. */
function hitCountForRule(
  requests: readonly Readonly<Record<string, unknown>>[],
  callId: string,
  ruleId: string,
): number {
  const counts = successfulValue(requests, callId).counts;
  if (!Array.isArray(counts)) throw new Error(`Tool Result ${callId} has no hit counts.`);
  const count = counts.find((entry) => isRecord(entry) && entry.ruleId === ruleId);
  if (!isRecord(count) || typeof count.count !== 'number') {
    throw new Error(`Tool Result ${callId} has no count for ${ruleId}.`);
  }
  return count.count;
}

/** Find one Rule recursively in a complete Tool-returned tree. */
function findRuleById(
  nodes: readonly RuleNode[],
  ruleId: string,
): Exclude<RuleNode, { kind: 'folder' }> | null {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const found = findRuleById(node.children, ruleId);
      if (found !== null) return found;
      continue;
    }
    if (node.id === ruleId) return node;
  }
  return null;
}

/** Require one Rule from a complete Tool-returned tree. */
function ruleById(nodes: readonly RuleNode[], ruleId: string): Exclude<RuleNode, { kind: 'folder' }> {
  const rule = findRuleById(nodes, ruleId);
  if (rule !== null) return rule;
  throw new Error(`Rule ${ruleId} was not present in the Tool result.`);
}

/** Replace one Rule name and request-header value in a detached complete tree. */
function replaceRule(
  nodes: readonly RuleNode[],
  ruleId: string,
  name: string,
  value: string,
): RuleNode[] {
  let replaced = false;
  const visit = (node: RuleNode): RuleNode => {
    if (node.kind === 'folder') {
      return { ...node, children: node.children.map(visit) };
    }
    if (node.id !== ruleId) return node;
    replaced = true;
    return {
      ...node,
      name,
      actions: node.actions.map((action) => (
        action.type === 'header' && action.name === RULE_HEADER
          ? { ...action, value }
          : action
      )),
    };
  };
  const next = nodes.map(visit);
  if (!replaced) throw new Error(`Rule ${ruleId} was not present in the Tool result.`);
  return next;
}

/** Parse one language-independent effect metadata attribute. */
async function effectMetadata(locator: Locator): Promise<Readonly<Record<string, unknown>>> {
  const value = await locator.getAttribute('data-effect-metadata');
  if (value === null) throw new Error('Approval did not expose effect metadata.');
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error('Approval effect metadata is invalid.');
  return parsed;
}

/** Return model-visible Tool names from one Chat Completions request. */
function requestToolNames(request: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(request.tools)) return [];
  return request.tools.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return [];
    return typeof entry.function.name === 'string' ? [entry.function.name] : [];
  });
}

/** Return whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Close one generation while preserving lifecycle and sensitive-data evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  for (const text of SENSITIVE_TEXTS) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(text);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

test('agent.tools.rules reads hits and replaces the complete Rule tree', async ({
  desktopApp,
  loopbackLab,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.rules',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let disabledErrorCodes: string[] = [];
  let firstRevision = -1;
  let firstRuleHitCount = -1;
  let folderId = '';
  let latestRevision = -1;
  let restartRequestCount = -1;
  let ruleId = '';
  let staleErrorCode = '';
  let deniedEffectMetadata: Readonly<Record<string, unknown>> = {};

  for (const text of SENSITIVE_TEXTS) desktopApp.registerSensitiveTextForEvidenceAudit(text);

  try {
    // 准备：真实Settings配置Provider；真实Rules UI创建嵌套Rule并Apply；真实8888请求建立初始hit。
    // Arrange: configure the Provider in real Settings, create and apply a nested Rule in real UI, then establish its first hit through 8888.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const created = await createInitialRule(desktopApp.page);
    folderId = created.folderId;
    ruleId = created.ruleId;
    firstRevision = created.revision;
    await expectRuleEffect(desktopApp, loopbackLab, 'initial', INITIAL_HEADER_VALUE);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.ruleHitCount(ruleId),
    )).toHaveAttribute('data-count', '1', { timeout: 10_000 });

    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const sessionRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root);
    await expect(sessionRoot).toHaveAttribute('data-tool-execution-mode', 'ask');
    await desktopApp.stopTrace(testInfo);

    // 用户操作与业务断言：渐进发现三项Rules Tool，并读取真实嵌套树、revision、hit与typed摘要。
    // User actions and assertions: progressively discover the three Rules Tools and read the real nested tree, revision, hit, and typed summaries.
    const queryOffset = openAiCompatibleLab.requestsForAssertions().length;
    enqueueRulesQuery(openAiCompatibleLab);
    await sendMessage(desktopApp.page, QUERY_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const queryRequests = openAiCompatibleLab.requestsForAssertions().slice(queryOffset);
    expect(requestToolNames(queryRequests[0]!)).toEqual(['discover_tools']);
    expect(requestToolNames(queryRequests[1]!)).toEqual([
      'discover_tools', 'get_rules', 'get_rule_hits', 'apply_rules',
    ]);
    expect(discoveredNames(queryRequests, 'rules-discover')).toEqual([
      'get_rules', 'get_rule_hits', 'apply_rules',
    ]);
    const firstRuleSet = ruleSetFromResult(queryRequests, 'rules-get');
    expect(firstRuleSet.revision).toBe(firstRevision);
    expect(firstRuleSet.nodes).toMatchObject([{
      kind: 'folder',
      id: folderId,
      children: [{ kind: 'rule', id: ruleId, name: INITIAL_RULE_NAME, enabled: true }],
    }]);
    const initialRule = ruleById(firstRuleSet.nodes, ruleId);
    expect(Number.isInteger(initialRule.priority)).toBe(true);
    expect(initialRule.matchers).toEqual([
      { type: 'host', value: '127.0.0.1', mode: 'contains' },
      { type: 'path', value: RULE_PATH_PREFIX, mode: 'contains' },
    ]);
    expect(initialRule.actions).toEqual([{
      type: 'header',
      phase: 'request',
      op: 'set',
      name: RULE_HEADER,
      value: INITIAL_HEADER_VALUE,
    }]);
    firstRuleHitCount = hitCountForRule(queryRequests, 'rules-hits-initial', ruleId);
    expect(firstRuleHitCount).toBe(1);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('rules-get'),
    )).toHaveAttribute('data-rule-revision', String(firstRevision));
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('rules-get'),
    )).toHaveAttribute('data-rule-count', '1');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('rules-get'),
    )).toHaveAttribute('data-rule-enabled-count', '1');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('rules-hits-initial'),
    )).toHaveAttribute('data-rule-total-hits', '1');

    // 用户操作：Ask下Deny完整替换；metadata来自当前Core树，Deny不推进revision也不改变真实effect。
    // User action: deny a complete replacement in Ask; metadata comes from the current Core tree, and denial changes neither revision nor real effect.
    const deniedNodes = replaceRule(
      firstRuleSet.nodes,
      ruleId,
      DENIED_RULE_NAME,
      DENIED_HEADER_VALUE,
    );
    enqueueApply(openAiCompatibleLab, 'apply-deny', firstRevision, deniedNodes, DENY_ANSWER);
    await sendMessage(desktopApp.page, DENY_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    const deniedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('apply-deny'),
    );
    deniedEffectMetadata = await effectMetadata(deniedApproval);
    expect(deniedEffectMetadata).toMatchObject({
      baseRevision: firstRevision,
      currentRuleCount: 1,
      nextRuleCount: 1,
      currentEnabledCount: 1,
      nextEnabledCount: 1,
      removedNames: INITIAL_RULE_NAME,
      addedNames: DENIED_RULE_NAME,
    });
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('apply-deny'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(deniedApproval).toHaveAttribute('data-approval-status', 'denied');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolDeny('apply-deny'),
    )).toHaveCount(0);
    expect(errorCode(openAiCompatibleLab.requestsForAssertions(), 'apply-deny'))
      .toBe('tool_denied');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(firstRevision));
    await expectRuleEffect(desktopApp, loopbackLab, 'denied', INITIAL_HEADER_VALUE);

    // 用户操作与业务断言：Allow沿正式replace推进revision，Rules Renderer由Main事件重载，真实effect随之更新。
    // User action and assertion: Allow advances revision through the formal replace, Main reloads the Rules Renderer, and the real effect updates.
    const allowedNodes = replaceRule(
      firstRuleSet.nodes,
      ruleId,
      ALLOWED_RULE_NAME,
      ALLOWED_HEADER_VALUE,
    );
    enqueueApply(openAiCompatibleLab, 'apply-allow', firstRevision, allowedNodes, ALLOW_ANSWER);
    await sendMessage(desktopApp.page, ALLOW_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'waiting-for-tool-approval');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('apply-allow'),
    ).click();
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const allowedApproval = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('apply-allow'),
    );
    await expect(allowedApproval).toHaveAttribute('data-approval-status', 'allowed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAllow('apply-allow'),
    )).toHaveCount(0);
    const allowRevision = firstRevision + 1;
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(allowRevision));
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName))
      .toHaveValue(ALLOWED_RULE_NAME);
    const allowResult = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('apply-allow'),
    );
    await expect(allowResult).toHaveAttribute('data-summary-kind', 'rulesApplied');
    await expect(allowResult).toHaveAttribute('data-rule-revision', String(allowRevision));
    await expectRuleEffect(desktopApp, loopbackLab, 'allowed', ALLOWED_HEADER_VALUE);

    openAiCompatibleLab.enqueueToolCall({
      callId: 'rules-hits-updated',
      name: 'get_rule_hits',
      arguments: {},
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [HITS_ANSWER] });
    await sendMessage(desktopApp.page, HITS_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    expect(hitCountForRule(
      openAiCompatibleLab.requestsForAssertions(),
      'rules-hits-updated',
      ruleId,
    )).toBe(3);

    // 用户操作：Auto用最新完整树替换且不显示问询；随后stale revision稳定失败并保持Auto effect。
    // User action: Auto replaces the latest complete tree without approval; a stale revision then fails stably and preserves the Auto effect.
    await setExecutionMode(desktopApp.page, 'auto');
    const automaticNodes = replaceRule(
      allowedNodes,
      ruleId,
      AUTO_RULE_NAME,
      AUTO_HEADER_VALUE,
    );
    enqueueApply(openAiCompatibleLab, 'apply-auto', allowRevision, automaticNodes, AUTO_ANSWER);
    await sendMessage(desktopApp.page, AUTO_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolApproval('apply-auto'),
    )).toHaveCount(0);
    latestRevision = allowRevision + 1;
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(latestRevision));
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName))
      .toHaveValue(AUTO_RULE_NAME);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolResult('apply-auto'),
    )).toHaveAttribute('data-rule-revision', String(latestRevision));
    await expectRuleEffect(desktopApp, loopbackLab, 'automatic', AUTO_HEADER_VALUE);

    enqueueApply(openAiCompatibleLab, 'apply-stale', firstRevision, deniedNodes, STALE_ANSWER);
    await sendMessage(desktopApp.page, STALE_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    staleErrorCode = errorCode(openAiCompatibleLab.requestsForAssertions(), 'apply-stale');
    expect(staleErrorCode).toBe('invalid_arguments');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(latestRevision));
    await expectRuleEffect(desktopApp, loopbackLab, 'stale', AUTO_HEADER_VALUE);

    // 用户操作：Settings关闭三项优先于Auto；schema移除、逐项猜测均unknown_tool且Rule保持。
    // User action: disabling all three in Settings overrides Auto; schemas disappear, guessed calls are unknown, and the Rule stays unchanged.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const toolName of ['get_rules', 'get_rule_hits', 'apply_rules'] as const) {
      await getByAutomationId(
        desktopApp.page,
        AutomationIdFactory.agentToolAgentSwitch(toolName),
      ).click();
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    const disabledOffset = openAiCompatibleLab.requestsForAssertions().length;
    openAiCompatibleLab.enqueueToolCall({
      callId: 'disabled-discover-rules',
      name: 'discover_tools',
      arguments: { capabilityId: 'rules' },
    });
    openAiCompatibleLab.enqueueToolCall({ callId: 'disabled-get-rules', name: 'get_rules', arguments: {} });
    openAiCompatibleLab.enqueueToolCall({ callId: 'disabled-get-hits', name: 'get_rule_hits', arguments: {} });
    openAiCompatibleLab.enqueueToolCall({
      callId: 'disabled-apply-rules',
      name: 'apply_rules',
      arguments: { baseRevision: latestRevision, nodes: automaticNodes },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [DISABLED_ANSWER] });
    await sendMessage(desktopApp.page, DISABLED_PROMPT);
    await expect(sessionRoot).toHaveAttribute('data-turn-status', 'completed');
    const disabledRequests = openAiCompatibleLab.requestsForAssertions().slice(disabledOffset);
    for (const toolName of ['get_rules', 'get_rule_hits', 'apply_rules']) {
      expect(requestToolNames(disabledRequests[0]!)).not.toContain(toolName);
    }
    expect(discoveredNames(disabledRequests, 'disabled-discover-rules')).toEqual([]);
    disabledErrorCodes = [
      errorCode(disabledRequests, 'disabled-get-rules'),
      errorCode(disabledRequests, 'disabled-get-hits'),
      errorCode(disabledRequests, 'disabled-apply-rules'),
    ];
    expect(disabledErrorCodes).toEqual(['unknown_tool', 'unknown_tool', 'unknown_tool']);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(latestRevision));
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName))
      .toHaveValue(AUTO_RULE_NAME);

    // 重启与销毁：同profile恢复Rule、审批metadata、Auto与关闭项且零重放，再经公开UI恢复设置。
    // Restart and teardown: the same profile restores the Rule, approval metadata, Auto, and disabled Tools with zero replay, then public UI restores settings.
    const requestCountBeforeRestart = openAiCompatibleLab.evidence().length;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await desktopApp.startTrace(testInfo);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    for (const text of SENSITIVE_TEXTS) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    restartRequestCount = openAiCompatibleLab.evidence().length - requestCountBeforeRestart;
    expect(restartRequestCount).toBe(0);
    await relaunchedApp.stopTrace(testInfo);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.status.revision))
      .toHaveAttribute('data-revision', String(latestRevision));
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.editorName))
      .toHaveValue(AUTO_RULE_NAME);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.session.root))
      .toHaveAttribute('data-tool-execution-mode', 'auto');
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolApproval('apply-deny'),
    )).toHaveAttribute('data-effect-metadata', JSON.stringify(deniedEffectMetadata));
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const toolName of ['get_rules', 'get_rule_hits', 'apply_rules'] as const) {
      const toolSwitch = getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentToolAgentSwitch(toolName),
      );
      await expect(toolSwitch).toHaveAttribute('aria-checked', 'false');
      await toolSwitch.click();
    }
    await setExecutionMode(relaunchedApp.page, 'ask');

    const evidence: RulesToolEvidence = {
      disabledErrorCodes,
      firstRevision,
      firstRuleHitCount,
      folderId,
      latestRevision,
      requestBodyHashes: openAiCompatibleLab.evidence()
        .map((observation) => observation.requestBodyHash),
      restartRequestCount,
      ruleId,
      staleErrorCode,
    };
    const evidencePath = testInfo.outputPath('agent-tool-rules.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-rules.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await relaunchedApp.startTrace(testInfo);
  } catch (error) {
    workflowError = error;
  } finally {
    if (relaunchedApp !== null) {
      try {
        await closeGeneration(relaunchedApp, testInfo);
      } catch (error) {
        cleanupError = error;
        await relaunchedApp.forceCleanup().catch(() => undefined);
      }
    } else {
      try {
        await closeGeneration(desktopApp, testInfo);
      } catch (error) {
        cleanupError = error;
        await desktopApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError(
      [workflowError, cleanupError],
      'Agent Rules workflow and cleanup failed.',
    );
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
