import type { Locator, Page } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expectSameExchangeUi, expectSameOriginRequest } from '../../fixtures/ui/exchange-inspector';

/** 从公开 Capture row automation ID 提取 Core exchange ID。 */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

/** 从公开 Rule row automation ID 提取 Core rule ID。 */
async function ruleId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) {
    throw new Error('Rule row did not expose its rule ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
}

/** 通过产品 UI 创建并应用一条 host + path 的 Header 改写规则。 */
async function createHeaderRewriteRule(
  page: Page,
  name: string,
  pathMatch: string,
  headerName: string,
  headerValue: string,
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const createdRuleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await createdRuleRow.waitFor({ state: 'visible' });
  const createdRuleId = await ruleId(createdRuleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(createdRuleId, 0, 'value'))
    .fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(createdRuleId, 1, 'value'))
    .fill(pathMatch);

  await getByAutomationId(page, AutomationIdFactory.ruleActionField(createdRuleId, 0, 'remove')).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.header).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(createdRuleId, 0, 'operation')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(createdRuleId, 0, 'operation-option.set')).click();
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(createdRuleId, 0, 'name')).fill(headerName);
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(createdRuleId, 0, 'value')).fill(headerValue);

  await getByAutomationId(page, AutomationIdFactory.ruleToggle(createdRuleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return createdRuleId;
}

test('capture.replay.effects applies Rules and Breakpoints to replayed traffic', async ({
  desktopApp,
  httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.replay.effects' });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const continueUnmodified = getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified);
  const replayNotice = getByAutomationId(page, AUTOMATION_IDS.capture.replayNotice).last();
  const breakpointPath = '/e2e/replay/breakpoint';
  const rewritePath = '/e2e/replay/rewrite';
  const blockPath = '/e2e/replay/block';
  const body = 'replay-effects-body';
  const responseBody = 'replay-effects-response';
  // 固定 Date，使两次响应的 header 可以逐字比较。
  const fixedDate = 'Thu, 01 Jan 2026 00:00:00 GMT';
  const respond = (path: string): void => {
    httpTrafficRunner.respondWith(path, {
      statusCode: 200,
      headers: { 'content-type': 'text/plain', date: fixedDate },
      body: responseBody,
    });
  };
  type OriginObservation = {
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    bodyBase64: string;
  };
  const observationsOf = (path: string): OriginObservation[] => (
    httpTrafficRunner.evidence() as OriginObservation[]
  ).filter((entry) => entry.path === path);

  // 准备：开始录制，只显示本轮自产路径并收起无关facet。
  // Arrange: start Recording, scope this workflow's own paths and collapse unrelated facets.
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/replay/');
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }

  // 场景A：真实Breakpoint规则命中重放请求，放行前源站不得收到。
  // Scenario A: a real Breakpoint Rule holds the replayed request before the origin receives it.
  respond(breakpointPath);
  await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), breakpointPath, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })).resolves.toMatchObject({ statusCode: 200 });
  const breakpointRows = rows.filter({ hasText: breakpointPath });
  await expect(breakpointRows).toHaveCount(1);
  await expect(breakpointRows.first()).toContainText('200');
  const breakpointSourceId = await exchangeId(breakpointRows.first());
  const breakpointRuleId = await createRequestBreakpointRule(
    page,
    'E2E replay breakpoint',
    'POST',
    breakpointPath,
  );

  await breakpointRows.first().click({ button: 'right' });
  await getByAutomationId(page, AutomationIdFactory.captureReplay(breakpointSourceId)).click();
  await expect(replayNotice).toHaveAttribute('data-state', 'sent');
  await expect(breakpointRows).toHaveCount(2);
  const heldRow = breakpointRows.last();
  await expect(heldRow).toHaveAttribute('data-breakpoint-state', 'head');
  // 新行必须指向挂起它的断点规则，而不只是“看起来像暂停”。
  await expect(heldRow).toHaveAttribute('data-rule-id', breakpointRuleId);
  expect(observationsOf(breakpointPath)).toHaveLength(1);
  await screenshotStep('重放在断点处挂起，源站尚未收到 / The replay is held at the Breakpoint before the origin', {
    highlights: [{ target: heldRow, label: '1' }],
  });
  await heldRow.click();
  await expect(continueUnmodified).toBeVisible();
  await continueUnmodified.click();
  await expect(continueUnmodified).toHaveCount(0);
  await expect.poll(() => observationsOf(breakpointPath).length, { timeout: 5_000 }).toBe(2);
  expect(observationsOf(breakpointPath)[1]?.bodyBase64)
    .toBe(observationsOf(breakpointPath)[0]?.bodyBase64);
  // 放行后 origin 与 App 两端都必须看到完整一致的请求与响应。
  expectSameOriginRequest(observationsOf(breakpointPath)[0]!, observationsOf(breakpointPath)[1]!);
  await expectSameExchangeUi(page, breakpointRows.first(), heldRow, {
    url: httpTrafficRunner.url(breakpointPath),
    method: 'POST',
    status: '200',
  });

  // 场景B：Header改写规则命中重放，新行必须记录规则效果。
  // Scenario B: a Header rewrite Rule hits the replay and the new row must record the Rule effect.
  // 先创建规则，再发源请求与重放：两次都必须被改写，Rule facet 才能看到两次命中。
  const rewriteRuleId = await createHeaderRewriteRule(
    page,
    'E2E replay rewrite',
    rewritePath,
    'x-replay-rule',
    'applied',
  );
  respond(rewritePath);
  await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), rewritePath, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })).resolves.toMatchObject({ statusCode: 200 });
  const rewriteRows = rows.filter({ hasText: rewritePath });
  await expect(rewriteRows).toHaveCount(1);
  await expect(rewriteRows.first()).toContainText('200');
  const rewriteSourceId = await exchangeId(rewriteRows.first());

  await rewriteRows.first().click({ button: 'right' });
  await getByAutomationId(page, AutomationIdFactory.captureReplay(rewriteSourceId)).click();
  await expect(replayNotice).toHaveAttribute('data-state', 'sent');
  await expect(rewriteRows).toHaveCount(2);
  await expect.poll(() => observationsOf(rewritePath).length, { timeout: 5_000 }).toBe(2);
  expect(observationsOf(rewritePath)[1]?.headers['x-replay-rule']).toBe('applied');
  // origin 侧：两次请求都被同一条规则改写，端到端内容必须完全一致。
  const [rewriteFirst, rewriteSecond] = observationsOf(rewritePath);
  expectSameOriginRequest(rewriteFirst!, rewriteSecond!);
  const replayedRewriteRow = rewriteRows.last();
  await replayedRewriteRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  const headerEffect = getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(rewriteRuleId, 'set', 'x-replay-rule'),
  );
  await expect(headerEffect).toBeVisible();
  await expect(headerEffect).toHaveAttribute('data-effect', 'set');
  await screenshotStep('新行记录Header改写规则的效果 / The new row records the Header rewrite Rule effect', {
    highlights: [{ target: headerEffect, label: '1' }],
  });
  // App 侧：两条记录都带同一规则效果，请求与响应必须完全一致。
  await expectSameExchangeUi(page, rewriteRows.first(), replayedRewriteRow, {
    url: httpTrafficRunner.url(rewritePath),
    method: 'POST',
    status: '200',
  });
  // Rule facet 计数必须反映源请求与重放两次命中（ruleIds 的用户可见消费者）。
  await getByAutomationId(page, AutomationIdFactory.captureFacetToggle('rule')).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('rule', rewriteRuleId),
  )).toHaveText('2');

  // 场景C：Block规则拦下重放，源站不得收到。
  // Scenario C: a Block Rule stops the replay before the origin.
  respond(blockPath);
  await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), blockPath, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })).resolves.toMatchObject({ statusCode: 200 });
  const blockRows = rows.filter({ hasText: blockPath });
  await expect(blockRows).toHaveCount(1);
  await expect(blockRows.first()).toContainText('200');
  const blockSourceId = await exchangeId(blockRows.first());
  await blockRows.first().click({ button: 'right' });
  await getByAutomationId(page, AutomationIdFactory.captureCreateRule(blockSourceId, 'block')).click();
  const createdRuleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await createdRuleRow.waitFor({ state: 'visible' });
  const createdRuleId = await ruleId(createdRuleRow);
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(createdRuleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

  await blockRows.first().click({ button: 'right' });
  await getByAutomationId(page, AutomationIdFactory.captureReplay(blockSourceId)).click();
  await expect(replayNotice).toHaveAttribute('data-state', 'sent');
  await expect(blockRows).toHaveCount(2);
  expect(observationsOf(blockPath)).toHaveLength(1);
  await screenshotStep('Rules 在重放时生效：Block 后源站未收到 / Rules apply to the replay: Block keeps the origin from receiving it', {
    highlights: [{ target: blockRows.last(), label: '1' }],
  });

  // 证据：保留真实origin观测与行身份。
  // Evidence: keep the real origin observations and row identities.
  await testInfo.attach('capture-replay-effects.json', {
    body: Buffer.from(JSON.stringify({
      breakpointSourceId,
      breakpointRuleId,
      rewriteSourceId,
      rewriteRuleId,
      blockSourceId,
      createdRuleId,
      breakpointPath,
      rewritePath,
      blockPath,
      observations: httpTrafficRunner.evidence(),
    })),
    contentType: 'application/json',
  });
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});
