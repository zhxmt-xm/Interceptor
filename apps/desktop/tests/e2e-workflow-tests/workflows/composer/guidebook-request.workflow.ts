import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer.request-edit records matching guide steps on the actual released App', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const requestPath = '/guide/composer';
  const response = '{"request":"Guide request","message":"Hello Interceptor","status":"ready"}';
  httpTrafficRunner.respondWith(requestPath, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-interceptor-guide': 'composer-demo' },
    body: response,
  });

  // 准备：正式版本、真实窗口、无凭据loopback服务，不切换产品语言。
  // Arrange: use the released App, its native window and a credential-free loopback service.
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer');
  try {
    // 用户操作：每次真实点击后核对可观察状态并保存同一步骤图。
    // User actions: validate the observable state after each actual action and capture its step image.
    await media.step('01-open', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.newRequest)).toBeVisible();
    });
    await media.step('02-new', '新建请求 / Create a request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toBeVisible();
    });
    await media.step('03-url', '填写测试地址 / Enter the test URL', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(requestPath));
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
    });
    await media.step('04-send', '发送请求并检查响应 / Send and inspect the response', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(requestPath)?.method).toBe('GET');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('Hello Interceptor');
    });
    await media.step('05-headers', '查看响应 Headers / Inspect response headers', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.headers).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.responseHeaders)).toBeVisible();
    });
    await media.step('06-query', '添加 Query 字段 / Add a Query field', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('guide');
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill('composer-demo');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
      await expect(page.locator('input[value="composer-demo"]')).toHaveCount(1);
    });
    await media.step('07-header', '添加请求 Header / Add a request header', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-interceptor-guide');
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('composer-demo');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
      await expect(page.locator('input[value="x-interceptor-guide"]')).toHaveCount(1);
    });
    await media.step('08-auth', '检查不使用认证 / Confirm no authentication', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.authType)).toBeVisible();
    });
    await media.step('09-history', '查看 Recent sends / Inspect recent sends', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.history).click();
      await expect(page.locator('body')).toContainText(requestPath);
    });
    await page.keyboard.press('Escape');
    await media.step('10-body', '返回响应正文 / Return to the response body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('Hello Interceptor');
    });

    // 业务断言与证据：自产请求只发送一次，文本、变量和值写入相同录制清单。
    // Assert and evidence: send the owned request once and persist the matching example values.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      url: httpTrafficRunner.url(requestPath), queryName: 'guide', queryValue: 'composer-demo',
      headerName: 'x-interceptor-guide', headerValue: 'composer-demo', response,
    });
  }
  // 清理：复用真实Close与宿主guard核对进程、8888和系统设置恢复。
  // Cleanup: the driver verifies normal Close, all process generations, port 8888 and host restoration.
});
