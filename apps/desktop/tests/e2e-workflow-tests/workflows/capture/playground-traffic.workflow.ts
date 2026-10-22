import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { chromium, type Browser } from '@playwright/test';

import type { TrafficScenarioResult } from '../../../../../playground/server/scenarios/interfaces';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('capture.playground-traffic sends Browser traffic into real Capture', async ({
  desktopApp,
  playgroundServer,
}, testInfo) => {
  test.setTimeout(150_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.playground-traffic',
  });

  const rootsBefore = await rootCertificateThumbprints();
  const cleanupErrors: unknown[] = [];
  let workflowError: unknown;
  let httpsPrepared = false;
  let browser: Browser | null = null;
  try {
    // 准备：通过产品UI开启真实Recording，再用系统Edge打开完整Playground进程。
    // Arrange: enable real Recording through product UI, then open the full Playground process in system Edge.
    await startRecording(desktopApp);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/playground/h1-json');
    // 截图准备：App只显示各自产场景，侧栏的全量facet通过正常UI折叠。
    // Screenshot preparation: show each owned App scenario and collapse global sidebar facets through normal UI.
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    browser = await chromium.launch({ channel: 'msedge' });
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await browserPage.goto(playgroundServer.url);
    await expect(browserPage.locator('main')).toHaveAttribute('data-section', 'capture');
    await expect(browserPage.locator('[data-scenario-id]')).toHaveCount(41);
    await screenshotStep('准备：通过产品UI开启真实Recording，再用系统Edge打开完整Playground进程。 / Arrange: enable real Recording through product UI, then open the full Playground process in system Edge.');

    // 用户操作：在Playground选择H1 JSON并点击公开Run控件，不直接调用Lab API。
    // User action: select H1 JSON in Playground and click its public Run control without calling the Lab API directly.
    await browserPage.locator('[data-scenario-id="h1-json"]').click();
    await browserPage.locator('[data-playground-action="run"]').click();
    await expect(browserPage.locator('[data-traffic-state="complete"]')).toBeVisible();
    await screenshotStep('用户操作：在Playground选择H1 JSON并点击公开Run控件，不直接调用Lab API。 / User action: select H1 JSON in Playground and click its public Run control without calling the Lab API directly.');

    // 业务断言：真实Capture接收自产H1 exchange，并在Response正文中显示origin JSON。
    // Business assertion: real Capture receives the generated H1 exchange and shows the origin JSON in Response body.
    const captureRows = getByAutomationIdPrefix(
      desktopApp.page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    );
    const h1Row = captureRows.filter({ hasText: '/playground/h1-json' }).last();
    await expect(h1Row).toBeVisible();
    await expect(h1Row).toContainText('h1');
    await h1Row.click();
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.tab.response,
    ).click();
    await expect(getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.bodyPane,
    )).toContainText('ord_42');
    await screenshotStep('业务断言：真实Capture接收自产H1 exchange，并在Response正文中显示origin JSON。 / Business assertion: real Capture receives the generated H1 exchange and shows the origin JSON in Response body.');

    // 用户操作：返回Playground选择WebSocket text场景并再次点击Run。
    // User action: return to Playground, select the WebSocket text scenario, and click Run again.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/playground/ws/text');
    await browserPage.locator('[data-scenario-id="ws-text"]').click();
    await expect(browserPage.locator('[data-traffic-state]')).toHaveCount(0);
    await browserPage.locator('[data-playground-action="run"]').click();
    await expect(browserPage.locator('[data-traffic-state="complete"]')).toBeVisible();
    await screenshotStep('用户操作：返回Playground选择WebSocket text场景并再次点击Run。 / User action: return to Playground, select the WebSocket text scenario, and click Run again.');

    // 业务断言：真实Capture显示自产WebSocket exchange和双向text payload。
    // Business assertion: real Capture shows the generated WebSocket exchange and bidirectional text payload.
    const webSocketRow = captureRows.filter({ hasText: '/playground/ws/text' }).last();
    await expect(webSocketRow).toBeVisible();
    await expect(webSocketRow).toContainText('ws');
    const rowAutomationId = await webSocketRow.getAttribute('data-automation-id');
    if (!rowAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
      throw new Error('Captured WebSocket row has no stable exchange identity.');
    }
    const exchangeId = rowAutomationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
    await webSocketRow.click();
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.tab.messages,
    ).click();
    const frames = getByAutomationIdPrefix(
      desktopApp.page,
      `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`,
    );
    await expect.poll(() => frames.count()).toBeGreaterThanOrEqual(2);
    await expect(frames.filter({ hasText: 'hello from client' })).toHaveCount(2);
    await screenshotStep('业务断言：真实Capture显示自产WebSocket exchange和双向text payload。 / Business assertion: real Capture shows the generated WebSocket exchange and bidirectional text payload.');

    // 准备：经真实产品UI开启HTTPS解密和localhost例外，仍从Playground公开按钮发送流量。
    // Arrange: enable HTTPS decryption and the localhost exception through product UI; traffic still starts at the public Playground button.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
    httpsPrepared = true;
    await prepareHttpsCapture(desktopApp);
    for (const direction of ['client', 'origin'] as const) {
      await test.step(`playground-error-goaway-${direction}`, async () => {
        const scenarioId = `h2-error-goaway-${direction}` as const;
        const requestPath = `/playground/h2/error-goaway-${direction}`;
        const prefixSize = 256 * 1024;
        const expectedHash = createHash('sha256').update(Buffer.alloc(prefixSize, 0x61)).digest('hex');
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);

        // 用户操作：选择场景并Run，读取这次真实HTTP返回值，不直接调用Lab或产品API。
        // User action: select the scenario and Run, observing its real HTTP response without calling Lab or product APIs.
        await browserPage.locator(`[data-scenario-id="${scenarioId}"]`).click();
        await expect(browserPage.locator('[data-traffic-state]')).toHaveCount(0);
        const responsePromise = browserPage.waitForResponse((response) => (
          new URL(response.url()).pathname === '/api/traffic/run' && response.request().method() === 'POST'
        ));
        await browserPage.locator('[data-playground-action="run"]').click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const result: TrafficScenarioResult = await response.json();
        await expect(browserPage.locator('[data-traffic-state="failed"]')).toBeVisible();
        await screenshotStep('用户操作：选择场景并Run，读取这次真实HTTP返回值，不直接调用Lab或产品API。 / User action: select the scenario and Run, observing its real HTTP response without calling Lab or product APIs.');

        // 协议证据：真实接收字节与hash保真，POST不重放，独立连接可以恢复。
        // Protocol evidence: retain actual bytes and hash, do not replay the POST, and recover over a separate connection.
        expect(result).toMatchObject({
          scenarioId, state: 'failed', protocol: 'h2', tls: { alpn: 'h2' },
          request: { method: 'POST', path: requestPath, body: 'single-attempt' },
          response: { statusCode: 200, bodyBytes: prefixSize, headers: { 'content-length': String(prefixSize * 2) } },
        });
        if (!result.response) throw new Error('GOAWAY scenario did not retain its actual partial response.');
        const bodyBytes = Buffer.from(result.response.body, result.response.bodyEncoding);
        expect(bodyBytes.byteLength).toBe(prefixSize);
        expect(createHash('sha256').update(bodyBytes).digest('hex')).toBe(expectedHash);
        const goaway = result.events?.find((event) => event.type === 'goaway');
        const recovery = result.events?.find((event) => event.type === 'recovery');
        expect(goaway).toMatchObject({
          sent: true, errorCode: 2,
          direction: direction === 'client' ? 'client-to-server' : 'server-to-client',
          receivedBodyBytes: prefixSize, declaredBodyBytes: prefixSize * 2,
          receivedBodySha256: expectedHash, originRequestCount: 1,
        });
        expect(recovery).toMatchObject({
          state: 'complete', originRequestCount: 1, differentOriginSession: true,
          request: { method: 'GET', path: `${requestPath}/recovered` }, response: { statusCode: 200 },
        });
        const protocolEvidence = browserPage.locator('[data-response-detail] pre').first();
        await expect(protocolEvidence).toContainText(expectedHash);
        await expect(protocolEvidence).toContainText('"differentOriginSession": true');
        await screenshotStep('协议证据：真实接收字节与hash保真，POST不重放，独立连接可以恢复。 / Protocol evidence: retain actual bytes and hash, do not replay the POST, and recover over a separate connection.');

        // 业务断言：原Capture行在收尾后保留200与256 KiB，实际Headers和正文可读，恢复请求另有一行。
        // Product assertions: keep the original 200/256 KiB Capture row with readable headers/body and a separate recovery row.
        const interruptedRow = captureRows.filter({ hasText: requestPath }).filter({ hasText: 'POST' });
        await expect(interruptedRow).toHaveCount(1);
        const rowId = await interruptedRow.getAttribute('data-automation-id');
        for (const value of ['h2', '200', '256 KB']) await expect(interruptedRow).toContainText(value);
        await expect(interruptedRow).not.toContainText('\u00b7\u00b7\u00b7');
        await interruptedRow.click();
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
        const responseHeaders = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.responseHeaders);
        if (await responseHeaders.getAttribute('aria-expanded') === 'false') await responseHeaders.click();
        const headersBodyId = await responseHeaders.getAttribute('aria-controls');
        if (!headersBodyId) throw new Error('Response headers have no public content identity.');
        await expect(desktopApp.page.locator(`[id="${headersBodyId}"]`)).toContainText(String(prefixSize * 2));
        await screenshotStep(`${scenarioId}在Headers核对声明的512KiB / Inspect the declared 512 KiB in Headers for ${scenarioId}`, {
          highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers), label: '1' }],
        });
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane))
          .toContainText('a'.repeat(64));
        await expect(interruptedRow).toHaveAttribute('data-automation-id', rowId!);
        const recoveryRow = captureRows.filter({ hasText: `${requestPath}/recovered` });
        await expect(recoveryRow).toHaveCount(1);
        for (const value of ['h2', 'GET', '200']) await expect(recoveryRow).toContainText(value);
        await screenshotStep(`${scenarioId}查看原POST实际捕获的256KiB部分正文 / Inspect the original POST's captured 256 KiB partial body for ${scenarioId}`, {
          highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default), label: '1' }],
        });

        // 证据：保存可人工核对的Browser与产品截图，以及原始协议结果。
        // Evidence: save the Browser/product screenshots and raw protocol result for manual comparison.
        await browserPage.screenshot({ path: testInfo.outputPath(`${scenarioId}-playground.png`) });
        await desktopApp.page.screenshot({ path: testInfo.outputPath(`${scenarioId}-capture.png`) });
        const evidencePath = testInfo.outputPath(`${scenarioId}.json`);
        await writeFile(evidencePath, JSON.stringify(result, null, 2), 'utf8');
        await testInfo.attach(`${scenarioId}.json`, { path: evidencePath, contentType: 'application/json' });
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
        await screenshotStep('证据：保存可人工核对的Browser与产品截图，以及原始协议结果。 / Evidence: save the Browser/product screenshots and raw protocol result for manual comparison.');
      });
    }
    await screenshotStep('准备：经真实产品UI开启HTTPS解密和localhost例外，仍从Playground公开按钮发送流量。 / Arrange: enable HTTPS decryption and the localhost exception through product UI; traffic still starts at the public Playground button.');

    // Evidence：保存真实Browser页面、Renderer状态和无page error事实。
    // Evidence: retain the real Browser page, Renderer state, and zero-page-error fact.
    await testInfo.attach('playground-browser-final', {
      body: await browserPage.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：经产品UI恢复本轮HTTPS配置和Root基线；关闭Edge，fixture验证Playground/Main/Core/8888及宿主恢复。
    // Cleanup: restore HTTPS settings and Root stores through product UI, close Edge, and let fixtures verify all processes, ports, and host state.
    if (httpsPrepared) await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
    await browser?.close().catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Playground Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Playground Capture cleanup failed.');
});
