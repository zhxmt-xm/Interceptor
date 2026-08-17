import { gunzipSync } from 'node:zlib';

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
import type { LoopbackLab, LoopbackRequestObservation } from '../../fixtures/loopback-lab';

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
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E request breakpoint');
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
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Create a later request-header rewrite through the same Rules editor users operate. */
async function createRequestHeaderRewriteRule(page: Page): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E later rewrite');
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
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
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await expect(
    getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited),
  ).toBeVisible();
}

/** Find one breakpoint header row using only its public dynamic automation IDs. */
async function breakpointHeader(
  page: Page,
  headerName: string,
): Promise<{ name: Locator; value: Locator; effect: Locator }> {
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
): Promise<{ name: Locator; value: Locator; effect: Locator } | null> {
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
  loopbackLab: LoopbackLab,
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
  loopbackLab: LoopbackLab,
  testInfo: TestInfo,
): Promise<void> {
  await testInfo.attach('origin-observations', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
}

test('breakpoints.execute-edited preserves user intent end to end', async ({
  desktopApp,
  loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.execute-edited',
  });

  const page = desktopApp.page;
  await startRecording(desktopApp);
  const breakpointRuleId = await createRequestBreakpointRule(page);
  await createRequestHeaderRewriteRule(page);

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
    await expect.soft(laterRewrite.effect).toHaveText('Rule set');
  }
  const contentType = await breakpointHeader(page, 'content-type');
  await contentType.value.fill('application/x-header-only');
  const stageHeader = await breakpointHeader(page, 'x-edit-stage');
  await stageHeader.value.fill('edited');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(headerOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const headerOnlyObservation = await observe(loopbackLab, headerOnlyPath);
  expect(headerOnlyObservation.body).toEqual(headerOnlyBody);
  expect(headerOnlyObservation.headers['content-type']).toBe('application/x-header-only');
  expect(headerOnlyObservation.headers['x-edit-stage']).toBe('edited');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  await expect.soft(getByAutomationId(
    page,
    AutomationIdFactory.captureRuleEffect(
      breakpointRuleId,
      'set',
      'x-edit-stage',
    ),
  )).toBeVisible();

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
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(bodyOnlyReplacement);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(bodyOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const bodyOnlyObservation = await observe(loopbackLab, bodyOnlyPath);
  expect(bodyOnlyObservation.body.toString('utf8')).toBe(bodyOnlyReplacement);
  expect(bodyOnlyObservation.headers['content-length']).toBe(
    String(Buffer.byteLength(bodyOnlyReplacement)),
  );

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
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(
    headerAndBodyReplacement,
  );
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

  await attachOriginEvidence(loopbackLab, testInfo);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
});