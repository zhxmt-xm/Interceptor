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

const DEMO_PATH = '/demo/rules/42';
const ORIGINAL_BODY = JSON.stringify({ orderId: 'demo-001', status: 'ready', total: 128 });

async function getThroughProxy(
  proxyPort: number,
  url: string,
): Promise<{ statusCode: number | undefined; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1',
      port: proxyPort,
      path: url,
      method: 'GET',
      headers: { host: new URL(url).host, connection: 'close' },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.once('error', reject);
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

test('demo.rules creates and applies a status rewrite Rule', async ({
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
      'content-length': String(Buffer.byteLength(ORIGINAL_BODY)),
    },
    body: ORIGINAL_BODY,
  });

  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();

  await demo.start();
  demo.caption({
    en: 'Rewrite traffic without changing the server.',
    zh: '不改服务端，直接改写流量。',
  });
  await page.waitForTimeout(1200);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await ruleRow.getAttribute('data-automation-id');
  if (!ruleId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('The Rule omitted its public identity.');
  const id = ruleId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('README demo status');
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(id, 0, 'value'))
    .fill('127.0.0.1');
  await page.waitForTimeout(800);

  demo.caption({
    en: 'Match the host and path.',
    zh: '匹配 Host 和 Path。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(id, 1, 'value'))
    .fill(DEMO_PATH);
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Replace the default action with Set status.',
    zh: '把默认动作换成 Set status。',
  });
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(id, 0, 'remove')).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.status).click();
  const statusCard = getByAutomationId(page, AutomationIdFactory.ruleActionField(id, 0, 'remove')).locator('../..');
  await statusCard.locator('input[type="number"]').fill('418');
  await page.waitForTimeout(1000);

  demo.caption({
    en: 'Enable and apply the Rule.',
    zh: '启用并应用 Rule。',
  });
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(id));
  if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Send a request through the proxy.',
    zh: '通过代理发送请求。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();
  const result = await getThroughProxy(desktopApp.capturePort(), httpTrafficRunner.url(DEMO_PATH));
  expect(result.statusCode).toBe(418);
  expect(result.body.toString('utf8')).toBe(ORIGINAL_BODY);
  await page.waitForTimeout(900);

  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: DEMO_PATH })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  const general = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general);
  await expect(general).toBeVisible();
  if (await general.getAttribute('aria-expanded') !== 'true') await general.click();
  await expect(general.locator('..')).toContainText('418');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
    .toContainText('ready', { timeout: 5000 });

  demo.caption({
    en: 'The client receives 418 from the Rule.',
    zh: '客户端从 Rule 收到 418。',
  });
  await page.waitForTimeout(2000);
  await demo.stop();
});
