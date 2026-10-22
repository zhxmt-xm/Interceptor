import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { ClientHttp2Session, Http2Session } from 'node:http2';
import { PassThrough } from 'node:stream';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createResponseBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';

test('capture.http2-origin-goaway drains a paused response before retiring its upstream session', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.http2-origin-goaway' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const responseBody = Buffer.concat([Buffer.alloc(256 * 1024, 0x61), Buffer.alloc(4 * 1024 * 1024 - 256 * 1024, 0x62)]);
  const expectedHash = createHash('sha256').update(responseBody).digest('hex');
  const requestPath = '/e2e/h2/origin-goaway/paused';
  const nextPath = '/e2e/h2/origin-goaway/next';
  const responseStream = new PassThrough();
  const originSessions: Http2Session[] = [];
  const nextSessions: Http2Session[] = [];
  const sourceErrors: string[] = [];
  const received = { bytes: 0, ended: false, errors: [] as string[], hash: createHash('sha256') };
  let sourceClosed = false;
  let ruleId: string | null = null;
  let session: ClientHttp2Session | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备：复用共享CA，通过真实UI只配置本轮TLS例外与响应断点。
    // Arrange: reuse the shared CA and configure only this workflow's TLS exception and response breakpoint through UI.
    await prepareHttpsCapture(desktopApp);
    await startRecording(desktopApp);
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/h2/origin-goaway/');
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    ruleId = await createResponseBreakpointRule(page, 'Origin graceful close', requestPath);
    const scenario = trafficLab.scenarios().find((item) => item.id === 'h2-json');
    if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing H2 traffic draft.');
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    session = await tlsTrafficRunner.openHttp2Session(desktopApp.capturePort());
    session.on('error', (error) => received.errors.push(error.message));
    const completed = tlsTrafficRunner.runHttp2({
      ...scenario.defaultDraft, method: 'POST', path: requestPath, body: 'single-post',
    }, desktopApp.capturePort(), {
      session,
      response: {
        statusCode: 200, responseBody: responseStream,
        responseHeaders: { 'content-type': 'application/octet-stream', 'content-length': String(responseBody.length) },
        responseTrailers: { 'x-goaway-complete': expectedHash },
      },
      onStream: (stream) => {
        stream.on('data', (chunk: Buffer) => { received.bytes += chunk.byteLength; received.hash.update(chunk); });
        stream.on('end', () => { received.ended = true; });
        stream.on('error', (error) => received.errors.push(error.message));
      },
      onOriginStream: (stream) => {
        originSessions.push(stream.session!);
        stream.on('close', () => { sourceClosed = true; });
        stream.on('error', (error) => sourceErrors.push(error.message));
      },
    });
    responseStream.write(responseBody.subarray(0, 256 * 1024));
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: requestPath });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-breakpoint-state', 'head');
    await row.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified)).toBeVisible();
    expect(originSessions).toHaveLength(1);
    expect(received.bytes).toBe(0);
    const rowId = await row.getAttribute('data-automation-id');
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.hostList)).toBeHidden();
    await screenshotStep('响应断点等待原样放行，客户端尚未收到正文 / The response breakpoint awaits Continue unmodified before the client receives its body', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified), label: '1' }],
    });

    // 用户操作：源站正常GOAWAY并发完正文后，真实点击原样放行。
    // User action: continue unmodified only after the origin gracefully closes and finishes its response.
    originSessions[0]!.close();
    responseStream.end(responseBody.subarray(256 * 1024));
    await expect.poll(() => sourceClosed).toBe(true);
    await expect.poll(() => originSessions[0]!.destroyed).toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
    try {
      // 业务断言：同一响应完整结束，保留正文、trailer及原Capture身份。
      // Business assertions: finish the same response with complete bytes, trailers and its original Capture identity.
      await expect.poll(() => received.bytes).toBe(responseBody.length);
      await expect.poll(() => received.ended).toBe(true);
      const execution = await completed;
      expect(execution).toMatchObject({
        state: 'complete', protocol: 'h2', response: {
          statusCode: 200, bodyBytes: responseBody.length, trailers: { 'x-goaway-complete': expectedHash },
        },
      });
      expect(received.hash.copy().digest('hex')).toBe(expectedHash);
      expect(received.errors).toEqual([]);
      expect(sourceErrors).toEqual([]);
      await expect(row).not.toHaveAttribute('data-breakpoint-id');
      await expect(row).not.toContainText('\u00b7\u00b7\u00b7');
      await expect(row).toHaveAttribute('data-automation-id', rowId!);
      await expect(row).toContainText('4 MB');
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      const trailers = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseTrailers);
      if (await trailers.getAttribute('aria-expanded') === 'false') await trailers.click();
      const bodyId = await trailers.getAttribute('aria-controls');
      if (!bodyId) throw new Error('Missing response trailer body.');
      const trailerBody = page.locator(`[id="${bodyId}"]`);
      await expect(trailerBody).toContainText(expectedHash);
      await trailerBody.scrollIntoViewIfNeeded();
      await expect(trailers).toBeInViewport({ ratio: 1 });
      await expect(trailerBody).toBeInViewport({ ratio: 1 });
      await screenshotStep('正常GOAWAY后原样放行，完整响应trailer仍保留 / Continue after graceful GOAWAY and retain the complete response trailer', {
        highlights: [{ target: trailers, label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      const next = await tlsTrafficRunner.runHttp2({
        ...scenario.defaultDraft, method: 'POST', path: nextPath, body: 'new-post',
      }, desktopApp.capturePort(), { session, onOriginStream: (stream) => nextSessions.push(stream.session!) });
      expect(next).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      expect(originSessions).toHaveLength(1);
      expect(nextSessions).toHaveLength(1);
      expect(nextSessions[0] === originSessions[0]).toBe(false);
      const nextRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: nextPath });
      await expect(nextRow).toHaveCount(1);
      await nextRow.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
      await raw.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(nextPath);
      await screenshotStep('新上游连接的独立POST返回可读JSON / A separate POST on the new origin connection returns readable JSON', {
        highlights: [{ target: raw, label: '1' }],
      });
      await page.screenshot({ path: testInfo.outputPath('origin-goaway-complete.png') });
      await screenshotStep('业务断言：同一响应完整结束，保留正文、trailer及原Capture身份。 / Business assertions: finish the same response with complete bytes, trailers and its original Capture identity.');
    } finally {
      // 证据：失败也记录真实字节和结束状态，不用清理时的EOF冒充成功。
      // Evidence: retain actual byte and end state on failure; never count cleanup EOF as success.
      await writeFile(testInfo.outputPath('origin-goaway-wire.json'), JSON.stringify({
        expectedBytes: responseBody.length, expectedHash, receivedBytes: received.bytes,
        receivedHash: received.hash.copy().digest('hex'), ended: received.ended,
        sourceRequests: originSessions.length, sourceClosed, sourceSessionDestroyed: originSessions[0]!.destroyed,
        nextSourceRequests: nextSessions.length,
        newUpstreamSession: nextSessions.length > 0 ? nextSessions[0] !== originSessions[0] : null,
        clientErrors: [...received.errors],
        sourceErrors, captureRowId: rowId,
      }, null, 2), 'utf8');
    }
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：结束测试流，经产品删除规则与TLS例外；fixture验证退出和宿主恢复。
    // Cleanup: end test traffic, remove the Rule and TLS exception through UI, then let the fixture verify host restoration.
    session?.destroy();
    responseStream.destroy();
    if (ruleId) {
      try {
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
        await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click({ button: 'right' });
        await getByAutomationId(page, AutomationIdFactory.ruleNodeAction(ruleId, 'delete')).click({ timeout: 15_000 });
        await expect(getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId))).toHaveCount(0);
        const apply = getByAutomationId(page, AUTOMATION_IDS.rules.apply);
        if (await apply.count()) {
          if (await apply.isEnabled()) await apply.click({ timeout: 15_000 });
          await expect(apply).toBeDisabled();
        }
      } catch (error) { cleanupErrors.push(error); }
    }
    try { await cleanHttpsCapture(desktopApp); } catch (error) { cleanupErrors.push(error); }
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length) throw new AggregateError([workflowError, ...cleanupErrors], 'H2 GOAWAY workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'H2 GOAWAY cleanup failed.');
});
