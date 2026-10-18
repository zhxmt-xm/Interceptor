import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cleanHttpsCapture, prepareHttpsCapture } from '../../fixtures/ui/https-capture';

test('capture guide distinguishes HTTP2 streaming, interrupted bodies and new-connection recovery', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/h2';
  const streamPath = `${prefix}/stream`;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
  const first = `part-one: guide-start\n${'a'.repeat(64 * 1024)}\n`;
  const second = `part-two: guide-middle\n${'b'.repeat(64 * 1024)}\n`;
  const last = 'part-three: guide-end\n';
  const completeBody = first + second + last;
  const responseStream = new PassThrough();
  const received = { bytes: 0, ended: false };
  let media: GuidebookMedia | undefined;
  let tlsPrepared = false;
  let pending: ReturnType<Awaited<ReturnType<typeof trafficLab.getTlsTrafficRunner>>['runHttp2']> | undefined;
  const openSection = async (automationId: string, expected: string): Promise<void> => {
    const section = getByAutomationId(page, automationId);
    if (await section.getAttribute('aria-expanded') !== 'true') await section.click();
    const id = await section.getAttribute('aria-controls');
    if (!id) throw new Error(`Missing controlled section: ${automationId}`);
    await expect(page.locator(`[id="${id}"]`)).toContainText(expected);
  };
  const copyBody = async (): Promise<string> => {
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
    return (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
  };
  try {
    // 准备：使用既有CA及自有localhost源站，网络异常只发生在本轮可控H2连接。
    // Arrange: use the existing CA and owned localhost origin; network failures affect only these controlled H2 connections.
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
    tlsPrepared = true;
    await prepareHttpsCapture(desktopApp);
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-http2');
    await media.step('01-scope', '限定本轮 HTTP/2 路径 / Scope this run’s HTTP/2 paths', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
    });
    await media.step('02-record', '开启 Recording / Start Recording', async () => { await startRecording(desktopApp); });
    await media.step('03-first-part', '接收第一段但保持连接未结束 / Receive the first part without ending the response', async () => {
      pending = tlsTrafficRunner.runHttp2({
        kind: 'http', protocol: 'h2', method: 'GET', path: streamPath,
        body: '', headers: { accept: 'text/plain' },
      }, desktopApp.capturePort(), {
        response: {
          responseBody: responseStream,
          responseHeaders: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(completeBody)) },
          responseTrailers: { 'x-guide-end': 'complete' },
        },
        onStream: stream => {
          stream.on('data', (chunk: Buffer) => { received.bytes += chunk.length; });
          stream.on('end', () => { received.ended = true; });
        },
      });
      responseStream.write(first);
      await expect.poll(() => received.bytes).toBe(Buffer.byteLength(first));
      expect(received.ended).toBe(false);
      await expect(rows.filter({ hasText: streamPath })).toHaveCount(1);
    });
    await media.step('04-select', '选择仍在接收的 stream / Select the stream while receiving', async () => {
      await rows.filter({ hasText: streamPath }).click();
    });
    await media.step('05-headers', '核对声明的完整长度 / Inspect the declared complete length', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await openSection(AUTOMATION_IDS.capture.inspector.section.responseHeaders, String(Buffer.byteLength(completeBody)));
      expect(received.ended).toBe(false);
    });
    await media.step('06-partial-body', '区分接收进度与正文可读性 / Distinguish received bytes from a readable body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody)).toBeVisible();
      await expect(pane).toHaveCount(0);
      await expect(rows.filter({ hasText: streamPath })).toContainText('64 KB');
      expect(received.ended).toBe(false);
    });
    await media.step('07-second-part', '继续接收第二段 / Receive the second part', async () => {
      responseStream.write(second);
      await expect.poll(() => received.bytes).toBe(Buffer.byteLength(first + second));
      await expect(rows.filter({ hasText: streamPath })).toContainText('128 KB');
      await expect(pane).toHaveCount(0);
      expect(received.ended).toBe(false);
    });
    await media.step('08-complete', '结束响应并核对完整正文 / End the response and verify the complete body', async () => {
      responseStream.end(last);
      if (!pending) throw new Error('The owned HTTP/2 request was not started.');
      const result = await pending;
      pending = undefined;
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200, bodyBytes: Buffer.byteLength(completeBody), trailers: { 'x-guide-end': 'complete' } } });
      expect(received.ended).toBe(true);
      await expect.poll(copyBody).toBe(completeBody);
    });
    await media.step('09-trailers', '查看结束时的 trailer / Inspect the completion trailer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await openSection(AUTOMATION_IDS.capture.inspector.section.responseTrailers, 'x-guide-end');
      await openSection(AUTOMATION_IDS.capture.inspector.section.responseTrailers, 'complete');
    });
    await media.step('10-protocol-group', '展开 Protocol 分组 / Expand the Protocol group', async () => {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle('protocol'));
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    });
    await media.step('11-http2-filter', '选择实际 HTTP/2 协议 / Select the actual HTTP/2 protocol', async () => {
      const option = getByAutomationId(page, AutomationIdFactory.captureFacetOption('protocol', 'HTTP/2'));
      await option.click();
      await expect(option).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(1);
    });

    // 用户操作：区分原POST的部分正文和独立恢复GET，错误GOAWAY不等于成功重放。
    // User actions: distinguish the original partial POST from a separate recovery GET; error GOAWAY is not a successful replay.
    for (const direction of ['client', 'origin'] as const) {
      const pathname = `${prefix}/${direction}-goaway`;
      await media.step(`${direction}-01-interrupt`, direction === 'client'
        ? '观察客户端中断与新连接 / Observe client interruption and a new connection'
        : '观察源站中断与新连接 / Observe origin interruption and a new connection', async () => {
        const scenario = trafficLab.scenarios().find(candidate => candidate.id === `h2-error-goaway-${direction}`);
        if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing owned GOAWAY scenario: ${direction}`);
        const result = await trafficLab.run(scenario.id, { ...scenario.defaultDraft, path: pathname }, desktopApp.capturePort());
        const goaway = result.events?.find(event => event.type === 'goaway');
        const recovery = result.events?.find(event => event.type === 'recovery');
        expect(goaway).toMatchObject({ sent: true, errorCode: 2, declaredBodyBytes: 524288, receivedBodyBytes: 262144, originRequestCount: 1 });
        expect(recovery).toMatchObject({ state: 'complete', originRequestCount: 1, differentOriginSession: true, response: { statusCode: 200 } });
        await testInfo.attach(`${direction}-transport`, { body: JSON.stringify(result), contentType: 'application/json' });
      });
      await media.step(`${direction}-02-original`, '选择原来的 POST / Select the original POST', async () => {
        await rows.filter({ hasText: pathname }).filter({ hasText: 'POST' }).click();
      });
      await media.step(`${direction}-03-length`, '查看仍声明 524288 的 Header / Inspect the Header still declaring 524288 bytes', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
        await openSection(AUTOMATION_IDS.capture.inspector.section.responseHeaders, '524288');
      });
      await media.step(`${direction}-04-partial`, '读取真正捕获到的部分正文 / Read the actually captured partial body', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await expect(pane).toBeVisible();
        const copied = await copyBody();
        expect(Buffer.byteLength(copied)).toBe(262144);
        expect(createHash('sha256').update(copied).digest('hex')).toBe(createHash('sha256').update(Buffer.alloc(262144, 0x61)).digest('hex'));
      });
      await media.step(`${direction}-05-recovered`, '选择独立的 recovered GET / Select the separate recovered GET', async () => {
        const recovered = rows.filter({ hasText: `${pathname}/recovered` });
        await expect(recovered).toHaveCount(1);
        await recovered.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general)).toBeVisible();
      });
      await media.step(`${direction}-06-recovery-body`, '读取新连接的正常响应 / Read the normal response on the new connection', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await expect(pane).toBeVisible();
        await expect.poll(copyBody).toContain('/recovered');
      });
    }
    await media.step('24-settings', '返回 Settings / Return to Settings', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click(); });
    await media.step('25-certificates', '打开 Certificates / Open Certificates', async () => { await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click(); });
    await media.step('26-mitm-off', '关闭本轮 HTTPS 解密 / Disable this run’s HTTPS decryption', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('27-origin-remove', '移除本轮源站例外 / Remove this run’s origin exception', async () => {
      await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'))).toHaveCount(0);
    });
    // 证据：每个故障都只发送一次原POST，恢复是新连接的新GET，部分字节不冒充完整响应。
    // Evidence: each failure sends the original POST once; recovery is a new GET and partial bytes remain partial.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    responseStream.end();
    try {
      if (pending) await pending;
      if (tlsPrepared) await cleanHttpsCapture(desktopApp);
    } finally {
      if (media) await media.stop({
        filter: prefix, streamPath, firstPartBytes: String(Buffer.byteLength(first)),
        twoPartBytes: String(Buffer.byteLength(first + second)), completeBytes: String(Buffer.byteLength(completeBody)),
        firstMarker: 'part-one: guide-start', secondMarker: 'part-two: guide-middle', finalMarker: 'part-three: guide-end',
        trailer: 'x-guide-end: complete', errorGoawayCode: '2', declaredBytes: '524288',
        capturedPartialBytes: '262144', recovery: 'separate GET on a new connection; original POST not replayed',
        inflightBody: 'Received byte counts update before the normal HTTP response body becomes readable',
      });
    }
  }
  // 清理：现有driver经真实Close恢复代理、保留CA并释放所有进程和8888。
  // Cleanup: the existing driver restores proxy settings, preserves CA and releases processes and port 8888 through real Close.
});
