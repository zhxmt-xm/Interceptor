import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('capture shortcut guide distinguishes a Block draft from immediately applied Breakpoint scope', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const requestPath = '/guide/shortcuts/order';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  // 准备：真实录制中的历史请求是快捷操作唯一来源。
  // Arrange: one actually captured request is the sole source for context-menu actions.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/shortcuts');
  await startRecording(desktopApp);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
  const original = rows.filter({ hasText: requestPath }).first();
  const id = await original.getAttribute('data-automation-id');
  if (!id?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Captured source omitted its identity.');
  const exchangeId = id.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-shortcuts');
  let pending: ReturnType<typeof httpTrafficRunner.startAbortableRequestThroughProxy> | undefined;
  let outcome: Promise<unknown> | undefined;
  let requestBreakpointId = '';
  try {
    // 用户操作：分别走真正的两个快捷入口，不用手工Rules过程替代。
    // User actions: use both genuine shortcuts instead of substituting manual Rule setup.
    await media.step('01-source', '选择实际历史请求 / Select the captured source request', async () => {
      await original.click();
    });
    await media.step('02-context', '打开右键菜单 / Open the context menu', async () => {
      await original.click({ button: 'right' });
      await expect(getByAutomationId(page, AutomationIdFactory.captureCreateRule(exchangeId, 'block'))).toBeVisible();
    });
    await media.step('03-block-draft', 'Block 创建未启用草稿 / Block creates a disabled draft', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureCreateRule(exchangeId, 'block')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('04-name', '命名 Guide quick block / Name the Block draft', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide quick block');
    });
    await media.step('05-enable', '启用 Block / Enable Block', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('06-apply', 'Apply 后才生效 / Apply before taking effect', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('07-blocked', '发送新请求验证阻断 / Verify a new request is blocked', async () => {
      await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).rejects.toThrow();
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(rows).toHaveCount(2);
    });
    await media.step('08-disable', '停用本轮 Block / Disable this Block Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('09-disable-apply', 'Apply 停用状态 / Apply the disabled state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('10-breakpoint-menu', '打开真实 Breakpoint 子菜单 / Open the actual Breakpoint submenu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AutomationIdFactory.captureRequestRow(exchangeId)).click({ button: 'right' });
      await getByAutomationId(page, AutomationIdFactory.captureCreateRule(exchangeId, 'breakpoint')).hover();
      await expect(getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(exchangeId, 'endpoint'))).toBeVisible();
    });
    await media.step('11-endpoint', '选择 Endpoint 并立即 Apply / Select Endpoint and apply immediately', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(exchangeId, 'endpoint')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointCreatedMessage.root)).toBeVisible();
    });
    await media.step('12-paused', '发送新请求并观察等待 / Send again and inspect the wait', async () => {
      pending = httpTrafficRunner.startAbortableRequestThroughProxy(desktopApp.capturePort(), requestPath);
      outcome = pending.result.then(result => ({ result }), error => ({ error }));
      const head = page.locator('[data-automation-id^="capture.request-row."][data-breakpoint-state="head"]');
      await expect(head).toHaveCount(1);
      await head.click();
      const breakpointId = await head.getAttribute('data-breakpoint-id');
      if (!breakpointId) throw new Error('The request breakpoint omitted its identity.');
      requestBreakpointId = breakpointId;
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    });
    await media.step('13-continue-request', '请求阶段原样放行 / Continue the request phase', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      const head = page.locator('[data-automation-id^="capture.request-row."][data-breakpoint-state="head"]');
      await expect(head).not.toHaveAttribute('data-breakpoint-id', requestBreakpointId);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    });
    await media.step('14-continue-response', '响应阶段再次放行 / Continue the response phase separately', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      expect(await outcome).toMatchObject({ result: { statusCode: 200 } });
      pending = undefined;
    });
    // 证据：只有新请求受影响，原历史请求并未被自动重发。
    // Evidence: only new requests are controlled; history was not automatically replayed.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    pending?.abort();
    await outcome;
    await media.stop({ url: httpTrafficRunner.url(requestPath), blockName: 'Guide quick block',
      breakpointScope: 'endpoint', blockBehavior: 'disabled draft; enable and Apply required',
      breakpointBehavior: 'created, enabled and applied immediately for request and response phases' });
  }
  // 清理：正常Close释放该profile规则、Core和listener，并恢复系统代理。
  // Cleanup: normal Close releases this profile's Rules, Core and listener and restores the proxy.
});
