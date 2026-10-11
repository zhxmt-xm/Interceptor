import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Browser } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints, sharedCertificateDirectory } from '../../fixtures/ui/https-capture';

test('capture.scenarios.tls distinguishes opaque tunnels from decrypted H1 and H2 bodies', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  desktopApp.preserveUserDataOnFailure();
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.tls' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const evidence: Array<{ scenarioId: string; protocol: string; row: string | null }> = [];
  let browser: Browser | null = null;
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

    // 打开并取消HTTPS设置：共享CA已就绪，取消不改变未解密状态。
    // Open and cancel HTTPS setup: the shared CA is ready, but cancellation must preserve opaque traffic.
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.setupHttps).click();
    const setup = page.getByRole('dialog');
    await expect(setup).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.connectionChain)).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.generate)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.install)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting)).toBeEnabled();
    await setup.screenshot({ path: testInfo.outputPath('https-setup-connection-chain.png') });
    await getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel).click();
    await expect(setup).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();

    // 用户操作：复用共享CA，经真实Certificates UI启用MITM，不重复生成或安装。
    // User actions: reuse the shared CA and enable MITM through Certificates UI without regenerating or installing it.
    await prepareHttpsCapture(desktopApp);
    for (const expected of [
      { id: 'tls-mitm-h1', protocol: 'h1', alpn: 'http/1.1', mode: 'https-h1', path: '/playground/tls/h1' },
      { id: 'tls-mitm-h2', protocol: 'h2', alpn: 'h2', mode: 'https-h2', path: '/playground/tls/h2' },
    ] as const) {
      await test.step(expected.id, async () => {
        const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
        if (!scenario) throw new Error(`Missing TLS scenario: ${expected.id}`);
        const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
        await testInfo.attach(`${expected.id}-transport.json`, {
          body: Buffer.from(JSON.stringify(result)), contentType: 'application/json',
        });
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

    // 浏览器信任：使用系统Edge默认HTTPS校验，不指定CA或忽略证书错误。
    // Browser trust: use system Edge's default HTTPS validation without a supplied CA or ignored certificate errors.
    browser = await chromium.launch({
      channel: 'msedge', headless: true,
      proxy: { server: `http://127.0.0.1:${desktopApp.capturePort()}`, bypass: '<-loopback>' },
    });
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: false });
    await test.step('browser-system-trust', async () => {
      const browserPage = await browserContext.newPage();
      const browserSession = await browserContext.newCDPSession(browserPage);
      const securityStates: Array<{ securityState: string; certificateSecurityState?: { certificate: string[]; certificateNetworkError?: string } }> = [];
      browserSession.on('Security.visibleSecurityStateChanged', ({ visibleSecurityState }) => securityStates.push(visibleSecurityState));
      await browserSession.send('Security.enable');
      try {
        const response = await browserPage.goto(`https://localhost:${tlsTrafficRunner.port}/playground/tls/browser-trust`, {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
        expect(response?.status()).toBe(200);
        await expect(browserPage.locator('body')).toHaveText('Interceptor TLS browser trust');
        await expect.poll(() => securityStates.at(-1)?.securityState).toBe('secure');
        const encodedLeaf = securityStates.at(-1)?.certificateSecurityState?.certificate[0];
        expect(encodedLeaf).toBeDefined();
        const leaf = new X509Certificate(Buffer.from(encodedLeaf!, 'base64'));
        const root = new X509Certificate(await readFile(path.join(sharedCertificateDirectory(), 'root-cert.pem')));
        expect(leaf.checkHost('localhost')).toBe('localhost');
        expect(leaf.verify(root.publicKey), 'Browser leaf must be signed by the current shared CA').toBe(true);
        await testInfo.attach('browser-certificate.json', {
          body: Buffer.from(JSON.stringify({ leafFingerprint: leaf.fingerprint256, rootFingerprint: root.fingerprint256,
            issuer: leaf.issuer, subject: leaf.subject, securityDetails: await response!.securityDetails() })),
          contentType: 'application/json',
        });
      } catch (error) {
        try {
          const { tableNames } = await browserSession.send('Network.getCertificate', {
            origin: `https://localhost:${tlsTrafficRunner.port}`,
          });
          const root = new X509Certificate(await readFile(path.join(sharedCertificateDirectory(), 'root-cert.pem')));
          await testInfo.attach('browser-failed-certificate-chain.json', {
            body: Buffer.from(JSON.stringify({
              rootFingerprint: root.fingerprint256,
              certificates: tableNames.map((encoded: string) => {
                const certificate = new X509Certificate(Buffer.from(encoded, 'base64'));
                return {
                  fingerprint: certificate.fingerprint256, subject: certificate.subject, issuer: certificate.issuer,
                  signedBySharedCa: certificate.verify(root.publicKey),
                };
              }),
            })),
            contentType: 'application/json',
          });
        } catch (evidenceError) {
          await testInfo.attach('browser-certificate-evidence-error.json', {
            body: Buffer.from(JSON.stringify({ message: evidenceError instanceof Error ? evidenceError.message : String(evidenceError) })),
            contentType: 'application/json',
          });
        }
        await testInfo.attach('browser-trust-error.json', {
          body: Buffer.from(JSON.stringify({ message: error instanceof Error ? error.message : String(error) })),
          contentType: 'application/json',
        });
        throw error;
      } finally {
        await testInfo.attach('browser-security-state.json', {
          body: Buffer.from(JSON.stringify(securityStates)), contentType: 'application/json',
        });
      }
    });

    // 证据：保存三种场景的公开行身份与协议，Renderer必须无错误。
    // Evidence: retain all three public scenario identities/protocols and require zero Renderer errors.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('tls-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：通过UI恢复MITM/源站例外，保留共享CA和Root集合；fixture恢复进程与宿主。
    // Cleanup: restore MITM/origin settings, preserve the shared CA and Root stores, and let fixtures restore the host.
    await browser?.close().catch((error: unknown) => cleanupErrors.push(error));
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'TLS Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'TLS Capture cleanup failed.');
});