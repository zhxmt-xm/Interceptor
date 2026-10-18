import { createServer } from 'node:http';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer guide uses public localhost examples to verify Basic, Bearer and explicit Header cleanup', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const username = 'guide-user';
  const password = 'public-demo-password';
  const token = 'public-demo-token';
  const basic = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const bearer = `Bearer ${token}`;
  const path = '/guide/composer-auth';
  const observations: Array<string | undefined> = [];
  const origin = createServer((incoming, response) => {
    if (incoming.url !== path) {
      response.writeHead(404);
      response.end();
      return;
    }
    const authorization = incoming.headers.authorization;
    observations.push(authorization);
    const scheme = authorization === basic ? 'basic' : authorization === bearer ? 'bearer' : 'none';
    const status = scheme === 'none' ? 401 : 200;
    response.writeHead(status, {
      'content-type': 'application/json',
      ...(status === 401 ? { 'www-authenticate': 'Basic realm="public-guide-demo"' } : {}),
    });
    response.end(JSON.stringify({ marker: `guide-auth-${observations.length}`, status, scheme }));
  });
  await new Promise<void>((resolve, reject) => {
    origin.once('error', reject);
    origin.listen(0, '127.0.0.1', resolve);
  });
  const address = origin.address();
  if (!address || typeof address === 'string') throw new Error('The owned authentication origin has no TCP port.');
  const url = `http://127.0.0.1:${address.port}${path}`;
  let media: GuidebookMedia | undefined;
  const selectAuth = async (direction: 'ArrowDown' | 'ArrowUp', steps: number): Promise<void> => {
    const combo = getByAutomationId(page, AUTOMATION_IDS.composer.authType).getByRole('combobox');
    await combo.click();
    for (let index = 0; index < steps; index++) await combo.press(direction);
    await combo.press('Enter');
  };
  const send = async (authorization: string | undefined, scheme: 'none' | 'basic' | 'bearer'): Promise<void> => {
    const before = observations.length;
    await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
    await expect.poll(() => observations.length).toBe(before + 1);
    expect(observations[before]).toBe(authorization);
    await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
    const body = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane);
    await expect(body).toContainText(`guide-auth-${before + 1}`);
    await expect(body).toContainText(scheme);
    await expect(body).toContainText(scheme === 'none' ? '401' : '200');
  };
  try {
    // 准备：公开字符串只被本轮127.0.0.1服务接受，不是系统账号、API Key或真实服务凭据。
    // Arrange: public strings are accepted only by this owned loopback service, never system accounts, API keys or real-service credentials.
    media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-auth');
    await media.step('01-composer', '打开Composer / Open Composer', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click(); });
    await media.step('02-new', '新建认证演示请求 / Create an authentication example request', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click(); });
    await media.step('03-url', '填写自有localhost服务地址 / Enter the owned loopback service address', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url); });
    await media.step('04-none', '无认证发送得到401 / Send without authentication and receive 401', async () => { await send(undefined, 'none'); });
    await media.step('05-auth-tab', '打开Auth / Open Auth', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click(); });
    await media.step('06-basic', '选择Basic / Choose Basic', async () => {
      await selectAuth('ArrowDown', 2);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.username)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.password)).toBeVisible();
    });
    await media.step('07-username', '填写公开演示用户名 / Enter the public example username', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.username).fill(username); });
    await media.step('08-password', '填写仅本机有效的演示密码 / Enter the loopback-only example password', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.password).fill(password);
    });
    await media.step('09-basic-result', '发送Basic并核对200 / Send Basic and verify 200', async () => { await send(basic, 'basic'); });
    await media.step('10-bearer', '切换到Bearer / Switch to Bearer', async () => {
      await selectAuth('ArrowUp', 1);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toBeVisible();
    });
    await media.step('11-token', '填写公开演示token / Enter the public example token', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(token); });
    await media.step('12-bearer-result', '发送Bearer并核对200 / Send Bearer and verify 200', async () => { await send(bearer, 'bearer'); });
    await media.step('13-none-again', '切回None / Switch back to None', async () => {
      await selectAuth('ArrowUp', 1);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toHaveCount(0);
    });
    await media.step('14-none-result', '核对自动Authorization已移除 / Verify automatic Authorization was removed', async () => { await send(undefined, 'none'); });
    await media.step('15-headers', '打开Headers添加显式字段 / Open Headers for an explicit field', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click(); });
    await media.step('16-explicit-name', '填写Authorization名称 / Enter the Authorization name', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('Authorization'); });
    await media.step('17-explicit-value', '填写同一公开Bearer值 / Enter the same public Bearer value', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(bearer); });
    await media.step('18-add-header', '添加这条显式Header / Add the explicit Header', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click(); });
    await media.step('19-none-keeps-header', 'None不删除显式Authorization / None does not remove explicit Authorization', async () => { await send(bearer, 'bearer'); });
    await media.step('20-delete-header', '删除自己的显式Authorization行 / Delete the explicit Authorization row', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      const row = page.locator('input[value="Authorization"]').locator('..');
      await row.getByRole('button').click();
      await expect(page.locator('input[value="Authorization"]')).toHaveCount(0);
    });
    await media.step('21-header-removed', '核对请求不再带认证字段 / Verify the request no longer carries authentication', async () => { await send(undefined, 'none'); });
    await media.step('22-clear-basic-type', '返回Basic清理演示输入 / Return to Basic to clear example inputs', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
      await selectAuth('ArrowDown', 2);
    });
    await media.step('23-clear-username', '清空演示用户名 / Clear the example username', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.username).fill(''); });
    await media.step('24-clear-password', '清空演示密码 / Clear the example password', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.password).fill(''); });
    await media.step('25-clear-bearer-type', '返回Bearer / Return to Bearer', async () => { await selectAuth('ArrowUp', 1); });
    await media.step('26-clear-token', '清空演示token / Clear the example token', async () => { await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(''); });
    await media.step('27-finish-none', '最终保持None / Finish with None', async () => { await selectAuth('ArrowUp', 1); });
    await media.step('28-no-capture', '确认Composer没有写入Capture / Verify Composer did not create Capture records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(path);
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)).toHaveCount(0);
    });
    // 证据：服务端真实拒绝/接受，UI与线上Header分别核对，不用空认证控件代替成功。
    // Evidence: actual server rejection/acceptance and wire Headers verify behavior, not empty authentication controls.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (media) await media.stop({
        url, username, password, bearerToken: token,
        scope: 'Public demonstration strings accepted only by this temporary loopback origin; not real credentials',
        responses: 'None 401; Basic 200; Bearer 200; None without explicit Header 401',
        explicitHeader: 'Auth None leaves a user-added Authorization Header until its row is deleted',
      });
    } finally {
      origin.closeAllConnections();
      await new Promise<void>((resolve, reject) => origin.close(error => error ? reject(error) : resolve()));
    }
  }
  // 清理：关闭自有认证服务；driver按正常Close核对App、代理和8888。
  // Cleanup: close the owned authentication service; the driver verifies normal App Close, proxy settings and port 8888.
});
