import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoints guide records HTTP drafts and Rule versus queue batch scope', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/queue';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const badge = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager);
  const row = (name: string) => rows.filter({ hasText: `${prefix}/${name}` });
  const original = (name: string) => JSON.stringify({ order: name.toUpperCase(), source: 'original' });
  const draft = '{"order":"POST-A","source":"draft-not-submitted"}';
  const pendingClients = new Set<ReturnType<typeof httpTrafficRunner.startAbortableRequestThroughProxy>>();
  const send = (name: string, method: string) => {
    const client = httpTrafficRunner.startAbortableRequestThroughProxy(desktopApp.capturePort(), `${prefix}/${name}`, {
      method, body: original(name),
    });
    pendingClients.add(client);
    return client.result.then(result => {
      pendingClients.delete(client);
      return { kind: 'response' as const, result };
    }, (error: unknown) => {
      pendingClients.delete(client);
      return { kind: 'error' as const, message: error instanceof Error ? error.message : String(error) };
    });
  };
  const resultsByName = new Map<string, ReturnType<typeof send>>();
  const enqueue = async (name: string, method: string, state: 'head' | 'queued', count: number): Promise<void> => {
    resultsByName.set(name, send(name, method));
    await expect(row(name)).toHaveAttribute('data-queue-key', 'http');
    await expect(row(name)).toHaveAttribute('data-breakpoint-state', state);
    await expect(badge).toHaveText(String(count));
    expect(httpTrafficRunner.observation(`${prefix}/${name}`)).toBeUndefined();
  };
  const assertOriginalReachedOrigin = async (name: string): Promise<void> => {
    expect(await resultsByName.get(name)).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
    expect(httpTrafficRunner.observation(`${prefix}/${name}`)?.body).toEqual(Buffer.from(original(name)));
    await expect(row(name)).not.toHaveAttribute('data-breakpoint-id');
  };

  // 准备：通过真实Rules UI建立Method互斥规则，不预造内部队列。
  // Arrange: establish mutually exclusive Method Rules through real UI, never a seeded internal queue.
  await startRecording(desktopApp);
  const postRuleId = await createRequestBreakpointRule(page, 'Guide POST queue', 'POST');
  const putRuleId = await createRequestBreakpointRule(page, 'Guide PUT queue', 'PUT');
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-queue');
  try {
    // 用户操作：真实流量入队，切换草稿，再逐次执行三个独立批量命令。
    // User actions: enqueue real traffic, switch drafts, then execute the three distinct batch commands.
    await media.step('01-rules', '查看两条 Method 规则 / Review the two Method Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('02-post-rule', '查看 Guide POST queue / Inspect Guide POST queue', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(postRuleId)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleMatcherField(postRuleId, 1, 'value'))).toHaveValue('POST');
    });
    await media.step('03-put-rule', '查看 Guide PUT queue / Inspect Guide PUT queue', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(putRuleId)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleMatcherField(putRuleId, 1, 'value'))).toHaveValue('PUT');
    });
    await media.step('04-capture', '返回 Capture / Return to Capture', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    });
    await media.step('05-post-head', '发送 POST-A，成为 Head / Send POST-A as the Head', async () => {
      await enqueue('post-a', 'POST', 'head', 1);
    });
    await media.step('06-post-queued', '发送 POST-B，进入 Queued / Send POST-B into Queued', async () => {
      await enqueue('post-b', 'POST', 'queued', 2);
    });
    await media.step('07-put-queued', '发送 PUT-A，HTTP 队列共三项 / Send PUT-A into the same HTTP queue', async () => {
      await enqueue('put-a', 'PUT', 'queued', 3);
    });
    await media.step('08-select-head', '选中 POST-A 队首 / Select the POST-A Head', async () => {
      await row('post-a').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
    });
    await media.step('09-text-draft', '为队首选择 Text / Choose Text for the Head draft', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    });
    await media.step('10-enter-draft', '输入未提交草稿 / Enter an unsubmitted draft', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(draft);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue(draft);
    });
    await media.step('11-post-queued-detail', '切到 POST-B，只读 Queued / Inspect POST-B as read-only Queued', async () => {
      await row('post-b').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queuedDetail)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toHaveCount(0);
    });
    await media.step('12-put-queued-detail', '切到 PUT-A，仍在等待 / Inspect PUT-A while it waits', async () => {
      await row('put-a').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queuedDetail)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toHaveCount(0);
    });
    await media.step('13-restore-draft', '回到 Head，草稿保持 / Return to the Head with its draft intact', async () => {
      await row('post-a').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue(draft);
      for (const name of ['post-a', 'post-b', 'put-a']) {
        expect(httpTrafficRunner.observation(`${prefix}/${name}`)).toBeUndefined();
      }
    });
    await media.step('14-rule-menu', '展开批量操作菜单 / Open the batch actions menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue)).toBeVisible();
    });
    await media.step('15-continue-rule', 'Continue rule 仅放行 POST，PUT 保留 / Continue the POST Rule and leave PUT pending', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule).click();
      await assertOriginalReachedOrigin('post-a');
      await assertOriginalReachedOrigin('post-b');
      expect(httpTrafficRunner.observation(`${prefix}/put-a`)).toBeUndefined();
      await expect(row('put-a')).toHaveAttribute('data-breakpoint-state', 'head');
      await expect(row('put-a')).toHaveAttribute('aria-pressed', 'true');
      await expect(badge).toHaveText('1');
    });
    await media.step('16-put-b', '加入 PUT-B / Add PUT-B to the remaining queue', async () => {
      await enqueue('put-b', 'PUT', 'queued', 2);
    });
    await media.step('18-drop-menu', '展开 PUT 队列菜单 / Open the PUT queue menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue)).toBeVisible();
    });
    await media.step('19-drop-queue', 'Drop queue 丢弃剩余两项 / Drop both remaining HTTP items', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue).click();
      for (const name of ['put-a', 'put-b']) {
        expect(await resultsByName.get(name)).toMatchObject({ kind: 'error' });
        expect(httpTrafficRunner.observation(`${prefix}/${name}`)).toBeUndefined();
        await expect(row(name)).not.toHaveAttribute('data-breakpoint-id');
      }
      await expect(badge).toHaveText('');
      expect(httpTrafficRunner.observation(`${prefix}/post-a`)?.body).toEqual(Buffer.from(original('post-a')));
      expect(httpTrafficRunner.observation(`${prefix}/post-b`)?.body).toEqual(Buffer.from(original('post-b')));
    });
    await media.step('20-new-post', '建立新 POST 队首 / Start a new POST Head', async () => {
      await enqueue('post-c', 'POST', 'head', 1);
    });
    await media.step('21-new-put', '把 PUT 加入同一 HTTP 队列 / Add PUT to the same HTTP queue', async () => {
      await enqueue('put-c', 'PUT', 'queued', 2);
    });
    await media.step('22-select-new-head', '选中新队首 / Select the new Head', async () => {
      await row('post-c').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
    });
    await media.step('23-continue-menu', '展开整个队列的菜单 / Open the whole-queue menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue)).toBeVisible();
    });
    await media.step('24-continue-queue', 'Continue queue 原样放行 POST 和 PUT / Continue both Methods without edits', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
      await assertOriginalReachedOrigin('post-c');
      await assertOriginalReachedOrigin('put-c');
      await expect(badge).toHaveText('');
    });
    await media.step('25-cleanup-rules', '返回 Rules 清理 / Return to Rules for cleanup', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('26-select-post-rule', '选中 POST 规则 / Select the POST Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(postRuleId)).click();
    });
    await media.step('27-disable-post', '停用 POST 规则 / Disable the POST Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('28-select-put-rule', '选中 PUT 规则 / Select the PUT Rule', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleRow(putRuleId)).click();
    });
    await media.step('29-disable-put', '停用 PUT 规则 / Disable the PUT Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('30-apply-disabled', 'Apply 两条停用状态 / Apply both disabled Rules', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    });
  } finally {
    // 证据与清理：不提交草稿来清理；只取消仍等待的自产客户端，正常Close由driver负责。
    // Evidence and cleanup: never apply drafts for cleanup; abort owned waiting clients and let the driver Close normally.
    for (const client of pendingClients) client.abort();
    await media.stop({
      postRule: 'Guide POST queue', putRule: 'Guide PUT queue', path: prefix, queueKey: 'http',
      postA: original('post-a'), postB: original('post-b'), putA: original('put-a'), putB: original('put-b'),
      postC: original('post-c'), putC: original('put-c'), draft, origin: httpTrafficRunner.url(),
    });
    const clients = Object.fromEntries(await Promise.all([...resultsByName].map(async ([name, result]) => [name, await result])));
    const evidencePath = testInfo.outputPath('queue-wire-evidence.json');
    await writeFile(evidencePath, JSON.stringify({ clients, origin: httpTrafficRunner.evidence() }, null, 2), 'utf8');
    await testInfo.attach('queue-wire-evidence', { path: evidencePath, contentType: 'application/json' });
  }
});
