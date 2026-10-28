import { request } from 'node:http';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../e2e-workflow-tests/fixtures/ui/automation';
import { startRecording } from '../../e2e-workflow-tests/fixtures/ui/capture-workflow';
import { expect, test } from '../fixtures/demo-recorder';

const REQUESTS = [
  { path: '/demo/acme/orders', body: { orderId: 'demo-001', status: 'ready' } },
  { path: '/demo/acme/profile', body: { name: 'Demo user', plan: 'team' } },
  { path: '/demo/acme/health', body: { ok: true } },
] as const;
/** 系统后台流量也会进入 Capture；先用本 demo 的前缀收窄，再断言行数。 */
const DEMO_FILTER = '/demo/acme/';

function requestThroughProxy(proxyPort: number, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1',
      port: proxyPort,
      path: url,
      headers: { host: new URL(url).host, connection: 'close' },
    }, (incoming) => {
      incoming.resume();
      incoming.once('error', reject);
      incoming.once('end', resolve);
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

test('demo.capture selects real traffic and reads the response', async ({
  desktopApp,
  httpTrafficRunner,
  demo,
}) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;

  for (const entry of REQUESTS) {
    const body = JSON.stringify(entry.body);
    httpTrafficRunner.respondWith(entry.path, {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    });
  }

  await startRecording(desktopApp);
  const keywordFilter = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
  await keywordFilter.fill(DEMO_FILTER);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();

  await demo.start();
  demo.caption({
    en: 'Capture real HTTP traffic without changing the client.',
    zh: '无需改客户端，直接捕获真实 HTTP 流量。',
  });
  await page.waitForTimeout(1000);
  for (const entry of REQUESTS) {
    await requestThroughProxy(desktopApp.capturePort(), httpTrafficRunner.url(entry.path));
  }
  await expect.poll(
    () => getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).count(),
  ).toBe(REQUESTS.length);
  await page.waitForTimeout(1000);

  demo.caption({
    en: 'Filter the stream by path or host.',
    zh: '按 Path 或 Host 过滤流量。',
  });
  await keywordFilter.fill('/orders');
  await expect.poll(
    () => getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).count(),
  ).toBe(1);
  await page.waitForTimeout(1200);

  demo.caption({
    en: 'Select a request to inspect headers, body and timing.',
    zh: '选中请求，查看 Header、正文和耗时。',
  });
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: REQUESTS[0].path })
    .last();
  await row.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
    .toContainText('ready', { timeout: 5000 });
  await page.waitForTimeout(2000);
  await demo.stop();
});
