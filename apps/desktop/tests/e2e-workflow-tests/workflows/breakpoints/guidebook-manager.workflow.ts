import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('breakpoints guide records shortcut undo, manager switches and client-abort cleanup', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const requestPath = '/guide/breakpoint-manager/request';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const manager = getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager);
  let pending: ReturnType<typeof httpTrafficRunner.startAbortableRequestThroughProxy> | undefined;
  let outcome: Promise<unknown> | undefined;
  let firstBreakpointId = '';
  let generatedName = '';
  const start = (attempt: string): void => {
    pending = httpTrafficRunner.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath, {
      headers: { 'x-guide-attempt': attempt },
    });
    outcome = pending.result.then(result => ({ kind: 'response' as const, result }),
      (error: unknown) => ({ kind: 'error' as const, message: error instanceof Error ? error.message : String(error) }));
  };
  const head = () => page.locator('[data-automation-id^="capture.request-row."][data-breakpoint-state="head"]');
  const pausedRows = () => page.locator('[data-automation-id^="capture.request-row."][data-breakpoint-id]');
  // 准备：快捷规则只取本轮自有endpoint；没有host级规则影响其他本地服务。
  // Arrange: create shortcuts only for this owned endpoint, never host-wide Rules that affect other local services.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/breakpoint-manager');
  await startRecording(desktopApp);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
  const source = rows.filter({ hasText: requestPath }).first();
  const sourceId = await source.getAttribute('data-automation-id');
  if (!sourceId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing shortcut source identity.');
  const exchangeId = sourceId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-manager');
  const shortcutMenu = async (): Promise<void> => {
    await getByAutomationId(page, AutomationIdFactory.captureRequestRow(exchangeId)).click({ button: 'right' });
    await getByAutomationId(page, AutomationIdFactory.captureCreateRule(exchangeId, 'breakpoint')).hover();
    await expect(getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(exchangeId, 'endpoint'))).toBeVisible();
  };
  const createEndpoint = async (): Promise<void> => {
    await getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(exchangeId, 'endpoint')).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.root)).toBeVisible();
  };
  const closeManager = async (): Promise<void> => {
    await page.getByRole('dialog').locator('header').getByRole('button').last().click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle)).toBeHidden();
  };
  try {
    await media.step('01-source', '查看快捷操作的历史请求 / Inspect the captured shortcut source', async () => { await source.click(); });
    await media.step('02-menu', '打开Breakpoint作用范围菜单 / Open the Breakpoint scope menu', shortcutMenu);
    await media.transientStep('03-create', '选择Endpoint并立即Apply / Choose Endpoint and apply immediately', createEndpoint);
    await media.step('04-undo', '使用创建提示中的Undo / Use Undo in the creation notice', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.undo).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.root)).toHaveCount(0);
    });
    await media.step('05-after-undo', '发送新请求确认已撤销 / Send a new request to verify undo', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect(pausedRows()).toHaveCount(0);
    });
    await media.step('06-recreate-menu', '再次打开同一Endpoint菜单 / Reopen the same Endpoint menu', shortcutMenu);
    await media.step('07-recreate', '重新创建本轮断点 / Recreate this example Breakpoint', createEndpoint);
    await media.step('08-manager', '打开断点管理器 / Open the Breakpoint manager', async () => {
      await manager.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('09-global-off', '关闭全局Break on match / Turn off global Break on match', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('10-close-manager', '关闭管理器 / Close the manager', closeManager);
    await media.step('11-not-paused', '确认全局关闭时不暂停新请求 / Verify new requests do not pause while globally disabled', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect(pausedRows()).toHaveCount(0);
    });
    await media.step('12-manager-again', '再次打开管理器 / Open the manager again', async () => { await manager.click(); });
    await media.step('13-global-on', '重新开启Break on match / Enable Break on match again', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('14-close-manager', '回到请求列表 / Return to the request list', closeManager);
    await media.step('15-abort-pending', '发送会由客户端取消的请求 / Send a request that the client will cancel', async () => {
      start('abort');
      await expect(head()).toHaveCount(1);
      const id = await head().getAttribute('data-breakpoint-id');
      if (!id) throw new Error('The initial request omitted its breakpoint ID.');
      firstBreakpointId = id;
    });
    await media.step('16-select-pending', '查看这个Head等待项 / Inspect this Head item', async () => {
      await head().click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    });
    await media.step('17-client-abort', '客户端结束后等待项自动解除 / Let the client abort and release the pending item', async () => {
      if (!pending || !outcome) throw new Error('The owned abortable client was not created.');
      pending.abort();
      expect(await outcome).toMatchObject({ kind: 'error' });
      pending = undefined;
      await expect(pausedRows()).toHaveCount(0);
      expect(httpTrafficRunner.evidence().filter(item => 'headers' in item
        && typeof item.headers === 'object' && item.headers !== null
        && 'x-guide-attempt' in item.headers && item.headers['x-guide-attempt'] === 'abort')).toHaveLength(0);
    });
    await media.step('18-new-wait', '重新发送得到新的等待项 / Send again to obtain a new pending item', async () => {
      start('after-abort');
      await expect(head()).toHaveCount(1);
      await expect(head()).not.toHaveAttribute('data-breakpoint-id', firstBreakpointId);
      await head().click();
    });
    await media.step('19-continue-request', '原样放行请求阶段 / Continue the request phase unchanged', async () => {
      const id = await head().getAttribute('data-breakpoint-id');
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      await expect(head()).not.toHaveAttribute('data-breakpoint-id', id!);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    });
    await media.step('20-continue-response', '原样放行响应阶段 / Continue the response phase unchanged', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      expect(await outcome).toMatchObject({ kind: 'response', result: { statusCode: 200 } });
      pending = undefined;
      await expect(pausedRows()).toHaveCount(0);
    });
    await media.step('21-rule-manager', '打开管理器停用单条规则 / Open the manager to disable one Rule', async () => {
      await manager.click();
      await expect(page.getByRole('dialog').getByRole('switch')).toHaveCount(2);
    });
    await media.step('22-rule-off', '只停用本轮Endpoint规则 / Disable only this Endpoint Rule', async () => {
      const toggle = page.getByRole('dialog').getByRole('switch').nth(1);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('23-close-manager', '返回列表检查停用结果 / Return to the list to inspect disabling', closeManager);
    await media.step('24-rule-disabled', '新请求不再被该规则挂起 / Verify the disabled Rule no longer pauses new requests', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect(pausedRows()).toHaveCount(0);
    });
    await media.step('25-open-rule', '从管理器进入对应Rules / Open the corresponding Rule from the manager', async () => {
      await manager.click();
      const rule = page.getByRole('dialog').getByRole('switch').nth(1).locator('..');
      await rule.getByRole('button').click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
      generatedName = await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).inputValue();
    });
    // 证据：撤销、全局停用、单条停用和客户端结束是不同操作，均用新请求核对。
    // Evidence: undo, global disable, Rule disable and client abort are distinct, each checked with real new requests.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    pending?.abort();
    await outcome;
    await media.stop({
      url: httpTrafficRunner.url(requestPath), shortcutScope: 'endpoint', generatedRuleName: generatedName,
      abortHeader: 'x-guide-attempt: abort', resumedHeader: 'x-guide-attempt: after-abort',
      finalState: 'Break on match enabled; this endpoint Rule disabled and applied; no pending item remains',
    });
  }
  // 清理：正常Close恢复系统代理并确认Core、Worker和8888释放。
  // Cleanup: normal Close restores the system proxy and verifies Core/Worker shutdown and port 8888 release.
});
