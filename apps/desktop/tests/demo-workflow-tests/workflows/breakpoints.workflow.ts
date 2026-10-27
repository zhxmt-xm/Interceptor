import { request, type IncomingHttpHeaders } from 'node:http';

import type { Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../e2e-workflow-tests/fixtures/ui/automation';
import { startRecording } from '../../e2e-workflow-tests/fixtures/ui/capture-workflow';
import { createRequestBreakpointRule } from '../../e2e-workflow-tests/fixtures/ui/breakpoint-workflow';
import { expect, test } from '../fixtures/demo-recorder';

const DEMO_PATH = '/demo/orders/42';
const ORIGINAL_BODY = JSON.stringify({ orderId: 'demo-001', status: 'pending', total: 128 });
const EDITED_COMPACT = JSON.stringify({ orderId: 'demo-001', status: 'shipped', total: 128 });
const EDITED_BODY = JSON.stringify({ orderId: 'demo-001', status: 'shipped', total: 128 }, null, 2);

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

async function selectPaused(page: Page, requestPath: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ has: page.getByText(requestPath, { exact: true }) })
    .and(page.locator('[data-breakpoint-state="head"]'));
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
}

test('demo.breakpoints pauses, edits and forwards a request', async ({
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

  await createRequestBreakpointRule(page, 'README demo', undefined, DEMO_PATH);
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();

  await demo.start();
  demo.caption({
    en: 'Pause a request before it reaches the server.',
    zh: '在请求到达服务端前暂停它。',
  });
  await page.waitForTimeout(1200);

  const pending = requestThroughProxy(
    desktopApp.capturePort(),
    httpTrafficRunner.url(DEMO_PATH),
    'POST',
    ORIGINAL_BODY,
  );
  await selectPaused(page, DEMO_PATH);
  await page.waitForTimeout(1000);

  demo.caption({
    en: 'Edit the JSON body in place.',
    zh: '直接修改 JSON 正文。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  const bodyEditor = getByAutomationId(page, AUTOMATION_IDS.breakpoints.body);
  await bodyEditor.scrollIntoViewIfNeeded();
  await bodyEditor.click();
  await bodyEditor.fill('');
  await bodyEditor.pressSequentially(EDITED_COMPACT, { delay: 22 });
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Forward it — the server stays unchanged.',
    zh: '放行；服务端无需改动。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  const result = await pending;
  expect(result.body.toString('utf8')).toBe(EDITED_BODY);
  await expect.poll(() => httpTrafficRunner.observation(DEMO_PATH)?.body.toString('utf8'))
    .toBe(EDITED_COMPACT);
  await page.waitForTimeout(900);

  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
  await expect(page.getByText('Loading body...')).toHaveCount(0, { timeout: 5000 });
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
    .toContainText('shipped', { timeout: 5000 });

  demo.caption({
    en: 'The server receives the edited request.',
    zh: '服务端收到修改后的请求。',
  });
  await page.waitForTimeout(1800);
  await demo.stop();
});
