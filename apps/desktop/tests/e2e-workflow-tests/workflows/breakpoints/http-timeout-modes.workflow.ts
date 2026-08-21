import type { Locator, Page, TestInfo } from '@playwright/test';

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
import { expect, test } from '../../fixtures/local-electron-driver';
import type { LoopbackLab } from '../../fixtures/loopback-lab';

const CUSTOM_TIMEOUT_SECONDS = '1';
const WAIT_BEYOND_CUSTOM_TIMEOUT_MS = 1_500;

/** Extract a Core-owned identifier from a public dynamic automation ID. */
async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Missing dynamic automation ID with prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Select one public option without depending on translated labels. */
async function selectOption(
  select: Locator,
  option: Locator,
): Promise<void> {
  await select.click();
  await option.click();
}

/** Return true only when a promise remains unsettled for the complete observation window. */
async function remainsPending(promise: Promise<unknown>, durationMs: number): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  return !settled;
}

/** Create one enabled request breakpoint rule entirely through product controls. */
async function createRequestBreakpointRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E timeout modes');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
  return ruleId;
}

/** Select the paused Capture row and release it through the public Continue action. */
async function continuePausedRequest(page: Page, requestPath: string): Promise<void> {
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
}

/** Attach test-owned origin facts for timeout Continue and Drop assertions. */
async function attachOriginEvidence(
  loopbackLab: LoopbackLab,
  testInfo: TestInfo,
): Promise<void> {
  await testInfo.attach('http-timeout-origin-observations', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
}

test('breakpoints.http-timeout-modes enforces explicit infinite and finite waits', async ({
  desktopApp,
  loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.http-timeout-modes',
  });

  // 中文：通过真实UI开始Recording并创建唯一的request breakpoint规则。
  // English: Start Recording through the real UI and create the only request breakpoint rule.
  const { page } = desktopApp;
  await startRecording(desktopApp);
  const ruleId = await createRequestBreakpointRule(page);
  const timeout = getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'timeout'),
  );
  const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);

  // 中文：选择No timeout并应用，证明等待不会被后续Custom时长隐式释放。
  // English: Select No timeout and apply it, proving the later Custom duration cannot release it.
  await selectOption(
    timeout,
    getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'timeout-option.none'),
    ),
  );
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'on-timeout'),
  )).toHaveCount(0);
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await apply.click();
  await expect(apply).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

  const infinitePath = '/e2e/http-timeout-infinite';
  const infiniteRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    infinitePath,
  );
  expect(await remainsPending(infiniteRequest, WAIT_BEYOND_CUSTOM_TIMEOUT_MS)).toBe(true);
  expect(loopbackLab.observation(infinitePath)).toBeUndefined();
  await continuePausedRequest(page, infinitePath);
  await expect(infiniteRequest).resolves.toMatchObject({ statusCode: 200 });

  // 中文：切换到Custom并验证0会显示错误且阻止Save，正整数1恢复有效。
  // English: Switch to Custom, verify zero shows an error and blocks Save, then recover with integer 1.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await selectOption(
    timeout,
    getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'timeout-option.custom'),
    ),
  );
  const customSeconds = getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'timeout-seconds'),
  );
  const timeoutError = getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'timeout-error'),
  );
  await customSeconds.fill('0');
  await expect(customSeconds).toHaveAttribute('aria-invalid', 'true');
  await expect(timeoutError).toBeVisible();
  await expect(apply).toBeDisabled();
  await customSeconds.fill(CUSTOM_TIMEOUT_SECONDS);
  await expect(customSeconds).toHaveAttribute('aria-invalid', 'false');
  await expect(timeoutError).toHaveCount(0);
  const onTimeout = getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'on-timeout'),
  );
  await expect(onTimeout).toBeVisible();
  await apply.click();
  await expect(apply).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

  // 中文：不做人工释放，有限Continue必须在deadline后原样到达真实origin。
  // English: Without manual release, finite Continue must reach the real origin after its deadline.
  const continuePath = '/e2e/http-timeout-continue';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    continuePath,
  )).resolves.toMatchObject({ statusCode: 200 });
  expect(loopbackLab.observation(continuePath)).toBeDefined();

  // 中文：把同一有限timeout改为Drop，客户端必须失败且origin不得收到请求。
  // English: Change the same finite timeout to Drop; the client must fail and the origin must not receive it.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await selectOption(
    onTimeout,
    getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'on-timeout-option.drop'),
    ),
  );
  await apply.click();
  await expect(apply).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  const dropPath = '/e2e/http-timeout-drop';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    dropPath,
  )).rejects.toThrow();
  expect(loopbackLab.observation(dropPath)).toBeUndefined();

  // 中文：保存真实origin证据；fixture随后负责产品Close、进程销毁和系统副作用恢复。
  // English: Save real-origin evidence; the fixture then owns product Close, teardown, and side-effect recovery.
  await attachOriginEvidence(loopbackLab, testInfo);
});
