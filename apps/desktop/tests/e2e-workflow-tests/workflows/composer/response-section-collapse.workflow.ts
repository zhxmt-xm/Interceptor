import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

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
  const responseText = '{"message":"response-sections","items":[{"id":"e2e-item","count":2}]}';
  loopbackLab.respondWith(requestPath, {
    body: responseText,
    headers: {
      'content-type': 'application/json',
      'set-cookie': ['e2e_session=section-value; Path=/; HttpOnly', 'e2e_theme=light; Path=/'],
    },
  });

  // 通过真实Composer UI新建并发送loopback请求，建立响应Headers数据。
  // Create and send a loopback request through the real Composer UI to arrange response Headers data.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await screenshotStep('打开Composer，准备新建请求 / Open Composer before creating a request', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.newRequest), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await screenshotStep('新建请求，尚未填写地址 / Create a request before entering its URL', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(
    loopbackLab.url(requestPath),
  );
  await screenshotStep('填写GET请求地址，保留Auto协议 / Enter the GET request URL with Auto selected', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.composer.send), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(requestPath)?.method).toBe('GET');
  await screenshotStep('发送GET后查看响应正文 / Inspect the response body after sending GET');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseTab.headers,
  ).click();
  await screenshotStep('通过真实Composer UI新建并发送loopback请求，建立响应Headers数据。 / Create and send a loopback request through the real Composer UI to arrange response Headers data.');

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
  await screenshotStep('读取两个独立response section的公共控件与正文关系，不依赖当前语言文案。 / Resolve two independent public response-section controls and bodies without localized text.');

  // 用户依次折叠两个section；每次只允许目标状态变化。
  // Collapse each section in turn; each action may change only its target state.
  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', false);
  await screenshotStep('折叠Response Headers，保留Request Headers展开 / Collapse Response Headers while leaving Request Headers expanded', {
    highlights: [
      { target: responseHeaders, label: '1' },
      { target: requestHeaders, label: '2' },
    ],
  });

  await requestHeaders.click();
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', true);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('分别折叠两个Headers分组 / Collapse both Headers sections independently', {
    highlights: [
      { target: responseHeaders, label: '1' },
      { target: requestHeaders, label: '2' },
    ],
  });

  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeaders).toHaveAttribute('aria-controls', responseHeadersBodyId!);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(requestHeadersBody).toHaveJSProperty('hidden', true);
  await screenshotStep('重新展开Response Headers，Request Headers仍折叠 / Reopen Response Headers while Request Headers remains collapsed', {
    highlights: [
      { target: responseHeaders, label: '1' },
      { target: requestHeaders, label: '2' },
    ],
  });

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

  // 用户操作与断言：同一响应的Cookies、Timing及Connection分组保持独立。
  // User actions and assertions: Cookies, Timing and Connection remain independent on the same response.
  const sectionBody = async (automationId: string) => {
    const id = await getByAutomationId(page, automationId).getAttribute('aria-controls');
    if (!id) throw new Error(`Response section omitted its controlled content: ${automationId}`);
    return page.locator(`[id="${id}"]`);
  };
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.cookies).click();
  const cookies = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.responseCookies);
  await expect(await sectionBody(AUTOMATION_IDS.composer.responseSection.responseCookies)).toContainText('section-value');
  await expect(await sectionBody(AUTOMATION_IDS.composer.responseSection.responseCookies)).toContainText('e2e_theme');
  await screenshotStep('查看响应的两条Cookie / Inspect both response cookies', {
    highlights: [{ target: cookies, label: '1' }],
  });
  await cookies.click();
  await expect(cookies).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('折叠Cookies分组 / Collapse the Cookies section', {
    highlights: [{ target: cookies, label: '1' }],
  });
  await cookies.click();
  await expect(cookies).toHaveAttribute('aria-expanded', 'true');
  await screenshotStep('查看并折叠展开响应Cookies / Inspect and toggle response Cookies');
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.timing).click();
  const timing = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.timing);
  const connection = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.connection);
  await expect((await sectionBody(AUTOMATION_IDS.composer.responseSection.timing)).locator(':scope > div > div')).toHaveCount(6);
  await expect(await sectionBody(AUTOMATION_IDS.composer.responseSection.connection)).toContainText('127.0.0.1');
  await screenshotStep('查看Timing与Connection / Inspect Timing and Connection', {
    highlights: [
      { target: timing, label: '1' },
      { target: connection, label: '2' },
    ],
  });
  await timing.click();
  await expect(timing).toHaveAttribute('aria-expanded', 'false');
  await expect(connection).toHaveAttribute('aria-expanded', 'true');
  await screenshotStep('折叠Timing，保留Connection展开 / Collapse Timing while leaving Connection expanded', {
    highlights: [
      { target: timing, label: '1' },
      { target: connection, label: '2' },
    ],
  });
  await connection.click();
  await expect(connection).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('折叠Timing与Connection / Collapse Timing and Connection', {
    highlights: [
      { target: timing, label: '1' },
      { target: connection, label: '2' },
    ],
  });
  await timing.click();
  await expect(connection).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('展开Timing，保留Connection折叠 / Expand Timing while leaving Connection collapsed', {
    highlights: [
      { target: timing, label: '1' },
      { target: connection, label: '2' },
    ],
  });
  await connection.click();
  await screenshotStep('独立折叠展开Timing与Connection / Toggle Timing and Connection independently');

  // 正文断言：Tree、Raw和Hex来自同一响应字节，Copy与全屏不能更换数据。
  // Body assertions: Tree, Raw and Hex use the same response bytes; Copy and fullscreen preserve them.
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
  const body = getByAutomationId(page, AUTOMATION_IDS.composer.responseBody);
  const modes = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyMode).locator('..').getByRole('radio');
  const copy = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.copy);
  await screenshotStep('返回同一次响应的Pretty正文 / Return to Pretty for the same response', {
    highlights: [{ target: body, label: '1' }],
  });
  await modes.nth(1).click();
  await screenshotStep('切换JSON Tree视图 / Switch to the JSON Tree view', {
    highlights: [{ target: body, label: '1' }],
  });
  await body.locator('button[aria-expanded="false"]').first().click();
  await expect(body).toContainText('e2e-item');
  await screenshotStep('展开JSON内容并查看items / Expand the JSON contents and inspect items', {
    highlights: [{ target: body, label: '1' }],
  });
  const root = body.locator('button[aria-expanded]').first();
  await root.click();
  await expect(root).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('折叠JSON根节点 / Collapse the JSON root', {
    highlights: [{ target: root, label: '1' }],
  });
  await root.click();
  await expect(root).toHaveAttribute('aria-expanded', 'true');
  await screenshotStep('使用Tree展开与折叠真实JSON / Expand and collapse the actual JSON tree');
  await modes.nth(2).click();
  await screenshotStep('切换Raw查看原始响应文本 / Switch to Raw to inspect the original response text', {
    highlights: [
      { target: body, label: '1' },
      { target: copy, label: '2' },
    ],
  });
  await copy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(responseText);
  await screenshotStep('复制Raw并核对完整原文 / Copy Raw and verify the complete original text');
  await modes.nth(3).click();
  await expect(body).toContainText('00000000');
  await screenshotStep('切换Hex查看响应字节 / Switch to Hex to inspect the response bytes', {
    highlights: [{ target: body, label: '1' }],
  });
  await copy.click();
  const hexadecimal = await page.evaluate(() => navigator.clipboard.readText());
  expect(hexadecimal).toMatch(/^00000000  7b 22/);
  const copiedBytes = hexadecimal.split('\n').flatMap((line) =>
    line.slice(10, 57).trim().split(/\s+/).map((byte) => Number.parseInt(byte, 16)));
  expect(Buffer.from(copiedBytes)).toEqual(Buffer.from(responseText));
  await screenshotStep('复制Hex并核对实际字节 / Copy Hex and verify the actual bytes');
  await copy.locator('..').getByRole('button').last().click();
  const fullscreen = page.getByRole('dialog');
  await expect(fullscreen.getByRole('radio').nth(3)).toHaveAttribute('aria-checked', 'true');
  await expect(fullscreen).toContainText('7b 22 6d 65');
  await screenshotStep('在全屏中保持Hex视图 / Retain the Hex view in fullscreen');
  await fullscreen.locator('header').getByRole('button').last().click();
  await expect(fullscreen).toHaveCount(0);
  await expect(modes.nth(3)).toHaveAttribute('aria-checked', 'true');
  await screenshotStep('退出全屏，保留原Hex视图 / Exit fullscreen while retaining the Hex view', {
    highlights: [{ target: body, label: '1' }],
  });

  // 布局与证据：拖动原响应分栏，保留当前正文；原driver负责正常Close与宿主恢复。
  // Layout and evidence: resize the response pane without replacing its body; the driver verifies normal Close and host restoration.
  const splitter = getByAutomationId(page, AUTOMATION_IDS.composer.splitter);
  const before = await splitter.boundingBox();
  if (!before) throw new Error('The Composer response splitter is not visible.');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 - 80, { steps: 16 });
  await page.mouse.up();
  await expect.poll(async () => (await splitter.boundingBox())?.y).toBeLessThan(before.y - 60);
  await expect(body).toContainText('7b 22 6d 65');
  await screenshotStep('调整响应区高度并保留当前视图 / Resize the response pane while preserving its current view');
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});