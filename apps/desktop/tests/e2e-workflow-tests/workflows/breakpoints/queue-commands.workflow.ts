import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
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
  await startRecording(desktopApp);
  await createRequestBreakpointRule(page, 'E2E POST queue commands', 'POST');
  await createRequestBreakpointRule(page, 'E2E PUT queue commands', 'PUT');

  // Layout: inspect the shared manager before queue commands without changing its rules.
  // 布局：队列操作前检查Manager的自然排版和共享按钮，不改变规则配置。
  await breakpointBadge.click();
  const manager = page.getByRole('dialog').filter({ has: getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle) });
  await expect(manager).toBeVisible();
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

  await rowPostA.click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('post-draft-must-not-forward');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.dropQueue)).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueRule)).toBeVisible();
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

  await rowQueueA.click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.queueMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueQueue).click();
  await expect(queueA).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(queueB).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect.poll(() => loopbackLab.observation(queueAPath)?.body.toString('utf8'))
    .toBe('queue-a-original');
  await expect.poll(() => loopbackLab.observation(queueBPath)?.body.toString('utf8'))
    .toBe('queue-b-original');
  await expect(breakpointBadge).toHaveText('');
  await screenshotStep('Continue all：建立新的POST队列，并原样释放整个逻辑队列。 / Continue all: build a fresh POST queue and release the whole logical queue unchanged.');

  // Evidence: retain all origin facts; shared fixture proves process and listener cleanup.
  // 证据：保存全部origin事实；共享fixture验证进程与listener销毁。
  await testInfo.attach('batch-command-origin-observation', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
});
