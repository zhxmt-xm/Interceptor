import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import http2, { type ClientHttp2Stream } from 'node:http2';
import { PassThrough } from 'node:stream';

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
    if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing H2 JSON traffic scenario.');
    const httpDraft = scenario.defaultDraft;

    // 外部流量：复用已有H2客户端，经真实CONNECT及TLS/ALPN访问origin。
    // External traffic: reuse the H2 client through real CONNECT and TLS/ALPN to the origin.
    const result = await trafficLab.run(scenario.id, httpDraft, desktopApp.capturePort());
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
    const originalRowId = await row.getAttribute('data-automation-id');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();

    // 多流Range：同一真实H2连接的两条响应在结束前可见，Clear或单流取消不影响其余传输。
    // Multi-stream ranges: show two in-flight responses on one real H2 connection; Clear and one-stream cancellation leave other traffic intact.
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    for (const action of ['complete', 'clear', 'cancel', 'settings', 'goaway'] as const) {
      await test.step(`h2-ranges-${action}`, async () => {
        const prefixSize = 2 * 1024 * 1024;
        const rangeSize = 6 * 1024 * 1024;
        const requestPrefix = `/e2e/h2/ranges-${action}`;
        const keyword = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter);
        await keyword.fill(requestPrefix);
        const session = await tlsTrafficRunner.openHttp2Session(desktopApp.capturePort());
        const sessionErrors: string[] = [];
        session.on('error', (error) => sessionErrors.push(error.message));
        const sessionStates: Array<{ phase: string; closed: boolean; destroyed: boolean; settings: http2.Settings }> = [];
        const responses = [0, 1].map((index) => {
          const offset = index * rangeSize;
          const requestPath = `${requestPrefix}/${index}`;
          const requestRange = `bytes=${offset}-${offset + rangeSize - 1}`;
          const contentRange = `bytes ${offset}-${offset + rangeSize - 1}/${2 * rangeSize}`;
          const responseBytes = Buffer.alloc(rangeSize, index === 0 ? 0x61 : 0x62);
          const responseStream = new PassThrough();
          const received = { bytes: 0, ended: false, closed: false, hash: createHash('sha256'),
            stream: undefined as ClientHttp2Stream | undefined };
          const completed = tlsTrafficRunner.runHttp2({ ...httpDraft,
            path: requestPath, headers: { ...httpDraft.headers, range: requestRange },
          }, desktopApp.capturePort(), {
            session,
            response: { statusCode: 206, responseBody: responseStream,
              responseHeaders: { 'content-type': 'application/octet-stream', 'content-length': String(rangeSize),
                'accept-ranges': 'bytes', 'content-range': contentRange }, responseTrailers: {} },
            onStream: (stream) => {
              received.stream = stream;
              stream.on('data', (chunk: Buffer) => { received.bytes += chunk.byteLength; received.hash.update(chunk); });
              stream.on('end', () => { received.ended = true; });
              stream.on('close', () => { received.closed = true; });
            },
          });
          responseStream.write(responseBytes.subarray(0, prefixSize));
          const capturedRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
            .filter({ hasText: requestPath });
          return { requestPath, requestRange, contentRange, responseBytes, responseStream, received, completed, capturedRow };
        });
        try {
          await expect.poll(() => responses.map(({ received }) => received.bytes)).toEqual([prefixSize, prefixSize]);
          const beforeAction = [];
          for (const response of responses) {
            const { capturedRow, received, responseStream, requestRange, contentRange } = response;
            await expect(capturedRow).toHaveCount(1);
            for (const value of ['h2', 'GET', '206', '2 MB']) await expect(capturedRow).toContainText(value);
            expect(received.stream?.session).toBe(session);
            expect(received.ended).toBe(false);
            expect(responseStream.writableEnded).toBe(false);
            await capturedRow.click();
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
            for (const [sectionId, values] of [
              [AUTOMATION_IDS.capture.inspector.section.requestHeaders, [requestRange]],
              [AUTOMATION_IDS.capture.inspector.section.responseHeaders, [contentRange, String(rangeSize)]],
            ] as const) {
              const section = getByAutomationId(desktopApp.page, sectionId);
              if (await section.getAttribute('aria-expanded') === 'false') await section.click();
              const bodyId = await section.getAttribute('aria-controls');
              if (!bodyId) throw new Error('H2 Range header section omitted its body identity.');
              for (const value of values) await expect(desktopApp.page.locator(`[id="${bodyId}"]`)).toContainText(value);
            }
            beforeAction.push({ requestPath: response.requestPath, streamId: received.stream?.id,
              rowId: await capturedRow.getAttribute('data-automation-id'), row: await capturedRow.textContent(),
              receivedBytes: received.bytes, clientEnded: received.ended, originEnded: responseStream.writableEnded });
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
          }
          expect(new Set(beforeAction.map((state) => state.streamId)).size).toBe(2);
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-ranges-${action}-inflight.png`) });

          // 用户操作与数据面：Clear从产品按钮发起；客户端控制RST_STREAM、SETTINGS或正常GOAWAY。
          // User action and data plane: click the product Clear button; the client controls RST_STREAM, SETTINGS or graceful GOAWAY.
          if (action === 'clear') {
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.clear).click();
            for (const { capturedRow } of responses) await expect(capturedRow).toHaveCount(0);
          } else if (action === 'cancel') {
            const cancelled = responses[0]!;
            cancelled.received.stream!.close(http2.constants.NGHTTP2_CANCEL);
            await expect.poll(() => cancelled.received.closed).toBe(true);
            await expect.poll(() => cancelled.responseStream.destroyed).toBe(true);
            expect(cancelled.received.stream!.rstCode).toBe(http2.constants.NGHTTP2_CANCEL);
            expect(cancelled.received.bytes).toBe(prefixSize);
          }
          if (action === 'settings') {
            const updatedSettings = { initialWindowSize: 32 * 1024, headerTableSize: 0, maxFrameSize: 32 * 1024 };
            await new Promise<void>((resolve, reject) => {
              session.settings(updatedSettings, (error) => error ? reject(error) : resolve());
            });
            expect(session.localSettings).toMatchObject(updatedSettings);
            expect(responses.every(({ received }) => !received.ended)).toBe(true);
            sessionStates.push({ phase: 'settings-acknowledged', closed: session.closed,
              destroyed: session.destroyed, settings: session.localSettings });
          }
          const sessionClosed = action === 'goaway' ? once(session, 'close') : null;
          if (action === 'goaway') {
            session.close();
            expect(session.closed).toBe(true);
            expect(session.destroyed).toBe(false);
            expect(responses.every(({ received }) => !received.ended)).toBe(true);
            sessionStates.push({ phase: 'goaway-sent', closed: session.closed,
              destroyed: session.destroyed, settings: session.localSettings });
          }
          for (const [index, response] of responses.entries()) {
            if (action !== 'cancel' || index !== 0) response.responseStream.end(response.responseBytes.subarray(prefixSize));
          }
          const executions = await Promise.all(responses.map(({ completed }) => completed));
          const finalStates = [];
          for (const [index, response] of responses.entries()) {
            const cancelled = action === 'cancel' && index === 0;
            const expectedSize = cancelled ? prefixSize : rangeSize;
            const digest = response.received.hash.digest('hex');
            expect(response.received.bytes).toBe(expectedSize);
            expect(digest).toBe(createHash('sha256').update(response.responseBytes.subarray(0, expectedSize)).digest('hex'));
            if (!cancelled) {
              expect(executions[index]).toMatchObject({ state: 'complete', protocol: 'h2', tls: { alpn: 'h2' },
                request: { headers: { range: response.requestRange } },
                response: { statusCode: 206, bodyBytes: rangeSize, headers: { 'content-range': response.contentRange } } });
            }
            if (action === 'clear') {
              await expect(response.capturedRow).toHaveCount(0);
            } else {
              await expect(response.capturedRow).toContainText(cancelled ? '2 MB' : '6 MB');
              await expect(response.capturedRow).not.toContainText('\u00b7\u00b7\u00b7');
              await expect(response.capturedRow).toHaveAttribute('data-automation-id', beforeAction[index]!.rowId!);
            }
            finalStates.push({ requestPath: response.requestPath, receivedBytes: response.received.bytes, digest,
              cancelled, rowCount: await response.capturedRow.count(), clientClosed: response.received.closed });
          }
          if (sessionClosed) {
            await sessionClosed;
            expect(session.destroyed).toBe(true);
            sessionStates.push({ phase: 'session-drained', closed: session.closed,
              destroyed: session.destroyed, settings: session.localSettings });
          }
          if (action === 'clear' || action === 'goaway') {
            const nextPath = `${requestPrefix}/after-${action}`;
            let differentSession = false;
            const next = await tlsTrafficRunner.runHttp2({ ...httpDraft, path: nextPath }, desktopApp.capturePort(), {
              ...(action === 'clear' ? { session } : {}),
              onStream: (stream) => { differentSession = stream.session !== session; },
            });
            expect(next).toMatchObject({ state: 'complete', protocol: 'h2', tls: { alpn: 'h2' } });
            expect(differentSession).toBe(action === 'goaway');
            const nextRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: nextPath });
            await expect(nextRow).toHaveCount(1);
            await expect(nextRow).toContainText('200');
            await expect(nextRow).not.toContainText('\u00b7\u00b7\u00b7');
            if (action === 'clear') {
              for (const { capturedRow } of responses) await expect(capturedRow).toHaveCount(0);
            }
          }
          expect(sessionErrors).toEqual([]);
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-ranges-${action}-final.png`) });
          const evidencePath = testInfo.outputPath(`h2-ranges-${action}.json`);
          await writeFile(evidencePath, JSON.stringify({ action, sameClientSession: true, beforeAction, finalStates, sessionStates }, null, 2), 'utf8');
          await testInfo.attach(`h2-ranges-${action}.json`, { path: evidencePath, contentType: 'application/json' });
        } finally {
          for (const { responseStream } of responses) responseStream.destroy();
          session.destroy();
          await Promise.all(responses.map(({ completed }) => completed));
          await keyword.fill('');
        }
      });
    }

    // 证据：只记录协议与公共行身份，不记录私钥或本机证书路径。
    // Evidence: retain protocol and public row identity, never private keys or local certificate paths.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('http2-scenarios.json', {
      body: Buffer.from(JSON.stringify({ scenarioId: scenario.id, alpn: result.tls?.alpn,
        row: originalRowId, trailers: result.response?.trailers })),
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