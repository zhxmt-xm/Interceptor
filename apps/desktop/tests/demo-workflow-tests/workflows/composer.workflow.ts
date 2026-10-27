import {
  AUTOMATION_IDS,
} from '../../../src/shared/automation-ids';
import { getByAutomationId } from '../../e2e-workflow-tests/fixtures/ui/automation';
import { expect, test } from '../fixtures/demo-recorder';

const DEMO_PATH = '/demo/composer/echo';
const REQUEST_BODY = JSON.stringify({ orderId: 'demo-001', status: 'shipped' });
const RESPONSE_BODY = JSON.stringify({ ok: true, path: DEMO_PATH });

test('demo.composer builds and sends a POST request', async ({
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
      'content-length': String(Buffer.byteLength(RESPONSE_BODY)),
    },
    body: RESPONSE_BODY,
  });

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.list)).toBeVisible();
  await demo.start();
  demo.caption({
    en: 'Build a request without writing a client.',
    zh: '不用写客户端，直接构造请求。',
  });
  await page.waitForTimeout(1000);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();

  demo.caption({
    en: 'Choose the method, URL and JSON body.',
    zh: '选择方法、URL 和 JSON 正文。',
  });
  const method = getByAutomationId(page, AUTOMATION_IDS.composer.method);
  await method.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(method).toContainText('POST');
  await getByAutomationId(page, AUTOMATION_IDS.composer.url)
    .fill(httpTrafficRunner.url(DEMO_PATH));
  await page.waitForTimeout(700);
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  const bodyModes = getByAutomationId(page, AUTOMATION_IDS.composer.bodyType)
    .locator('..')
    .getByRole('radio');
  await bodyModes.nth(1).click();
  await expect(bodyModes.nth(1)).toHaveAttribute('aria-checked', 'true');
  const bodyEditor = getByAutomationId(page, AUTOMATION_IDS.composer.body);
  await expect(bodyEditor).toBeVisible();
  await bodyEditor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(REQUEST_BODY);
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Send it and read the response.',
    zh: '发送并查看响应。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.response))
    .toHaveAttribute('data-send-state', 'ready');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane))
    .toContainText(DEMO_PATH, { timeout: 5000 });
  await page.waitForTimeout(1800);
  await demo.stop();
});
