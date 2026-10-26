import { gunzipSync } from 'node:zlib';
import { access, readFile, rm } from 'node:fs/promises';
import { request, type IncomingHttpHeaders } from 'node:http';

import type { Locator, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { createResponseBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import type { HttpTrafficRunner, LoopbackRequestObservation } from '../../../../../playground/server/scenarios/traffic-lab';

const BREAKPOINT_REPLACEMENT_TEXT = 'breakpoints.replacement.text';

/** Extract the Core-owned identifier from one public dynamic automation ID. */
async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Missing dynamic automation ID with prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create, enable and apply one request breakpoint rule entirely through public controls. */
async function createRequestBreakpointRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('打开Rules准备创建请求断点 / Open Rules to create a request breakpoint');
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await screenshotStep('从根菜单新建规则 / Create a Rule from the root menu', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.create), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E request breakpoint');
  await screenshotStep('为请求断点规则命名 / Name the request breakpoint Rule', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await screenshotStep('限定请求断点的Host / Limit the request breakpoint Host', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill('/e2e/');
  await screenshotStep('用Path限定本轮请求范围 / Restrict the Rule to this run’s request paths', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await screenshotStep('移除默认Header动作 / Remove the default Header action');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await screenshotStep('选择Breakpoint动作 / Select the Breakpoint action', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
  await screenshotStep('检查请求阶段的Breakpoint动作 / Inspect the request-phase Breakpoint action');
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await screenshotStep('启用规则后明确Apply / Enable the Rule and explicitly Apply', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.apply), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await screenshotStep('请求断点已经应用 / The request breakpoint is applied');

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Create a later request-header rewrite through the same Rules editor users operate. */
async function createRequestHeaderRewriteRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E later rewrite');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill('/e2e/');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
  ).fill('x-e2e-before-breakpoint');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
  ).fill('rule-value');
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Select the paused Capture row for one test-owned request path. */
async function selectPausedRequest(page: Page, requestPath: string): Promise<void> {
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.keywordFilter,
  ).fill(requestPath);
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ has: page.getByText(requestPath, { exact: true }) })
    .and(page.locator('[data-breakpoint-state="head"]'));
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(
    getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited),
  ).toBeVisible();
  await screenshotStep(`选择挂起请求：${requestPath} / Select the paused request: ${requestPath}`, {
    highlights: [{ target: row, label: '1' }],
  });
}

/** Select the final request body through the public Inspector source control. */
async function selectFinalRequestBody(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.source).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.final).click();
}

/** Inspect text in the final request body while preserving the independent complete wire assertions. */
async function inspectFinalRequestBody(
  page: Page,
  expectedText: string,
  mode: 'raw' | 'default',
): Promise<void> {
  await selectFinalRequestBody(page);
  const modeButton = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]);
  await expect(modeButton).toBeVisible();
  await modeButton.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expectedText);
  await screenshotStep('在Capture查看修改后的Final请求正文 / Inspect the modified Final request body in Capture', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.source), label: '1' }],
  });
}

/** Find one breakpoint header row using only its public dynamic automation IDs. */
async function breakpointHeader(
  page: Page,
  headerName: string,
): Promise<{ name: Locator; value: Locator; effect: Locator; remove: Locator }> {
  const header = await findBreakpointHeader(page, headerName);
  if (!header) {
    throw new Error(`Breakpoint header not found: ${headerName}`);
  }
  return header;
}

/** Find an optional breakpoint header without converting absence into a selector failure. */
async function findBreakpointHeader(
  page: Page,
  headerName: string,
): Promise<{
  name: Locator;
  value: Locator;
  effect: Locator;
  remove: Locator;
} | null> {
  const names = page.locator(
    '[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
  );
  await expect.poll(() => names.count()).toBeGreaterThan(0);
  for (let index = 0; index < await names.count(); index += 1) {
    const name = names.nth(index);
    if ((await name.inputValue()).toLowerCase() !== headerName.toLowerCase()) {
      continue;
    }
    const nameAutomationId = await name.getAttribute('data-automation-id');
    if (!nameAutomationId) {
      break;
    }
    return {
      name,
      value: getByAutomationId(page, nameAutomationId.replace(/\.name$/, '.value')),
      effect: getByAutomationId(page, nameAutomationId.replace(/\.name$/, '.effect')),
      remove: getByAutomationId(page, nameAutomationId.replace(/\.name$/, '.remove')),
    };
  }
  return null;
}

/** Add one header through the breakpoint editor's public controls. */
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
  const nameAutomationId = await nameInput.getAttribute('data-automation-id');
  if (!nameAutomationId) {
    throw new Error('New breakpoint header did not expose its automation ID.');
  }
  await nameInput.fill(name);
  await getByAutomationId(page, nameAutomationId.replace(/\.name$/, '.value')).fill(value);
}

/** Wait for and return the origin's observation for one request. */
async function observe(
  loopbackLab: HttpTrafficRunner,
  requestPath: string,
): Promise<LoopbackRequestObservation> {
  await expect.poll(() => loopbackLab.observation(requestPath)).toBeDefined();
  const observation = loopbackLab.observation(requestPath);
  if (!observation) {
    throw new Error(`Origin did not observe ${requestPath}.`);
  }
  return observation;
}

/** Attach the test-owned origin facts that support every wire assertion. */
async function attachOriginEvidence(
  loopbackLab: HttpTrafficRunner,
  testInfo: TestInfo,
): Promise<void> {
  await testInfo.attach('origin-observations', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
}

test('breakpoints.execute-edited preserves user intent end to end', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.execute-edited',
  });

  const page = desktopApp.page;
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/');
  const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
  for (let index = 0; index < await facetToggles.count(); index += 1) {
    const toggle = facetToggles.nth(index);
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  }
  await startRecording(desktopApp);
  const binaryFilePath = testInfo.outputPath('request-body.bin');
  const binaryBody = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
  const binarySourcePath = '/e2e/request-file/source';
  loopbackLab.respondWith(binarySourcePath, {
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(binaryBody.length) },
    body: binaryBody,
  });
  await loopbackLab.requestThroughProxy(desktopApp.capturePort(), binarySourcePath);
  const binarySourceRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: binarySourcePath }).last();
  await expect(binarySourceRow).toBeVisible();
  if (await binarySourceRow.getAttribute('aria-pressed') !== 'true') await binarySourceRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await screenshotStep('先通过Save body保存二进制替换文件 / Save the binary replacement through Save body first', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), binaryFilePath);
  await expect.poll(async () => {
    try { return (await readFile(binaryFilePath)).toString('hex'); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }).toBe(binaryBody.toString('hex'));
  await screenshotStep('二进制替换文件已由产品保存 / The binary replacement file has been saved by the product');
  const breakpointRuleId = await createRequestBreakpointRule(page);
  const rewriteRuleId = await createRequestHeaderRewriteRule(page);

  const headerOnlyPath = '/e2e/header-only';
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
        'x-edit-stage': 'original',
        'x-e2e-remove': 'doomed',
      },
    },
  );
  await selectPausedRequest(page, headerOnlyPath);
  const laterRewrite = await findBreakpointHeader(page, 'x-e2e-before-breakpoint');
  expect.soft(
    laterRewrite,
    'Paused snapshot must include headers written by later regular Rules.',
  ).not.toBeNull();
  if (laterRewrite) {
    await expect.soft(laterRewrite.value).toHaveValue('rule-value');
    await expect.soft(laterRewrite.effect).toHaveAttribute('data-effect', 'set');
  }
  const contentType = await breakpointHeader(page, 'content-type');
  await contentType.value.fill('application/x-header-only');
  const stageHeader = await breakpointHeader(page, 'x-edit-stage');
  await stageHeader.value.fill('edited');
  const removedHeader = await breakpointHeader(page, 'x-e2e-remove');
  await removedHeader.remove.click();
  await expect(removedHeader.remove).toHaveCount(0);
  await addBreakpointHeader(page, 'x-e2e-added', 'added-value');
  await screenshotStep('编辑已有Header、删除一个Header并新增一个Header / Edit existing headers, remove one and add one', {
    highlights: [
      { target: contentType.value, label: '1' },
      { target: stageHeader.value, label: '2' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '3' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(headerOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const headerOnlyObservation = await observe(loopbackLab, headerOnlyPath);
  expect(headerOnlyObservation.body).toEqual(headerOnlyBody);
  expect(headerOnlyObservation.headers['content-type']).toBe('application/x-header-only');
  expect(headerOnlyObservation.headers['x-edit-stage']).toBe('edited');
  expect(headerOnlyObservation.headers['x-e2e-remove']).toBeUndefined();
  expect(headerOnlyObservation.headers['x-e2e-added']).toBe('added-value');
  expect(headerOnlyObservation.headers['content-length']).toBe(String(headerOnlyBody.byteLength));
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  // 修改已有header：旧值产生replace，新值产生set。
  for (const headerName of ['content-type', 'x-edit-stage']) {
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureRuleEffect(breakpointRuleId, 'replace', headerName),
    )).toBeVisible();
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureRuleEffect(breakpointRuleId, 'set', headerName),
    )).toBeVisible();
  }
  // 删除header产生remove；新增header只产生set。
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(breakpointRuleId, 'remove', 'x-e2e-remove'),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(breakpointRuleId, 'set', 'x-e2e-added'),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(breakpointRuleId, 'replace', 'x-e2e-added'),
  )).toHaveCount(0);
  // 未编辑的继承Content-Length不产生breakpoint effect；普通Rule的效果仍独立存在。
  for (const effect of ['replace', 'set', 'remove']) {
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureRuleEffect(breakpointRuleId, effect, 'content-length'),
    )).toHaveCount(0);
  }
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(rewriteRuleId, 'set', 'x-e2e-before-breakpoint'),
  )).toBeVisible();
  await screenshotStep('核对replace/set/remove效果与未编辑Header / Inspect replace, set and remove effects plus untouched headers');

  const bodyOnlyPath = '/e2e/body-only';
  const bodyOnlyOriginal = Buffer.from('{"stage":"body-original"}');
  const bodyOnlyReplacement = '{"stage":"body-edited"}';
  const bodyOnlyRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    bodyOnlyPath,
    {
      method: 'POST',
      body: bodyOnlyOriginal,
      headers: {
        'content-type': 'application/json',
        'content-length': String(bodyOnlyOriginal.byteLength),
      },
    },
  );
  await selectPausedRequest(page, bodyOnlyPath);
  await collapseBreakpointDetails(page);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await screenshotStep('选择Text输入替换正文 / Select Text for a replacement body', {
    highlights: [{ target: getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(bodyOnlyReplacement);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeInViewport({ ratio: 1 });
  await screenshotStep('仅替换暂停请求的正文 / Replace only the paused request body', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(bodyOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const bodyOnlyObservation = await observe(loopbackLab, bodyOnlyPath);
  expect(bodyOnlyObservation.body.toString('utf8')).toBe(bodyOnlyReplacement);
  expect(bodyOnlyObservation.headers['content-length']).toBe(
    String(Buffer.byteLength(bodyOnlyReplacement)),
  );
  await screenshotStep('执行后保留正确的正文长度 / Preserve the correct body length after execution');
  await inspectFinalRequestBody(page, 'body-edited', 'raw');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  // body-only不得产生breakpoint header effect；普通Rule的set effect仍独立存在。
  await expect(page.locator(
    `[data-automation-id^="${AUTOMATION_ID_PREFIXES.captureRuleEffect}${breakpointRuleId}."]`,
  )).toHaveCount(0);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(rewriteRuleId, 'set', 'x-e2e-before-breakpoint'),
  )).toBeVisible();
  await screenshotStep('body-only没有任何breakpoint Header效果 / A body-only edit creates no breakpoint header effect');

  const headerAndBodyPath = '/e2e/header-and-body';
  const headerAndBodyOriginal = Buffer.from('{"stage":"combined-original"}');
  const headerAndBodyReplacement = '{"stage":"combined-edited"}';
  const headerAndBodyRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    headerAndBodyPath,
    {
      method: 'POST',
      body: headerAndBodyOriginal,
      headers: {
        'content-type': 'application/json',
        'content-length': String(headerAndBodyOriginal.byteLength),
      },
    },
  );
  await selectPausedRequest(page, headerAndBodyPath);
  await addBreakpointHeader(page, 'Content-Encoding', 'gzip');
  await screenshotStep('为新正文选择gzip内容编码 / Select gzip content encoding for the replacement body', {
    highlights: [{ target: (await breakpointHeader(page, 'content-encoding')).value, label: '1' }],
  });
  await collapseBreakpointDetails(page);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(
    headerAndBodyReplacement,
  );
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeInViewport({ ratio: 1 });
  await screenshotStep('同时编辑正文与压缩Headers / Edit the body and compression headers together', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(headerAndBodyRequest).resolves.toMatchObject({ statusCode: 200 });
  const headerAndBodyObservation = await observe(loopbackLab, headerAndBodyPath);
  expect(headerAndBodyObservation.headers['content-encoding']).toBe('gzip');
  expect(gunzipSync(headerAndBodyObservation.body).toString('utf8')).toBe(
    headerAndBodyReplacement,
  );
  expect(headerAndBodyObservation.headers['content-length']).toBe(
    String(headerAndBodyObservation.body.byteLength),
  );
  await screenshotStep('核对gzip编码后的真实结果 / Verify the actual gzip-encoded result');
  await selectFinalRequestBody(page);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => {
    const text = await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView).innerText();
    return Array.from(text.matchAll(/^[0-9a-f]{8} {2}((?:[0-9a-f]{2}(?: |$))+)/gm),
      (match) => match[1]!.replaceAll(' ', '')).join('');
  }).toBe(headerAndBodyObservation.body.toString('hex'));
  await screenshotStep('用Hex查看gzip编码后的Final字节 / Inspect gzip-encoded Final bytes in Hex', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.source), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex), label: '2' },
    ],
  });

  const chunkedPath = '/e2e/body-only-chunked';
  const chunkedOriginal = Buffer.from('chunked-original');
  const chunkedReplacement = 'chunked-edited';
  const chunkedRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    chunkedPath,
    {
      method: 'POST',
      body: chunkedOriginal,
      headers: {
        'content-type': 'text/plain',
        'transfer-encoding': 'chunked',
      },
    },
  );
  await selectPausedRequest(page, chunkedPath);
  await collapseBreakpointDetails(page);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(chunkedReplacement);
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeInViewport({ ratio: 1 });
  await screenshotStep('替换chunked请求正文 / Replace a chunked request body', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(chunkedRequest).resolves.toMatchObject({ statusCode: 200 });
  const chunkedObservation = await observe(loopbackLab, chunkedPath);
  expect(chunkedObservation.body.toString('utf8')).toBe(chunkedReplacement);
  expect(chunkedObservation.headers['transfer-encoding']).toBe('chunked');
  expect(chunkedObservation.headers['content-length']).toBeUndefined();
  await screenshotStep('核对chunked传输不添加Content-Length / Verify chunked transfer omits Content-Length');
  await inspectFinalRequestBody(page, 'chunked-edited', 'default');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  await expect(page.locator(
    `[data-automation-id^="${AUTOMATION_ID_PREFIXES.captureRuleEffect}${breakpointRuleId}."]`,
  )).toHaveCount(0);

  // Verify HTTP header-phase empty Text and binary File without changing the original four cases.
  // 保留原四组案例，另核对HTTP头阶段空Text和完整二进制File。
  const emptyPath = '/e2e/empty-text';
  const emptyOriginal = '{"stage":"empty-keeps-original"}';
  const emptyRequest = loopbackLab.requestThroughProxy(desktopApp.capturePort(), emptyPath, {
    method: 'POST', body: emptyOriginal,
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(emptyOriginal)) },
  });
  await selectPausedRequest(page, emptyPath);
  await collapseBreakpointDetails(page);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('');
  await screenshotStep('HTTP头阶段的空Text保留原正文 / Empty Text at the HTTP header phase retains the original body', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(emptyRequest).resolves.toMatchObject({ statusCode: 200 });
  expect((await observe(loopbackLab, emptyPath)).body.toString('utf8')).toBe(emptyOriginal);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(emptyOriginal);
  await screenshotStep('空Text没有替换正文，Raw仍是原请求 / Empty Text did not replace the body; Raw retains the original request', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw), label: '1' }],
  });

  const binaryPath = '/e2e/binary-file';
  const binaryRequest = loopbackLab.requestThroughProxy(desktopApp.capturePort(), binaryPath, {
    method: 'POST', body: '{"stage":"before-file"}',
  });
  await selectPausedRequest(page, binaryPath);
  const binaryContentType = await findBreakpointHeader(page, 'content-type');
  if (!binaryContentType) throw new Error('The binary request has no Content-Type editor.');
  await binaryContentType.value.fill('application/octet-stream');
  await screenshotStep('为二进制请求设置Content-Type / Set Content-Type for the binary request', {
    highlights: [{ target: binaryContentType.value, label: '1' }],
  });
  await collapseBreakpointDetails(page);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.file).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile)).toBeInViewport({ ratio: 1 });
  await screenshotStep('为请求选择二进制File / Choose a binary File for the request', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), binaryFilePath);
  const binarySelection = getByAutomationId(page, AUTOMATION_IDS.breakpoints.selectedFile);
  await expect(binarySelection).toHaveAttribute('data-file-name', 'request-body.bin');
  await expect(binarySelection).toHaveAttribute('data-file-size', String(binaryBody.length));
  await expect(binarySelection).toBeInViewport({ ratio: 1 });
  await screenshotStep('核对完整二进制文件后转发 / Verify the complete binary file before forwarding', {
    highlights: [
      { target: binarySelection, label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(binaryRequest).resolves.toMatchObject({ statusCode: 200 });
  const binaryObservation = await observe(loopbackLab, binaryPath);
  expect(binaryObservation.body).toEqual(binaryBody);
  expect(binaryObservation.headers['content-type']).toBe('application/octet-stream');
  expect(binaryObservation.headers['content-length']).toBe(String(binaryBody.length));
  await screenshotStep('源站收到完整二进制文件字节 / The origin receives every binary file byte');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  for (const ruleId of [breakpointRuleId, rewriteRuleId]) {
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用本轮请求规则 / Disable the request Rule used by this operation', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
  }
  await screenshotStep('保存请求规则的停用状态 / Save the disabled request Rules', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.apply), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
  await expect(access(desktopApp.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });
  await attachOriginEvidence(loopbackLab, testInfo);
  await rm(binaryFilePath, { force: true });
});

/** Read complete response bytes and headers from an explicit proxy client. */
async function requestResponseThroughProxy(
  proxyPort: number,
  url: string,
): Promise<{ statusCode: number | undefined; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1',
      port: proxyPort,
      path: url,
      headers: { host: new URL(url).host, connection: 'close' },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.once('error', reject);
      incoming.once('aborted', () => reject(new Error('The response breakpoint connection was aborted.')));
      incoming.once('end', () => resolve({
        statusCode: incoming.statusCode,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      }));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

/** Make room for status and replacement controls using the public section toggles. */
async function collapseBreakpointDetails(page: Page): Promise<void> {
  const editor = getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)
    .locator('xpath=ancestor::section[1]');
  const expanded = editor.locator('button[aria-controls][aria-expanded="true"]:visible');
  while (await expanded.count() > 0) await expanded.first().click();
}

test('breakpoints.response-edited preserves headers status files and explicit decisions', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'breakpoints.response-edited' });
  const { page } = desktopApp;
  const sourcePath = '/e2e/response-edits/file-source';
  const fileBody = '{"message":"file-response"}';
  const filePath = testInfo.outputPath('response-body.json');
  const statusCode = page.locator('[id="breakpoint-response-status"]');
  try {
    // Prepare the replacement through a real captured response and the product Save dialog.
    // 先捕获真实响应，再通过产品Save窗口生成替换文件。
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/response-edits/');
    const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
    for (let index = 0; index < await facetToggles.count(); index += 1) {
      const toggle = facetToggles.nth(index);
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    }
    await startRecording(desktopApp);
    httpTrafficRunner.respondWith(sourcePath, {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(fileBody)) },
      body: fileBody,
    });
    await expect(requestResponseThroughProxy(desktopApp.capturePort(), httpTrafficRunner.url(sourcePath)))
      .resolves.toMatchObject({ statusCode: 200, body: Buffer.from(fileBody) });
    const sourceRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: sourcePath }).last();
    await expect(sourceRow).toBeVisible();
    if (await sourceRow.getAttribute('aria-pressed') !== 'true') await sourceRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await screenshotStep('先保存用于响应替换的JSON文件 / Save the JSON file for response replacement first', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
    await expect.poll(async () => {
      try { return (await readFile(filePath)).toString('utf8'); }
      catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      }
    }).toBe(fileBody);
    await screenshotStep('响应替换文件已经保存 / The response replacement file is saved');

    // Configure a real response Rule; its existing labelled status field identifies the response editor.
    // 配置真实Response规则；已有状态码输入框的公开label关系用于定位响应编辑器。
    const ruleId = await createResponseBreakpointRule(page, 'E2E response edits', '/e2e/response-edits/');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    await screenshotStep('核对已保存的响应规则名称与Path / Inspect the saved response Rule name and Path', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' },
        { target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '2' },
      ],
    });
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
    await screenshotStep('选择Response阶段而不是Request / Choose Response rather than Request', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')), label: '1' }],
    });
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
    await screenshotStep('已应用的Response断点 / The applied Response breakpoint', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

    // Exercise each decision with a different origin response and compare all delivered body bytes.
    // 各决定使用不同源站响应，并逐字节比较实际送达的完整正文。
    for (const action of ['header', 'text', 'file', 'unmodified', 'drop', 'status'] as const) {
      const requestPath = `/e2e/response-edits/${action}`;
      const originalBody = JSON.stringify({ action, source: 'origin' });
      httpTrafficRunner.respondWith(requestPath, {
        statusCode: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(originalBody)),
          'x-response-original': 'origin',
        },
        body: originalBody,
      });
      const response = requestResponseThroughProxy(desktopApp.capturePort(), httpTrafficRunner.url(requestPath))
        .then((result) => ({ result }), (error: unknown) => ({ error }));
      await selectPausedRequest(page, requestPath);
      await expect(statusCode).toHaveValue('200');
      await expect.poll(() => httpTrafficRunner.observation(requestPath)).toBeDefined();
      let expectedBody = originalBody;
      if (action === 'header') {
        await addBreakpointHeader(page, 'x-response-edited', 'header-only');
        await screenshotStep('只修改响应Header，保留原正文 / Edit only a response Header and retain the body', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      } else if (action === 'text') {
        expectedBody = '{"message":"response-edited"}';
        await collapseBreakpointDetails(page);
        await statusCode.fill('201');
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(expectedBody);
        await expect(statusCode).toBeInViewport({ ratio: 1 });
        await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeInViewport({ ratio: 1 });
        await screenshotStep('修改响应状态码与完整Text正文 / Edit the response status and complete Text body', {
          highlights: [
            { target: statusCode, label: '1' },
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '2' },
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '3' },
          ],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      } else if (action === 'file') {
        expectedBody = fileBody;
        await collapseBreakpointDetails(page);
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.file).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile)).toBeInViewport({ ratio: 1 });
        await screenshotStep('为响应选择File替换 / Choose File replacement for the response', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
        await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
        const selected = getByAutomationId(page, AUTOMATION_IDS.breakpoints.selectedFile);
        await expect(selected).toHaveAttribute('data-file-name', 'response-body.json');
        await expect(selected).toHaveAttribute('data-file-size', String(Buffer.byteLength(fileBody)));
        await expect(selected).toContainText('file-response');
        await selected.scrollIntoViewIfNeeded();
        await expect(selected).toBeInViewport({ ratio: 1 });
        await screenshotStep('核对响应文件后Forward edited / Verify the response file before Forward edited', {
          highlights: [
            { target: selected, label: '1' },
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
          ],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      } else if (action === 'unmodified') {
        await collapseBreakpointDetails(page);
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill('not-forwarded');
        await screenshotStep('Continue忽略未提交的响应草稿 / Continue ignores the unsubmitted response draft', {
          highlights: [
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.body), label: '1' },
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '2' },
          ],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
      } else if (action === 'status') {
        await collapseBreakpointDetails(page);
        await statusCode.fill('202');
        await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
        await screenshotStep('只改响应状态为202，正文保持Off / Change only response status to 202 with the body Off', {
          highlights: [
            { target: statusCode, label: '1' },
            { target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited), label: '2' },
          ],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      } else {
        await screenshotStep('丢弃当前响应，不撤销已到达源站的请求 / Drop this response without undoing the request already received by the origin', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop).click();
      }

      const outcome = await response;
      if (action === 'drop') {
        expect(outcome).toHaveProperty('error');
        await screenshotStep('响应Drop后的客户端连接结束 / The client connection ends after dropping the response');
        continue;
      }
      if (!('result' in outcome)) throw new Error(`Response ${action} failed`, { cause: outcome.error });
      expect(outcome.result.statusCode).toBe(action === 'text' ? 201 : action === 'status' ? 202 : 200);
      expect(outcome.result.body).toEqual(Buffer.from(expectedBody));
      expect(outcome.result.headers['content-length']).toBe(String(Buffer.byteLength(expectedBody)));
      if (action === 'header') expect(outcome.result.headers['x-response-edited']).toBe('header-only');
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      if (action === 'text' || action === 'file') {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.source).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.final).click();
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expectedBody);
      await screenshotStep(`核对${action}操作后的完整响应 / Inspect the complete response after ${action}`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
      });
    }
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用本轮Response规则，尚需Save / Disable this Response Rule before Save', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
    await screenshotStep('保存Response规则的停用状态 / Save the disabled Response Rule', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.apply), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    await screenshotStep('Response规则已停用并应用 / The Response Rule is disabled and applied', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    await attachOriginEvidence(httpTrafficRunner, testInfo);
  } finally {
    await rm(filePath, { force: true });
  }
});
