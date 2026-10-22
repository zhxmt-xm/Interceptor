import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('breakpoints.queue-commands executes logical queue batch actions', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.queue-commands',
  });

  const page = desktopApp.page;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const breakpointBadge = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager);
  const settleRequest = <T,>(request: Promise<T>): Promise<{ result: T } | { error: unknown }> =>
    request.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );

  // Arrange: create two method-specific Rules through product UI so rule and queue scopes can diverge.
  // 准备：通过产品UI创建两条Method互斥规则，使Rule作用域与Queue作用域可以区分。
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/queue-');
  const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
  for (let index = 0; index < await facetToggles.count(); index += 1) {
    const toggle = facetToggles.nth(index);
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  }
  await startRecording(desktopApp);
  const postRuleId = await createRequestBreakpointRule(page, 'E2E POST queue commands', 'POST', '/e2e/queue-');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('保存限定范围的POST请求断点 / Save the scoped POST request breakpoint', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' },
      { target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(postRuleId, 1, 'value')), label: '2' },
    ],
  });
  const putRuleId = await createRequestBreakpointRule(page, 'E2E PUT queue commands', 'PUT', '/e2e/queue-');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('用另一条规则匹配PUT请求 / Match PUT requests with a separate Rule', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' },
      { target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(putRuleId, 1, 'value')), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

  // Layout: inspect the shared manager before queue commands without changing its rules.
  // 布局：队列操作前检查Manager的自然排版和共享按钮，不改变规则配置。
  await breakpointBadge.click();
  const manager = page.getByRole('dialog').filter({ has: getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle) });
  await expect(manager).toBeVisible();
  await screenshotStep('打开HTTP断点管理器 / Open the HTTP breakpoint manager', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle), label: '1' }],
  });
  await manager.screenshot({ path: testInfo.outputPath('breakpoint-manager.png') });
  await expect(manager.locator('header')).toHaveCSS('display', 'flex');
  await expect(manager.locator('header')).toHaveCSS('align-items', 'center');
  await expect(manager.locator('header > div:first-child > span')).toHaveCSS('line-height', 'normal');
  const advancedRules = manager.locator('header > button').first();
  await expect(advancedRules).toHaveCSS('gap', '7px');
  await expect(advancedRules).toHaveCSS('height', '28px');
  await expect(manager.locator(':scope > div').first()).toHaveCSS('line-height', 'normal');
  await manager.locator('header > button').last().click();
  await expect(manager).toBeHidden();
  await screenshotStep('布局：队列操作前检查Manager的自然排版和共享按钮，不改变规则配置。 / Layout: inspect the shared manager before queue commands without changing its rules.');

  // Continue all from this rule: release both POST requests, ignore the draft, and leave PUT pending.
  // Continue all from this rule：释放两条POST、忽略草稿，并让PUT继续pending。
  const postAPath = '/e2e/queue-rule-post-a';
  const postBPath = '/e2e/queue-rule-post-b';
  const putAPath = '/e2e/queue-rule-put-a';
  const postA = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    postAPath,
    { method: 'POST', body: 'post-a-original' },
  ));
  const rowPostA = rows.filter({ hasText: postAPath }).last();
  await expect(rowPostA).toHaveAttribute('data-breakpoint-state', 'head');

  const postB = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    postBPath,
    { method: 'POST', body: 'post-b-original' },
  ));
  const rowPostB = rows.filter({ hasText: postBPath }).last();
  await expect(rowPostB).toHaveAttribute('data-breakpoint-state', 'queued');

  const putA = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    putAPath,
    { method: 'PUT', body: 'put-a-original' },
  ));
  const rowPutA = rows.filter({ hasText: putAPath }).last();
  await expect(rowPutA).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(breakpointBadge).toHaveText('3');
  await screenshotStep('核对三条等待项及HTTP队列 / Inspect the three pending items in the HTTP queue', {
    highlights: [{ target: breakpointBadge, label: '1' }],
  });

  if (await rowPostA.getAttribute('aria-pressed') !== 'true') await rowPostA.click();
  await expect(rowPostA).toHaveAttribute('aria-pressed', 'true');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('post-draft-must-not-forward');
  await screenshotStep('保留尚未Forward的Text草稿 / Keep a Text draft that has not been forwarded', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' }],
  });
  for (const queuedRow of [rowPostB, rowPutA]) {
    if (await queuedRow.getAttribute('aria-pressed') !== 'true') await queuedRow.click();
    await expect(queuedRow).toHaveAttribute('aria-pressed', 'true');
    await expect(queuedRow).toHaveAttribute('data-breakpoint-state', 'queued');
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toHaveCount(0);
    await screenshotStep('查看Queued请求而不编辑其他队首 / Inspect a Queued request without editing another head', {
      highlights: [{ target: queuedRow, label: '1' }],
    });
  }
  await rowPostA.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('post-draft-must-not-forward');
  await screenshotStep('返回队首后保留自己的Text草稿 / Retain the head’s own Text draft after returning', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule)).toBeVisible();
  await screenshotStep('区分当前规则与整个HTTP队列的批量命令 / Distinguish this Rule from the entire HTTP queue', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue), label: '2' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue), label: '3' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule).click();

  await expect(postA).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(postB).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect.poll(() => loopbackLab.observation(postAPath)?.body.toString('utf8'))
    .toBe('post-a-original');
  await expect.poll(() => loopbackLab.observation(postBPath)?.body.toString('utf8'))
    .toBe('post-b-original');
  await expect(rowPostA).not.toHaveAttribute('data-breakpoint-id');
  await expect(rowPostB).not.toHaveAttribute('data-breakpoint-id');
  await expect(rowPutA).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(breakpointBadge).toHaveText('1');
  await screenshotStep('只放行POST规则后PUT仍在等待 / PUT remains pending after continuing only the POST Rule', {
    highlights: [{ target: rowPutA, label: '1' }],
  });
  await screenshotStep('Continue all from this rule：释放两条POST、忽略草稿，并让PUT继续pending。 / Continue all from this rule: release both POST requests, ignore the draft, and leave PUT pending.');

  // Drop all: add a second PUT, then drop the invocation-time HTTP queue without reaching origin.
  // Drop all：再加入一条PUT，丢弃调用开始时的HTTP队列，且不得抵达origin。
  const putBPath = '/e2e/queue-drop-put-b';
  const putB = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    putBPath,
    { method: 'PUT', body: 'put-b-original' },
  ));
  const rowPutB = rows.filter({ hasText: putBPath }).last();
  await expect(rowPutB).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await screenshotStep('丢弃当前HTTP队列前核对Drop all / Review Drop all for the current HTTP queue', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue).click();

  await expect(putA).resolves.toHaveProperty('error');
  await expect(putB).resolves.toHaveProperty('error');
  expect(loopbackLab.observation(putAPath)).toBeUndefined();
  expect(loopbackLab.observation(putBPath)).toBeUndefined();
  await expect(rowPutA).not.toHaveAttribute('data-breakpoint-id');
  await expect(rowPutB).not.toHaveAttribute('data-breakpoint-id');
  await expect(breakpointBadge).toHaveText('');
  await screenshotStep('Drop all：再加入一条PUT，丢弃调用开始时的HTTP队列，且不得抵达origin。 / Drop all: add a second PUT, then drop the invocation-time HTTP queue without reaching origin.');

  // Continue all: build a fresh POST queue and release the whole logical queue unchanged.
  // Continue all：建立新的POST队列，并原样释放整个逻辑队列。
  const queueAPath = '/e2e/queue-continue-a';
  const queueBPath = '/e2e/queue-continue-b';
  const queueA = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    queueAPath,
    { method: 'POST', body: 'queue-a-original' },
  ));
  const rowQueueA = rows.filter({ hasText: queueAPath }).last();
  await expect(rowQueueA).toHaveAttribute('data-breakpoint-state', 'head');
  const queueB = settleRequest(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    queueBPath,
    { method: 'POST', body: 'queue-b-original' },
  ));
  const rowQueueB = rows.filter({ hasText: queueBPath }).last();
  await expect(rowQueueB).toHaveAttribute('data-breakpoint-state', 'queued');

  if (await rowQueueA.getAttribute('aria-pressed') !== 'true') await rowQueueA.click();
  await expect(rowQueueA).toHaveAttribute('aria-pressed', 'true');
  await screenshotStep('选择新HTTP队列的队首 / Select the head of the new HTTP queue', {
    highlights: [{ target: rowQueueA, label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await screenshotStep('原样放行整个当前队列 / Continue the entire current queue without edits', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
  await expect(queueA).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(queueB).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect.poll(() => loopbackLab.observation(queueAPath)?.body.toString('utf8'))
    .toBe('queue-a-original');
  await expect.poll(() => loopbackLab.observation(queueBPath)?.body.toString('utf8'))
    .toBe('queue-b-original');
  await expect(breakpointBadge).toHaveText('');
  await screenshotStep('Continue all：建立新的POST队列，并原样释放整个逻辑队列。 / Continue all: build a fresh POST queue and release the whole logical queue unchanged.');

  // Cleanup matching: disable only this workflow's Rules and save after all pending clients settle.
  // 清理匹配：全部等待客户端结束后，仅停用本流程的规则并保存。
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  for (const ruleId of [postRuleId, putRuleId]) {
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用自己的断点规则，尚需Save / Disable the owned breakpoint Rule before Save', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
  }
  await screenshotStep('保存两条规则的停用状态 / Save the disabled state of both Rules', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.apply), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await screenshotStep('两条规则已停用并保存 / Both Rules are disabled and saved');

  // Evidence: retain all origin facts; shared fixture proves process and listener cleanup.
  // 证据：保存全部origin事实；共享fixture验证进程与listener销毁。
  await testInfo.attach('batch-command-origin-observation', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
