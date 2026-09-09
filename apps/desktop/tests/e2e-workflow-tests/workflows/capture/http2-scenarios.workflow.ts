import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';

test('capture.scenarios.http2 captures decrypted H2 headers trailers and body', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.http2' });
  const rootsBefore = await rootCertificateThumbprints();
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：真实Certificates UI生成、安装本轮CA并开启解密，origin仅为localhost例外。
    // Arrange: generate and install this CA and enable decryption through Certificates UI with only a localhost origin exception.
    await prepareHttpsCapture(desktopApp);
    await startRecording(desktopApp);
    const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'h2-json');
    if (!scenario) throw new Error('Missing H2 JSON traffic scenario.');

    // 外部流量：复用已有H2客户端，经真实CONNECT及TLS/ALPN访问origin。
    // External traffic: reuse the H2 client through real CONNECT and TLS/ALPN to the origin.
    const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'complete', protocol: 'h2', tls: { alpn: 'h2' },
      request: { method: 'GET', path: '/playground/h2-json' },
      response: { statusCode: 200, trailers: { 'x-playground-trailer': 'h2-complete' } },
    });

    // 业务断言：同一Capture行正确显示H2，真实Headers与trailer保留线上协议值。
    // Product assertions: the Capture row shows H2 and its actual Headers and trailer retain the wire values.
    const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: '/playground/h2-json' });
    await expect(row).toHaveCount(1);
    for (const value of ['h2', 'GET', '200']) await expect(row).toContainText(value);
    await row.click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    for (const [sectionId, values] of [
      [AUTOMATION_IDS.capture.inspector.section.requestHeaders, ['accept', 'application/json']],
      [AUTOMATION_IDS.capture.inspector.section.responseHeaders, ['content-type', 'application/json']],
      [AUTOMATION_IDS.capture.inspector.section.responseTrailers, ['x-playground-trailer', 'h2-complete']],
    ] as const) {
      const section = getByAutomationId(desktopApp.page, sectionId);
      if (await section.getAttribute('aria-expanded') === 'false') await section.click();
      const bodyId = await section.getAttribute('aria-controls');
      if (!bodyId) throw new Error(`Missing section body: ${sectionId}`);
      for (const value of values) await expect(desktopApp.page.locator(`[id="${bodyId}"]`)).toContainText(value);
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
    const body = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(body).toContainText('"protocol": "h2"');
    await expect(body).toContainText('"path": "/playground/h2-json"');

    // 证据：只记录协议与公共行身份，不记录私钥或本机证书路径。
    // Evidence: retain protocol and public row identity, never private keys or local certificate paths.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('http2-scenarios.json', {
      body: Buffer.from(JSON.stringify({ scenarioId: scenario.id, alpn: result.tls?.alpn,
        row: await row.getAttribute('data-automation-id'), trailers: result.response?.trailers })),
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：经真实UI停用解密、卸载删除本轮CA并比较Root集合，fixture验证进程及宿主恢复。
    // Cleanup: disable decryption and uninstall/delete this CA through UI, compare Root stores, and let fixtures verify host restoration.
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'H2 Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'H2 Capture cleanup failed.');
});