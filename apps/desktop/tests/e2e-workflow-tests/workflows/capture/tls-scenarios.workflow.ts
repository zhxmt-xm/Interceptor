import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';

test('capture.scenarios.tls distinguishes opaque tunnels from decrypted H1 and H2 bodies', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.tls' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const evidence: Array<{ scenarioId: string; protocol: string; row: string | null }> = [];
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备与未解密流量：fresh profile只开启Recording，原生TLS握手不得产生伪造HTTP正文。
    // Arrange and opaque traffic: enable only Recording on a fresh profile; a native TLS handshake must not create fake HTTP bodies.
    await startRecording(desktopApp);
    const passthrough = trafficLab.scenarios().find((candidate) => candidate.id === 'tls-passthrough');
    if (!passthrough) throw new Error('Missing TLS passthrough scenario.');
    const tunnelResult = await trafficLab.run(passthrough.id, passthrough.defaultDraft, desktopApp.capturePort());
    expect(tunnelResult).toMatchObject({ state: 'complete', protocol: 'tls', response: { statusCode: 200, bodyBytes: 0 } });
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    expect(tlsTrafficRunner.applicationByteCount()).toBe(0);
    const tunnelRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: 'localhost' });
    await expect(tunnelRow).toHaveCount(1);
    for (const value of ['CONNECT', 'tls']) await expect(tunnelRow).toContainText(value);
    await tunnelRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel).click();
    const inspector = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
    await expect(inspector).toContainText('localhost');
    await expect(inspector).toContainText(String(tlsTrafficRunner.port));
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    evidence.push({ scenarioId: passthrough.id, protocol: 'tls', row: await tunnelRow.getAttribute('data-automation-id') });

    // 打开并取消HTTPS设置，连接示意存在但不得生成CA或改变未解密状态。
    // Open and cancel HTTPS setup; show the route without generating a CA or decrypting traffic.
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.setupHttps).click();
    const setup = page.getByRole('dialog');
    await expect(setup).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.connectionChain)).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.generate)).toBeEnabled();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.install)).toBeDisabled();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting)).toBeDisabled();
    await setup.screenshot({ path: testInfo.outputPath('https-setup-connection-chain.png') });
    await getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel).click();
    await expect(setup).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();

    // 用户操作：在真实Certificates UI生成安装本轮CA并启用MITM，不操作MMC或系统设置后门。
    // User actions: generate/install this CA and enable MITM in Certificates UI without MMC or system-setting backdoors.
    await prepareHttpsCapture(desktopApp);
    for (const expected of [
      { id: 'tls-mitm-h1', protocol: 'h1', alpn: 'http/1.1', mode: 'https-h1', path: '/playground/tls/h1' },
      { id: 'tls-mitm-h2', protocol: 'h2', alpn: 'h2', mode: 'https-h2', path: '/playground/tls/h2' },
    ] as const) {
      await test.step(expected.id, async () => {
        const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
        if (!scenario) throw new Error(`Missing TLS scenario: ${expected.id}`);
        const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
        expect(result).toMatchObject({ state: 'complete', protocol: 'tls', tls: { alpn: expected.alpn },
          response: { statusCode: 200 }, request: { method: 'GET', path: expected.path },
        });

        // 业务断言：选择真正解密的HTTP行，Response显示origin JSON，TLS页保留目标和协议事实。
        // Product assertions: select the decrypted HTTP row, inspect origin JSON in Response, and verify target/protocol facts in TLS.
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: expected.path });
        await expect(row).toHaveCount(1);
        for (const value of ['GET', '200', expected.protocol]) await expect(row).toContainText(value);
        await row.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
        const body = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await expect(body).toContainText(`"mode": "${expected.mode}"`);
        await expect(body).toContainText('"secure": true');
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tls).click();
        for (const value of ['https', 'localhost', String(tlsTrafficRunner.port), 'TLS']) await expect(inspector).toContainText(value);
        evidence.push({ scenarioId: expected.id, protocol: expected.protocol, row: await row.getAttribute('data-automation-id') });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      });
    }

    // 证据：保存三种场景的公开行身份与协议，Renderer必须无错误。
    // Evidence: retain all three public scenario identities/protocols and require zero Renderer errors.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('tls-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：通过UI恢复MITM/源站例外并卸载删除本轮CA，Root集合不变；fixture恢复进程与宿主。
    // Cleanup: restore MITM/origin settings and uninstall/delete this CA through UI, preserve Root stores, and let fixtures restore the host.
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'TLS Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'TLS Capture cleanup failed.');
});