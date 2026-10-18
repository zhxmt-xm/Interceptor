import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cleanHttpsCapture, sharedCertificateThumbprint } from '../../fixtures/ui/https-capture';

test('TLS guide records opaque tunnels, exact-host passthrough and restored decryption', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
  const host = 'localhost';
  const filter = host;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const tunnels = rows.filter({ hasText: 'CONNECT' });
  const requests = rows.filter({ hasText: '/playground/tls/h1' });
  const pattern = getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(host));
  const certificates = AUTOMATION_IDS.settings.certificates;
  const certificateBefore = await sharedCertificateThumbprint();
  let tlsTouched = false;
  let passthroughTouched = false;
  const openCapture = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  };
  const openSettings = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  };
  const run = async (id: 'tls-passthrough' | 'tls-mitm-h1'): Promise<void> => {
    const scenario = trafficLab.scenarios().find(candidate => candidate.id === id);
    if (!scenario) throw new Error(`Missing owned TLS scenario: ${id}`);
    const result = await trafficLab.run(id, scenario.defaultDraft, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', protocol: 'tls', response: { statusCode: 200 } });
    await testInfo.attach(`${id}-transport`, { body: JSON.stringify(result), contentType: 'application/json' });
  };

  // 准备：搜索只匹配Host/Path；筛选localhost后在Tunnel详情核对本轮端口。
  // Arrange: search matches Host/Path only; filter localhost and verify the owned port in Tunnel details.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(filter);
  await expect(rows).toHaveCount(0);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-tls-passthrough');
  try {
    // 用户操作：未解密隧道与已有CA下的HTTP正文分别取得实际画面。
    // User actions: capture opaque tunnels and decrypted HTTP bodies using the existing CA.
    await media.step('01-filter', '按 localhost 筛选 / Filter by localhost', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(filter);
    });
    await media.step('02-record', '开启 Recording / Start Recording', async () => { await startRecording(desktopApp); });
    await media.step('03-opaque-request', '建立未解密 TLS 连接 / Establish an opaque TLS connection', async () => {
      await run('tls-passthrough');
      await expect(tunnels).toHaveCount(1);
    });
    await media.step('04-tunnel-select', '选择 CONNECT 隧道 / Select the CONNECT tunnel', async () => { await tunnels.last().click(); });
    await media.step('05-tunnel', '查看 Tunnel 而非 HTTP 正文 / Inspect Tunnel rather than an HTTP body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toContainText(String(tlsTrafficRunner.port));
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response)).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    });
    await media.step('06-https-setup', '从 Tunnel 打开 HTTPS Setup / Open HTTPS Setup from Tunnel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.setupHttps).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting)).toBeEnabled();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.generate)).toHaveCount(0);
    });
    await media.step('07-cancel-setup', '取消且保持未解密 / Cancel without enabling decryption', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
    await media.step('08-settings', '打开 Settings / Open Settings', openSettings);
    await media.step('09-certificates', '检查已有受信任 CA / Inspect the existing trusted CA', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      await expect(getByAutomationId(page, certificates.uninstall)).toBeVisible();
      await expect(getByAutomationId(page, certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('10-origin-host', '填写自有源站 localhost / Enter the owned origin localhost', async () => {
      await getByAutomationId(page, certificates.insecureHostInput).fill(host);
    });
    await media.step('11-origin-add', '仅添加本轮源站例外 / Add only this run’s origin exception', async () => {
      tlsTouched = true;
      await getByAutomationId(page, certificates.insecureHostAdd).click();
      await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(host))).toBeVisible();
    });
    await media.step('12-mitm-on', '开启 HTTPS 解密 / Enable HTTPS decryption', async () => {
      await getByAutomationId(page, certificates.mitmToggle).click();
      await expect(getByAutomationId(page, certificates.mitmToggle)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('13-capture-decrypted', '返回 Capture / Return to Capture', openCapture);
    await media.step('14-decrypted-request', '用新连接请求 HTTPS / Request HTTPS over a new connection', async () => {
      await run('tls-mitm-h1');
      await expect(requests).toHaveCount(1);
    });
    await media.step('15-decrypted-select', '选择解密后的 GET / Select the decrypted GET', async () => { await requests.last().click(); });
    await media.step('16-decrypted-body', '读取真实 HTTPS 正文 / Read the actual HTTPS body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('https-h1');
    });

    // 用户操作：添加精确透传项，新连接不解密；从Tunnel定位并删除该项。
    // User actions: add an exact passthrough entry, then locate and remove it from the new opaque Tunnel.
    await media.step('17-settings-passthrough', '返回 Settings / Return to Settings', openSettings);
    await media.step('18-passthrough', '打开 TLS passthrough / Open TLS passthrough', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
      await expect(pattern).toHaveCount(0);
    });
    await media.step('19-host', '填写精确主机 localhost / Enter the exact host localhost', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput).fill(host);
    });
    await media.step('20-add', '添加并保存透传条目 / Add and save the passthrough entry', async () => {
      passthroughTouched = true;
      await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.addHost).click();
      await expect(pattern).toBeVisible();
    });
    await media.step('21-capture-passthrough', '返回 Capture 检查新连接 / Return to Capture to inspect a new connection', openCapture);
    await media.step('22-passthrough-request', '重新建立同一源站 HTTPS 连接 / Reconnect to the same HTTPS origin', async () => {
      await run('tls-mitm-h1');
      await expect(tunnels).toHaveCount(2);
      await expect(requests).toHaveCount(1);
    });
    await media.step('23-passthrough-select', '选择新增 CONNECT / Select the new CONNECT tunnel', async () => { await tunnels.last().click(); });
    await media.step('24-passthrough-tunnel', '核对命中 TLS passthrough / Verify the TLS passthrough match', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response)).toHaveCount(0);
    });
    await media.step('25-locate', '从 Tunnel 定位实际名单条目 / Locate the actual entry from Tunnel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern).click();
      await expect(pattern).toHaveAttribute('data-highlighted', 'true');
    });
    await media.step('26-remove', '删除本轮 localhost 透传项 / Remove this run’s localhost passthrough entry', async () => {
      await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(host)).click();
      await expect(pattern).toHaveCount(0);
    });
    await media.step('27-capture-restored', '返回 Capture 检查恢复 / Return to Capture to inspect restoration', openCapture);
    await media.step('28-reconnect', '再次用新连接请求 HTTPS / Request HTTPS over another new connection', async () => {
      await run('tls-mitm-h1');
      await expect(requests).toHaveCount(2);
      await expect(tunnels).toHaveCount(2);
    });
    await media.step('29-restored-select', '选择恢复解密的 GET / Select the newly decrypted GET', async () => { await requests.last().click(); });
    await media.step('30-restored-body', '核对 HTTP 正文恢复 / Verify the HTTP body is visible again', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('https-h1');
    });
    await media.step('31-cleanup-settings', '返回 Settings 清理本轮配置 / Return to Settings to restore this run’s configuration', openSettings);
    await media.step('32-cleanup-certificates', '打开 Certificates / Open Certificates', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    });
    await media.step('33-mitm-off', '关闭本轮解密 / Disable this run’s decryption', async () => {
      await getByAutomationId(page, certificates.mitmToggle).click();
      await expect(getByAutomationId(page, certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('34-origin-remove', '移除自有源站例外 / Remove the owned origin exception', async () => {
      await getByAutomationId(page, AutomationIdFactory.insecureHostRemove(host)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(host))).toHaveCount(0);
    });
    // 证据：新连接分别产生Tunnel或HTTP行，日常CA与语言不变。
    // Evidence: new connections produce Tunnel or HTTP rows; the daily CA and language stay unchanged.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (passthroughTouched) {
        await openSettings();
        await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
        if (await pattern.isVisible()) await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(host)).click();
        await expect(pattern).toHaveCount(0);
      }
      if (tlsTouched) await cleanHttpsCapture(desktopApp);
      expect(await sharedCertificateThumbprint()).toBe(certificateBefore);
    } finally {
      await media.stop({
        host, filter, url: `https://${host}:${tlsTrafficRunner.port}/playground/tls/h1`,
        originPort: String(tlsTrafficRunner.port),
        originException: 'localhost (owned self-signed test origin; removed after recording)',
        passthrough: 'localhost (exact host; removed before reconnecting)',
        certificateScope: 'existing trusted CA; no generation, install, uninstall or deletion',
      });
    }
  }
  // 清理：正式Close及宿主guard核对原代理、CA信任、全部进程和8888。
  // Cleanup: normal Close and the host guard verify original proxy/CA trust, all processes and port 8888.
});
