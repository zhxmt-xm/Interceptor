import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

test('composer.response.section-collapse keeps sections independent and accessible', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.response.section-collapse',
  });

  const { page } = desktopApp;
  const requestPath = '/e2e/composer/response-section-collapse';

  // 通过真实Composer UI新建并发送loopback请求，建立响应Headers数据。
  // Create and send a loopback request through the real Composer UI to arrange response Headers data.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(
    loopbackLab.url(requestPath),
  );
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(requestPath)?.method).toBe('GET');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseTab.headers,
  ).click();

  // 读取两个独立response section的公共控件与正文关系，不依赖当前语言文案。
  // Resolve two independent public response-section controls and bodies without localized text.
  const responseHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseSection.responseHeaders,
  );
  const requestHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseSection.requestHeaders,
  );
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');

  const responseHeadersBodyId = await responseHeaders.getAttribute('aria-controls');
  const requestHeadersBodyId = await requestHeaders.getAttribute('aria-controls');
  expect(responseHeadersBodyId).toBeTruthy();
  expect(requestHeadersBodyId).toBeTruthy();
  const responseHeadersBody = page.locator(`[id="${responseHeadersBodyId}"]`);
  const requestHeadersBody = page.locator(`[id="${requestHeadersBodyId}"]`);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);
  await expect(requestHeadersBody).toHaveJSProperty('hidden', false);

  // 用户依次折叠两个section；每次只允许目标状态变化。
  // Collapse each section in turn; each action may change only its target state.
  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', false);

  await requestHeaders.click();
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', true);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');

  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeaders).toHaveAttribute('aria-controls', responseHeadersBodyId!);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', true);

  // 保存最终ARIA与正文状态；driver随后负责trace、正常Close和销毁验证。
  // Save final ARIA and body state; the driver then owns trace, graceful Close, and teardown verification.
  await testInfo.attach('section-collapse-state', {
    body: Buffer.from(JSON.stringify({
      responseHeaders: {
        controls: responseHeadersBodyId,
        expanded: await responseHeaders.getAttribute('aria-expanded'),
        hidden: await responseHeadersBody.getAttribute('hidden') !== null,
      },
      requestHeaders: {
        controls: requestHeadersBodyId,
        expanded: await requestHeaders.getAttribute('aria-expanded'),
        hidden: await requestHeadersBody.getAttribute('hidden') !== null,
      },
    }, null, 2)),
    contentType: 'application/json',
  });
});