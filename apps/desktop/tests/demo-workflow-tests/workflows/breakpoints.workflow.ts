import { request, type IncomingHttpHeaders } from 'node:http';

import type { Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../e2e-workflow-tests/fixtures/ui/automation';
import { startRecording } from '../../e2e-workflow-tests/fixtures/ui/capture-workflow';
import { expect, test } from '../fixtures/demo-recorder';

const DEMO_PATH = '/demo/orders/42';
const ORIGINAL_BODY = JSON.stringify({ orderId: 'demo-001', status: 'pending', total: 128 });
const EDITED_COMPACT = JSON.stringify({ orderId: 'demo-001', status: 'shipped', total: 128 });
const EDITED_BODY = JSON.stringify({ orderId: 'demo-001', status: 'shipped', total: 128 }, null, 2);
const CHINESE = (process.env.INTERCEPTOR_E2E_LOCALE ?? '').toLowerCase().startsWith('zh');
const RULE_NAME = CHINESE ? 'README 断点演示' : 'README demo breakpoint';

async function requestThroughProxy(
  proxyPort: number,
  url: string,
  method: string,
  body: string,
): Promise<{ statusCode: number | undefined; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1',
      port: proxyPort,
      path: url,
      method,
      headers: {
        host: new URL(url).host,
        connection: 'close',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.once('error', reject);
      incoming.once('aborted', () => reject(new Error('The breakpoint connection was aborted.')));
      incoming.once('end', () => resolve({
        statusCode: incoming.statusCode,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      }));
    });
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

async function responseIsReady(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
  await expect(page.getByText('Loading body...')).toHaveCount(0, { timeout: 5000 });
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
    .toContainText('shipped', { timeout: 5000 });
}

test('demo.breakpoints creates a Rule breakpoint, edits the request and forwards it', async ({
  desktopApp,
  httpTrafficRunner,
  demo,
}) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;

  httpTrafficRunner.respondWith(DEMO_PATH, {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(EDITED_BODY)),
    },
    body: EDITED_BODY,
  });

  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();

  await demo.start();
  demo.caption({
    en: 'Create a breakpoint from a Rule.',
    zh: '通过 Rule 创建断点。',
  });
  await page.waitForTimeout(1000);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await ruleRow.getAttribute('data-automation-id');
  if (!ruleId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('The Rule omitted its public identity.');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName)
    .fill(RULE_NAME);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length), 0, 'value'),
  ).fill('127.0.0.1');
  await page.waitForTimeout(800);

  demo.caption({
    en: 'Match the host and path.',
    zh: '匹配 Host 和 Path。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length), 1, 'value'),
  ).fill(DEMO_PATH);
  await page.waitForTimeout(800);

  demo.caption({
    en: 'Replace the default action with Breakpoint.',
    zh: '把默认动作换成 Breakpoint。',
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length), 0, 'remove'),
  ).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
  await page.waitForTimeout(800);

  demo.caption({
    en: 'Enable and apply the Rule.',
    zh: '启用并应用 Rule。',
  });
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length)));
  if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Send a matching request.',
    zh: '发送匹配的请求。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();
  const pending = requestThroughProxy(
    desktopApp.capturePort(),
    httpTrafficRunner.url(DEMO_PATH),
    'POST',
    ORIGINAL_BODY,
  );
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(DEMO_PATH);
  const paused = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: DEMO_PATH })
    .and(page.locator('[data-breakpoint-state="head"]'));
  await expect(paused).toHaveCount(1);
  const pendingRow = paused.last();
  await pendingRow.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Edit the JSON body in place.',
    zh: '直接修改 JSON 正文。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  const bodyEditor = getByAutomationId(page, AUTOMATION_IDS.breakpoints.body);
  await bodyEditor.scrollIntoViewIfNeeded();
  await bodyEditor.click();
  await bodyEditor.fill('');
  await bodyEditor.pressSequentially(EDITED_COMPACT, { delay: 20 });
  await expect(bodyEditor).toHaveValue(EDITED_COMPACT);
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Forward it; the server stays unchanged.',
    zh: '放行；服务端无需改动。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  const result = await pending;
  expect(result.body.toString('utf8')).toBe(EDITED_BODY);
  await expect.poll(() => httpTrafficRunner.observation(DEMO_PATH)?.body.toString('utf8'))
    .toBe(EDITED_COMPACT);
  await page.waitForTimeout(900);

  demo.caption({
    en: 'The server receives the edited request.',
    zh: '服务端收到修改后的请求。',
  });
  await responseIsReady(page);
  await page.waitForTimeout(2000);
  await demo.stop();
});
