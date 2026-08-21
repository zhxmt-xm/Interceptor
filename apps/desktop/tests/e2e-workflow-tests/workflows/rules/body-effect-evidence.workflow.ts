import { readFile, rm } from 'node:fs/promises';

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
import { submitWindowsFileDialogPath } from '../../fixtures/windows-file-dialog';

const BREAKPOINT_REPLACEMENT_TEXT = 'breakpoints.replacement.text';

/** Extract a Core-owned identifier from one public dynamic automation ID. */
async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Missing dynamic automation ID with prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create and apply one Breakpoint Rule entirely through product controls. */
async function createBreakpointRule(
  page: Page,
  phase: 'request' | 'response',
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName)
    .fill(`E2E ${phase} body effect`);
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
  if (phase === 'response') {
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response'),
    ).click();
  }
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Create and apply one Text body Rule through public body-action controls. */
async function createTextBodyRule(
  page: Page,
  phase: 'request' | 'response',
  name: string,
  content: string,
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  if (phase === 'response') {
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response'),
    ).click();
  }
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'operation'),
  ).click();
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'operation-option.remove'),
  ).click();
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill('transfer-encoding');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
  if (phase === 'request') {
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 1, 'phase'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 1, 'phase-option.request'),
    ).click();
  }
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 1, 'content'),
  ).fill(content);
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Set one Rule enabled state and persist it through the real Apply command. */
async function setRuleEnabled(page: Page, ruleId: string, enabled: boolean): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId));
  if (await toggle.getAttribute('aria-checked') !== String(enabled)) {
    await toggle.click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  }
}

/** Select the paused Capture row for one test-owned path. */
async function selectPausedRequest(page: Page, requestPath: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.executeEdited,
  )).toBeVisible();
}

/** Remove one paused HTTP header using only public dynamic controls. */
async function removeBreakpointHeader(page: Page, headerName: string): Promise<void> {
  const names = page.locator(
    '[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
  );
  await expect.poll(() => names.count()).toBeGreaterThan(0);
  for (let index = 0; index < await names.count(); index += 1) {
    const name = names.nth(index);
    if ((await name.inputValue()).toLowerCase() !== headerName.toLowerCase()) {
      continue;
    }
    const automationId = await name.getAttribute('data-automation-id');
    if (!automationId) {
      break;
    }
    await getByAutomationId(page, automationId.replace(/\.name$/, '.remove')).click();
    return;
  }
  throw new Error(`Breakpoint header not found: ${headerName}`);
}

/** Add one header through the public Breakpoint editor controls. */
async function addBreakpointHeader(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  const names = page.locator(
    '[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
  );
  const count = await names.count();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.addHeader).click();
  await expect(names).toHaveCount(count + 1);
  const nameInput = names.last();
  const automationId = await nameInput.getAttribute('data-automation-id');
  if (!automationId) {
    throw new Error('New Breakpoint header did not expose its automation ID.');
  }
  await nameInput.fill(name);
  await getByAutomationId(page, automationId.replace(/\.name$/, '.value')).fill(value);
}

/** Wait for the origin observation proving that edited bytes crossed the real proxy. */
async function observe(
  loopbackLab: LoopbackLab,
  requestPath: string,
): Promise<NonNullable<ReturnType<LoopbackLab['observation']>>> {
  await expect.poll(() => loopbackLab.observation(requestPath)).toBeDefined();
  const observation = loopbackLab.observation(requestPath);
  if (!observation) {
    throw new Error(`Origin did not observe ${requestPath}.`);
  }
  return observation;
}

test('rules.body-effect-evidence exposes the final body writer', async ({
  desktopApp,
  loopbackLab,
}, testInfo: TestInfo) => {
  test.skip(process.platform !== 'win32', '真实文件对话框 workflow 目前只在 Windows 执行。');
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.body-effect-evidence',
  });
  const { page } = desktopApp;
  const requestPath = '/e2e/body-effect-red';
  const original = Buffer.from('{"stage":"original"}');
  const replacement = '{"stage":"final"}';

  // 中文：通过真实UI开始Recording并创建唯一的request Breakpoint规则。
  // English: Start Recording through the real UI and create the only request Breakpoint Rule.
  await startRecording(desktopApp);
  const ruleId = await createBreakpointRule(page, 'request');

  // 中文：真实POST经8888进入暂停态，再通过产品编辑器提交Text正文替换。
  // English: Send a real POST through 8888, then submit a Text body replacement in the product editor.
  const inFlight = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
    {
      method: 'POST',
      body: original,
      headers: {
        'content-type': 'application/json',
        'content-length': String(original.byteLength),
      },
    },
  );
  await selectPausedRequest(page, requestPath);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(replacement);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(inFlight).resolves.toMatchObject({ statusCode: 200 });
  const observation = await observe(loopbackLab, requestPath);
  expect(observation.body.toString('utf8')).toBe(replacement);

  // 中文：数据面成功后，Capture必须公开绑定最终Breakpoint rule的正文证据marker。
  // English: After the data plane succeeds, Capture must expose a body marker bound to the final Breakpoint Rule.
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.source,
  )).toHaveAttribute('data-source', 'text');
  const bodyPane = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyPane,
  );
  await expect.poll(() => bodyPane.textContent()).toContain('final');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('original');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.final,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('final');

  // 中文：marker必须导航回最终写入Rule；随后停用Breakpoint以隔离普通Rule场景。
  // English: The marker must navigate to the final writer Rule; then disable the Breakpoint for the regular Rule scene.
  await getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  ).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  await setRuleEnabled(page, ruleId, false);

  // 中文：普通Request Text Rule使用chunked输入，origin与Capture分别验证Final和Original。
  // English: A regular Request Text Rule uses chunked input; origin and Capture verify Final and Original.
  const regularPath = '/e2e/body-effect-regular-request';
  const regularOriginal = Buffer.from('{"stage":"regular-original"}');
  const regularFinal = '{"stage":"regular-final"}';
  const regularRuleId = await createTextBodyRule(
    page,
    'request',
    'E2E regular request body',
    regularFinal,
  );
  const regularResponse = await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    regularPath,
    {
      method: 'POST',
      body: regularOriginal,
      headers: { 'content-type': 'application/json' },
    },
  );
  expect(regularResponse.statusCode).toBe(200);
  const regularObservation = await observe(loopbackLab, regularPath);
  expect(regularObservation.body.toString('utf8')).toBe(regularFinal);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(regularPath);
  const regularRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: regularPath })
    .last();
  await expect(regularRow).toBeVisible();
  await regularRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(regularRuleId),
  )).toBeVisible();
  await expect.poll(() => bodyPane.textContent()).toContain('regular-final');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('regular-original');

  // 中文：Response Text Rule保留Final，并明确禁用不可观测的Original。
  // English: A Response Text Rule keeps Final while explicitly disabling the unobservable Original.
  await setRuleEnabled(page, regularRuleId, false);
  const responsePath = '/e2e/body-effect-regular-response';
  const responseOriginal = '{"stage":"response-original"}';
  const responseFinal = '{"stage":"response-final"}';
  loopbackLab.respondWith(responsePath, {
    body: responseOriginal,
    headers: { 'transfer-encoding': 'chunked' },
  });
  const responseRuleId = await createTextBodyRule(
    page,
    'response',
    'E2E regular response body',
    responseFinal,
  );
  const responseResult = await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    responsePath,
  );
  expect(responseResult).toMatchObject({ statusCode: 200, body: responseFinal });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(responsePath);
  const responseRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: responsePath })
    .last();
  await expect(responseRow).toBeVisible();
  await responseRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(responseRuleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.source,
  )).toHaveAttribute('data-source', 'text');
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  )).toBeDisabled();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable,
  )).toBeVisible();
  await expect.poll(() => bodyPane.textContent()).toContain('response-final');

  // 中文：普通Rule先写正文，随后Request Breakpoint Text必须成为唯一最终写入者。
  // English: A regular Rule writes first, then Request Breakpoint Text must become the sole final writer.
  await setRuleEnabled(page, responseRuleId, false);
  await setRuleEnabled(page, regularRuleId, true);
  await setRuleEnabled(page, ruleId, true);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  const overridePath = '/e2e/body-effect-breakpoint-override';
  const overrideOriginal = Buffer.from('{"stage":"override-original"}');
  const overrideFinal = '{"stage":"breakpoint-final"}';
  const overrideRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    overridePath,
    {
      method: 'POST',
      body: overrideOriginal,
      headers: { 'content-type': 'application/json' },
    },
  );
  await selectPausedRequest(page, overridePath);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(overrideFinal);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(overrideRequest).resolves.toMatchObject({ statusCode: 200 });
  expect((await observe(loopbackLab, overridePath)).body.toString('utf8')).toBe(overrideFinal);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(regularRuleId),
  )).toHaveCount(0);
  await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-final');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('override-original');

  // 中文：先用产品Save Dialog生成唯一的File replacement输入，不由测试写业务文件。
  // English: First generate the only File replacement input through the product Save Dialog, never by test seeding.
  await setRuleEnabled(page, ruleId, false);
  await setRuleEnabled(page, regularRuleId, false);
  await setRuleEnabled(page, responseRuleId, false);
  const responseFilePath = '/e2e/body-effect-file-source';
  const responseFileBytes = Buffer.from('{"stage":"breakpoint-file-final"}');
  loopbackLab.respondWith(responseFilePath, {
    body: responseFileBytes,
    headers: { 'content-type': 'application/json' },
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    responseFilePath,
  )).resolves.toMatchObject({ statusCode: 200 });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(responseFilePath);
  const responseFileSourceRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: responseFilePath }).last();
  await expect(responseFileSourceRow).toBeVisible();
  await responseFileSourceRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-file-final');
  const generatedFile = testInfo.outputPath('body-effect-response-file.json');
  const mainProcessId = desktopApp.application.process().pid;
  expect(mainProcessId).toBeDefined();
  let responseBreakpointRuleId: string | null = null;

  try {
    await getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyAction.save,
    ).click();
    await submitWindowsFileDialogPath(mainProcessId!, generatedFile);
    await page.bringToFront();
    await expect.poll(async () => readFile(generatedFile).catch(() => null))
      .toEqual(responseFileBytes);

    // 中文：Response Breakpoint通过真实Open Dialog选中该文件并Forward edited。
    // English: A Response Breakpoint selects that file through the real Open Dialog and forwards it.
    responseBreakpointRuleId = await createBreakpointRule(page, 'response');
    const fileTargetPath = '/e2e/body-effect-response-file';
    const responseOriginalForFile = '{"stage":"response-before-file"}';
    loopbackLab.respondWith(fileTargetPath, {
      body: responseOriginalForFile,
      headers: { 'transfer-encoding': 'chunked' },
    });
    const fileResponse = loopbackLab.requestThroughProxy(
      desktopApp.capturePort(),
      fileTargetPath,
    );
    await selectPausedRequest(page, fileTargetPath);
    await getByAutomationId(
      page,
      AUTOMATION_IDS.breakpoints.replacement.file,
    ).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
    await submitWindowsFileDialogPath(mainProcessId!, generatedFile);
    await page.bringToFront();
    const selectedFile = getByAutomationId(
      page,
      AUTOMATION_IDS.breakpoints.selectedFile,
    );
    await expect(selectedFile).toHaveAttribute(
      'data-file-name',
      'body-effect-response-file.json',
    );
    await expect(selectedFile).not.toContainText(generatedFile);
    await removeBreakpointHeader(page, 'transfer-encoding');
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    await expect(fileResponse).resolves.toMatchObject({
      statusCode: 200,
      body: responseFileBytes.toString('utf8'),
    });

    // 中文：Capture只公开File来源和Final，绝不泄漏绝对路径或伪造Response Original。
    // English: Capture exposes only File source and Final, never an absolute path or fabricated Response Original.
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureBodyRuleEffect(responseBreakpointRuleId),
    )).toBeVisible();
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.source,
    )).toHaveAttribute('data-source', 'file');
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.original,
    )).toBeDisabled();
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable,
    )).toBeVisible();
    await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-file-final');
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.root))
      .not.toContainText(generatedFile);
  } finally {
    await rm(generatedFile, { force: true });
  }

  if (!responseBreakpointRuleId) {
    throw new Error('Response Breakpoint Rule was not created.');
  }
  await setRuleEnabled(page, responseBreakpointRuleId, false);
  await setRuleEnabled(page, ruleId, true);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

  // 中文：Continue unmodified保留原文，不能从rule hit反推正文marker。
  // English: Continue unmodified preserves the body and must not infer a body marker from a Rule hit.
  const unmodifiedPath = '/e2e/body-effect-unmodified';
  const unmodifiedBody = Buffer.from('{"stage":"unmodified"}');
  const unmodifiedRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    unmodifiedPath,
    {
      method: 'POST',
      body: unmodifiedBody,
      headers: {
        'content-type': 'application/json',
        'content-length': String(unmodifiedBody.byteLength),
      },
    },
  );
  await selectPausedRequest(page, unmodifiedPath);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect(unmodifiedRequest).resolves.toMatchObject({ statusCode: 200 });
  expect((await observe(loopbackLab, unmodifiedPath)).body).toEqual(unmodifiedBody);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureBodyRuleEffect,
  )).toHaveCount(0);

  // 中文：只编辑header时仍保留原正文，也不制造body marker。
  // English: A header-only edit still preserves the original body and creates no body marker.
  const headerOnlyPath = '/e2e/body-effect-header-only';
  const headerOnlyBody = Buffer.from('{"stage":"header-only"}');
  const headerOnlyRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    headerOnlyPath,
    {
      method: 'POST',
      body: headerOnlyBody,
      headers: {
        'content-type': 'application/json',
        'content-length': String(headerOnlyBody.byteLength),
      },
    },
  );
  await selectPausedRequest(page, headerOnlyPath);
  await addBreakpointHeader(page, 'x-body-effect-header-only', 'edited');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(headerOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const headerOnlyObservation = await observe(loopbackLab, headerOnlyPath);
  expect(headerOnlyObservation.body).toEqual(headerOnlyBody);
  expect(headerOnlyObservation.headers['x-body-effect-header-only']).toBe('edited');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureBodyRuleEffect,
  )).toHaveCount(0);

  // 中文：保存origin证据；driver随后验证正常销毁、8888释放和系统代理恢复。
  // English: Attach origin evidence; the driver then verifies graceful teardown, port release, and proxy restoration.
  await testInfo.attach('body-effect-origin', {
    body: Buffer.from(JSON.stringify({
      path: requestPath,
      ruleId,
      original: original.toString('utf8'),
      final: observation.body.toString('utf8'),
    }, null, 2)),
    contentType: 'application/json',
  });
});
