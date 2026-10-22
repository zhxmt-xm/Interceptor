import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import http2, { type ClientHttp2Stream } from 'node:http2';
import { PassThrough } from 'node:stream';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
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
    // 准备：复用受信任共享CA，经Certificates UI开启解密，origin仅为localhost例外。
    // Arrange: reuse the trusted shared CA and enable decryption through Certificates UI with only a localhost origin exception.
    await prepareHttpsCapture(desktopApp);
    await startRecording(desktopApp);
    const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'h2-json');
    if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing H2 JSON traffic scenario.');
    const httpDraft = scenario.defaultDraft;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(httpDraft.path);
    // 截图准备：保持分栏尺寸，只正常收起与协议详情无关的全量facet。
    // Screenshot preparation: preserve pane sizes and normally collapse global facets unrelated to protocol details.
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

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
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.tlsCompatibility.hostList)).toBeHidden();
    await screenshotStep('选择/playground/h2-json并核对H2 / Select /playground/h2-json and inspect H2', {
      highlights: [{ target: row, label: '1' }],
    });
    const protocolToggle = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetToggle('protocol'));
    const http2Option = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetOption('protocol', 'HTTP/2'));
    await protocolToggle.click();
    await expect(http2Option).toBeVisible();
    await screenshotStep('展开Protocol分组 / Expand the Protocol group', {
      highlights: [{ target: protocolToggle, label: '1' }],
    });
    await http2Option.click();
    await expect(http2Option).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toBeVisible();
    await screenshotStep('选择HTTP/2并保留同一请求 / Select HTTP/2 and retain the same request', {
      highlights: [{ target: http2Option, label: '1' }],
    });
    await http2Option.click();
    await expect(http2Option).toHaveAttribute('aria-pressed', 'false');
    await expect(row).toBeVisible();
    await screenshotStep('取消HTTP/2筛选，不删除请求 / Deselect HTTP/2 without deleting the request', {
      highlights: [{ target: http2Option, label: '1' }],
    });
    await protocolToggle.click();
    await expect(protocolToggle).toHaveAttribute('aria-expanded', 'false');
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
      const sectionBody = desktopApp.page.locator(`[id="${bodyId}"]`);
      for (const value of values) await expect(sectionBody).toContainText(value);
      await section.scrollIntoViewIfNeeded();
      await sectionBody.scrollIntoViewIfNeeded();
      await expect(section).toBeInViewport({ ratio: 1 });
      await expect(sectionBody).toBeInViewport({ ratio: 1 });
      await screenshotStep(`H2查看${sectionId} / Inspect H2 ${sectionId}`, {
        highlights: [{ target: section, label: '1' }],
      });
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
    const body = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(body).toContainText('"protocol": "h2"');
    await expect(body).toContainText('"path": "/playground/h2-json"');
    const originalRowId = await row.getAttribute('data-automation-id');
    await screenshotStep('H2 Response选择Raw并核对JSON / Select Raw and inspect the H2 JSON response', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw), label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();

    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();

    // 单流过程：同一GET先收到两段，再结束；完整Copy不能由另一请求或预览片段代替。
    // Single-stream progress: receive two parts of the same GET before ending; verify its complete Copy rather than another request or a preview.
    {
      const requestPath = '/e2e/h2/body-progress';
      const partSize = 64 * 1024;
      const responseBytes = Buffer.concat([Buffer.alloc(partSize, 0x61), Buffer.alloc(partSize, 0x62)]);
      const responseStream = new PassThrough();
      const session = await tlsTrafficRunner.openHttp2Session(desktopApp.capturePort());
      const sessionErrors: string[] = [];
      session.on('error', error => sessionErrors.push(error.message));
      const received = { bytes: 0, ended: false };
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
      const completed = tlsTrafficRunner.runHttp2({ ...httpDraft, path: requestPath }, desktopApp.capturePort(), {
        session,
        response: {
          statusCode: 200,
          responseBody: responseStream,
          responseHeaders: { 'content-type': 'text/plain; charset=utf-8', 'content-length': String(responseBytes.length) },
          responseTrailers: { 'x-capture-end': 'complete' },
        },
        onStream: stream => {
          stream.on('data', (chunk: Buffer) => { received.bytes += chunk.byteLength; });
          stream.on('end', () => { received.ended = true; });
        },
      });
      try {
        responseStream.write(responseBytes.subarray(0, partSize));
        await expect.poll(() => received.bytes).toBe(partSize);
        const progressRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: requestPath });
        await expect(progressRow).toHaveCount(1);
        await expect(progressRow).toContainText('64 KB');
        const progressRowId = await progressRow.getAttribute('data-automation-id');
        await progressRow.click();
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        expect(received.ended).toBe(false);
        await screenshotStep('同一H2响应先收到64KiB，尚未结束 / The same H2 response has received 64 KiB without ending', {
          highlights: [{ target: progressRow, label: '1' }],
        });
        responseStream.write(responseBytes.subarray(partSize));
        await expect.poll(() => received.bytes).toBe(responseBytes.length);
        await expect(progressRow).toContainText('128 KB');
        expect(received.ended).toBe(false);
        await screenshotStep('第二段到达128KiB，响应仍未结束 / The second part reaches 128 KiB before the response ends', {
          highlights: [{ target: progressRow, label: '1' }],
        });
        responseStream.end();
        const execution = await completed;
        expect(execution).toMatchObject({
          state: 'complete',
          response: { statusCode: 200, bodyBytes: responseBytes.length, trailers: { 'x-capture-end': 'complete' } },
        });
        expect(received.ended).toBe(true);
        expect(sessionErrors).toEqual([]);
        await expect(progressRow).toHaveAttribute('data-automation-id', progressRowId!);
        await expect(progressRow).not.toContainText('\u00b7\u00b7\u00b7');
        const textMode = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default);
        await textMode.click();
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('a'.repeat(64));
        await screenshotStep('H2响应结束后读取完整Text正文 / Read the completed H2 response in Text', {
          highlights: [{ target: textMode, label: '1' }],
        });
        const copy = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
        await copy.click();
        await expect.poll(() => desktopApp.page.evaluate(async () => {
          const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
          return {
            length: text.length,
            sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
          };
        })).toEqual({ length: responseBytes.length, sha256: createHash('sha256').update(responseBytes).digest('hex') });
        await screenshotStep('Copy复制同一H2响应的完整128KiB / Copy all 128 KiB of the same H2 response', {
          highlights: [{ target: copy, label: '1' }],
        });
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
        const trailers = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.responseTrailers);
        if (await trailers.getAttribute('aria-expanded') === 'false') await trailers.click();
        const trailerBodyId = await trailers.getAttribute('aria-controls');
        if (!trailerBodyId) throw new Error('Missing progress response trailers.');
        const trailerBody = desktopApp.page.locator(`[id="${trailerBodyId}"]`);
        await expect(trailerBody).toContainText('x-capture-end');
        await expect(trailerBody).toContainText('complete');
        await trailerBody.scrollIntoViewIfNeeded();
        await expect(trailers).toBeInViewport({ ratio: 1 });
        await expect(trailerBody).toBeInViewport({ ratio: 1 });
        await screenshotStep('检查同一H2响应结束后的trailer / Inspect the trailer after the same H2 response ends', {
          highlights: [{ target: trailers, label: '1' }],
        });
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
      } finally {
        responseStream.destroy();
        session.destroy();
        await completed;
      }
    }

    // 多流Range：同一真实H2连接的两条响应在结束前可见，Clear或单流取消不影响其余传输。
    // Multi-stream ranges: show two in-flight responses on one real H2 connection; Clear and one-stream cancellation leave other traffic intact.
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
            await screenshotStep(`${response.requestPath}接收中查看Range Headers / Inspect Range Headers while receiving ${response.requestPath}`, {
              highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers), label: '1' }],
            });
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
          }
          expect(new Set(beforeAction.map((state) => state.streamId)).size).toBe(2);
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-ranges-${action}-inflight.png`) });
          await screenshotStep(`H2 ranges-${action}两条响应各接收2MiB / Both H2 ranges-${action} responses have received 2 MiB`, {
            highlights: [{ target: responses[0]!.capturedRow, label: '1' }],
          });

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
          await screenshotStep(`H2 ranges-${action}核对最终记录状态 / Inspect the final H2 ranges-${action} records`, {
            highlights: [{ target: action === 'clear'
              ? getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.clear)
              : responses[1]!.capturedRow, label: '1' }],
          });
          const evidencePath = testInfo.outputPath(`h2-ranges-${action}.json`);
          await writeFile(evidencePath, JSON.stringify({ action, sameClientSession: true, beforeAction, finalStates, sessionStates }, null, 2), 'utf8');
          await testInfo.attach(`h2-ranges-${action}.json`, { path: evidencePath, contentType: 'application/json' });
          await screenshotStep('用户操作与数据面：Clear从产品按钮发起；客户端控制RST_STREAM、SETTINGS或正常GOAWAY。 / User action and data plane: click the product Clear button; the client controls RST_STREAM, SETTINGS or graceful GOAWAY.');
        } finally {
          for (const { responseStream } of responses) responseStream.destroy();
          session.destroy();
          await Promise.all(responses.map(({ completed }) => completed));
          await keyword.fill('/e2e/h2/');
        }
      });
    }

    // 错误GOAWAY：两端分别关闭实际H2连接，已到达的POST响应保留部分正文且不重放。
    // Error GOAWAY: close each direction's real H2 session and preserve the partial POST response without replay.
    for (const direction of ['origin', 'client'] as const) {
      await test.step(`h2-error-goaway-${direction}`, async () => {
        const prefixSize = 256 * 1024;
        const requestPrefix = `/e2e/h2/error-goaway-${direction}`;
        const requestPath = `${requestPrefix}/interrupted`;
        const nextPath = `${requestPrefix}/recovered`;
        const responseBytes = Buffer.alloc(prefixSize, 0x61);
        const responseStream = new PassThrough();
        const keyword = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter);
        await keyword.fill(requestPrefix);
        const session = await tlsTrafficRunner.openHttp2Session(desktopApp.capturePort());
        const sessionErrors: string[] = [];
        session.on('error', (error) => sessionErrors.push(error.message));
        const sourceErrors: string[] = [];
        const sourceStreams: http2.ServerHttp2Stream[] = [];
        const sourceSessions: http2.Http2Session[] = [];
        const received = { bytes: 0, ended: false, closed: false, errors: [] as string[],
          hash: createHash('sha256'), stream: undefined as ClientHttp2Stream | undefined };
        const completed = tlsTrafficRunner.runHttp2({ ...httpDraft, method: 'POST', path: requestPath,
          body: 'single-attempt', headers: { 'content-type': 'text/plain' },
        }, desktopApp.capturePort(), {
          session,
          response: { statusCode: 200, responseBody: responseStream,
            responseHeaders: { 'content-type': 'application/octet-stream', 'content-length': String(prefixSize * 2) },
            responseTrailers: {} },
          onStream: (stream) => {
            received.stream = stream;
            stream.on('data', (chunk: Buffer) => {
              received.bytes += chunk.byteLength;
              received.hash.update(chunk);
              if (direction === 'client' && received.bytes === prefixSize) {
                session.goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
              }
            });
            stream.on('end', () => { received.ended = true; });
            stream.on('close', () => { received.closed = true; });
            stream.on('error', (error) => received.errors.push(error.message));
          },
          onOriginStream: (stream) => {
            sourceStreams.push(stream);
            sourceSessions.push(stream.session!);
            stream.on('error', (error) => sourceErrors.push(error.message));
            stream.session!.on('error', (error) => sourceErrors.push(error.message));
          },
        });
        const capturedRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: requestPath });
        try {
          await expect(capturedRow).toHaveCount(1);
          for (const value of ['h2', 'POST', '200']) await expect(capturedRow).toContainText(value);
          expect(sourceStreams).toHaveLength(1);
          expect(received.ended).toBe(false);
          expect(responseStream.writableEnded).toBe(false);
          const rowId = await capturedRow.getAttribute('data-automation-id');
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-error-goaway-${direction}-inflight.png`) });

          // 数据面与产品断言：保留真实200和已收字节，区分Node EOF与完整正文，不伪造UI协议字段。
          // Data plane and product assertions: retain the actual 200 and captured bytes; Node EOF is not a complete body or a fabricated UI protocol event.
          responseStream.write(responseBytes);
          await expect.poll(() => received.bytes).toBe(prefixSize);
          if (direction === 'origin') sourceSessions[0]!.goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
          await expect.poll(() => received.closed).toBe(true);
          await expect.poll(() => responseStream.destroyed).toBe(true);
          const execution = await completed;
          expect(received.bytes).toBe(prefixSize);
          const digest = received.hash.digest('hex');
          expect(digest).toBe(createHash('sha256').update(responseBytes).digest('hex'));
          if (direction === 'origin') {
            expect(execution.state).toBe('failed');
            expect(received.ended).toBe(false);
            expect(received.errors.length).toBeGreaterThan(0);
          }
          await expect(capturedRow).not.toContainText('\u00b7\u00b7\u00b7');
          await expect(capturedRow).toHaveAttribute('data-automation-id', rowId!);
          for (const value of ['200', '256 KB']) await expect(capturedRow).toContainText(value);
          await capturedRow.click();
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
          const responseHeaders = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.responseHeaders);
          if (await responseHeaders.getAttribute('aria-expanded') === 'false') await responseHeaders.click();
          const headersBodyId = await responseHeaders.getAttribute('aria-controls');
          if (!headersBodyId) throw new Error('Missing interrupted response headers.');
          const headersBody = desktopApp.page.locator(`[id="${headersBodyId}"]`);
          await expect(headersBody).toContainText(String(prefixSize * 2));
          await headersBody.scrollIntoViewIfNeeded();
          await expect(responseHeaders).toBeInViewport({ ratio: 1 });
          await expect(headersBody).toBeInViewport({ ratio: 1 });
          await screenshotStep(`${direction}错误GOAWAY后查看响应声明的512KiB / Inspect the declared 512 KiB response after ${direction} error GOAWAY`, {
            highlights: [{ target: responseHeaders, label: '1' }],
          });
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
          await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('a'.repeat(64));
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-error-goaway-${direction}-partial-body.png`) });
          await screenshotStep(`${direction}错误GOAWAY后读取原POST响应的256KiB部分正文 / Read the original POST response's 256 KiB partial body after ${direction} error GOAWAY`, {
            highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default), label: '1' }],
          });
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();

          // 恢复：新连接发独立请求，源站次数及原行保持，不能重放先前POST。
          // Recovery: issue an independent request over a new connection and keep the original row and single POST attempt.
          session.destroy();
          const nextSourceSessions: http2.Http2Session[] = [];
          const next = await tlsTrafficRunner.runHttp2({ ...httpDraft, path: nextPath }, desktopApp.capturePort(), {
            onOriginStream: (stream) => nextSourceSessions.push(stream.session!),
          });
          expect(next).toMatchObject({ state: 'complete', protocol: 'h2', response: { statusCode: 200 } });
          expect(sourceStreams).toHaveLength(1);
          expect(nextSourceSessions).toHaveLength(1);
          expect(sourceSessions.includes(nextSourceSessions[0]!)).toBe(false);
          const nextRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
            .filter({ hasText: nextPath });
          await expect(nextRow).toHaveCount(1);
          await expect(nextRow).toContainText('200');
          await expect(nextRow).not.toContainText('\u00b7\u00b7\u00b7');
          await expect(capturedRow).toHaveAttribute('data-automation-id', rowId!);
          await expect(capturedRow).toContainText('256 KB');
          await desktopApp.page.screenshot({ path: testInfo.outputPath(`h2-error-goaway-${direction}-recovered.png`) });
          await screenshotStep(`${direction}错误GOAWAY后出现独立recovered请求 / Inspect the separate recovered request after ${direction} error GOAWAY`, {
            highlights: [{ target: nextRow, label: '1' }],
          });
          await nextRow.click();
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
          const recoveryRaw = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
          await recoveryRaw.click();
          await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(nextPath);
          await screenshotStep(`${direction}错误GOAWAY后打开独立GET的Response Raw / Open the separate GET Response in Raw after ${direction} error GOAWAY`, {
            highlights: [{ target: recoveryRaw, label: '1' }],
          });
          const recoveryCopy = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
          await recoveryCopy.click();
          await expect.poll(() => desktopApp.page.evaluate(() => navigator.clipboard.readText()))
            .toBe(next.response!.body);
          await screenshotStep(`${direction}错误GOAWAY后复制独立GET的响应 / Copy the separate GET response after ${direction} error GOAWAY`, {
            highlights: [{ target: recoveryCopy, label: '1' }],
          });
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.close).click();
          const evidencePath = testInfo.outputPath(`h2-error-goaway-${direction}.json`);
          await writeFile(evidencePath, JSON.stringify({ direction, goawayCode: http2.constants.NGHTTP2_INTERNAL_ERROR,
            requestPath, rowId, receivedBytes: received.bytes, declaredBytes: prefixSize * 2, digest,
            clientEnded: received.ended, clientClosed: received.closed, streamResetCode: received.stream?.rstCode,
            streamErrors: received.errors, sessionErrors, sourceErrors, originRequestCount: sourceStreams.length,
            originStreamId: sourceStreams[0]?.id, recoveryRequestCount: nextSourceSessions.length,
            differentOriginSession: !sourceSessions.includes(nextSourceSessions[0]!), recoveryRowId: await nextRow.getAttribute('data-automation-id'),
          }, null, 2), 'utf8');
          await testInfo.attach(`h2-error-goaway-${direction}.json`, { path: evidencePath, contentType: 'application/json' });
        } finally {
          responseStream.destroy();
          session.destroy();
          await completed;
          await keyword.fill('/e2e/h2/');
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
    // 清理：经真实UI停用解密并移除本轮例外，保留共享CA；fixture验证进程及宿主恢复。
    // Cleanup: disable decryption and remove this origin exception through UI, preserve the shared CA, and verify process and host restoration.
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'H2 Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'H2 Capture cleanup failed.');
});