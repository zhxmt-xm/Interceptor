import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cleanHttpsCapture, sharedCertificateThumbprint } from '../../fixtures/ui/https-capture';

test('capture guide records each visible action using only owned example traffic', async ({
  desktopApp, httpTrafficRunner, trafficLab,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/capture';
  const requestPath = `${prefix}/orders`;
  const body = '{"orderId":"guide-001","message":"Hello Interceptor","status":"ready"}';
  httpTrafficRunner.respondWith(requestPath, { body, headers: { 'content-type': 'application/json' } });
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const certificateBefore = await sharedCertificateThumbprint();
  let tlsTouched = false;

  // 准备：在录屏前用正式筛选限制自产流量，避免个人后台流量进入教程。
  // Arrange: filter to owned traffic through the UI before recording any tutorial frames.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture');
  try {
    // 用户操作：逐步展示录制、选择、正文模式、暂停与恢复。
    // User actions: demonstrate Recording, selection, body modes, Pause and Resume step by step.
    await media.step('01-filter', '输入 /guide/capture 筛选 / Filter owned traffic', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
    });
    await media.step('02-record', '开启 Recording / Start Recording', async () => {
      await startRecording(desktopApp);
      await expect(recording).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('03-request', '发送演示 GET / Send the example GET', async () => {
      const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
      expect(result).toMatchObject({ statusCode: 200, body });
      await expect(rows).toHaveCount(1);
    });
    await media.step('04-select', '选择 orders 请求 / Select the orders request', async () => {
      await rows.filter({ hasText: requestPath }).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers)).toBeVisible();
    });
    await media.step('05-headers', '检查 Headers / Inspect Headers', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general)).toBeVisible();
    });
    await media.step('06-response', '读取 JSON 正文 / Read the JSON response', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('guide-001');
    });
    await media.step('07-tree', '切换 Tree / Switch to Tree', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.tree).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView)).toContainText('orderId');
    });
    await media.step('08-raw', '切换 Raw / Switch to Raw', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('Hello Interceptor');
    });
    await media.step('08a-fullscreen', '全屏查看正文 / Open the body fullscreen', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
      await expect(page.getByRole('dialog')).toContainText('guide-001');
    });
    await media.step('08b-close-fullscreen', 'Escape 返回详情 / Return with Escape', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('09-hex', '查看 Hex 字节 / Inspect Hex bytes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView)).toBeVisible();
    });
    await media.step('10-timing', '检查请求时序 / Inspect Timing', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.timing)).toBeVisible();
    });
    await media.step('11-pause', '暂停录制 / Pause Recording', async () => {
      await recording.click();
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('12-paused-request', '暂停时请求仍转发 / Forward while paused', async () => {
      const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/paused`);
      expect(result.statusCode).toBe(200);
      await expect(rows).toHaveCount(1);
    });
    await media.step('13-resume', '恢复录制 / Resume Recording', async () => {
      await startRecording(desktopApp);
      await expect(recording).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('14-new-request', '恢复后捕获新请求 / Capture a new request after Resume', async () => {
      const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/resumed`);
      expect(result.statusCode).toBe(200);
      await expect(rows).toHaveCount(2);
    });
    await media.step('15-keyword', '只查找 orders / Narrow search to orders', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
      await expect(rows).toHaveCount(1);
    });
    await media.step('16-restore-filter', '恢复演示范围 / Restore the example scope', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
      await expect(rows).toHaveCount(2);
    });
    await media.step('17-clear', '清空不需保留的演示记录 / Clear disposable example records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
      await expect(rows).toHaveCount(0);
      await expect(recording).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('18-certificates', '检查现有受信任 CA / Inspect the existing trusted CA', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeVisible();
    });
    await media.step('19-local-origin', '只为演示 localhost 添加源站例外 / Add only the demo localhost exception', async () => {
      tlsTouched = true;
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput).fill('localhost');
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd).click();
      await expect(getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'))).toBeVisible();
    });
    await media.step('20-decryption', '开启 HTTPS 解密 / Enable HTTPS decryption', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('21-protocol-scope', '限定协议演示请求 / Filter the protocol examples', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/playground');
    });
    await media.step('22-http2', '捕获真实 HTTP/2 / Capture real HTTP/2', async () => {
      const scenario = trafficLab.scenarios().find(candidate => candidate.id === 'h2-json');
      if (!scenario) throw new Error('Missing H2 example.');
      expect(await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort()))
        .toMatchObject({ state: 'complete', protocol: 'h2', response: { statusCode: 200 } });
      await rows.filter({ hasText: '/playground/h2-json' }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    });
    await media.step('23-trailers', '展开 HTTP/2 trailers / Expand HTTP/2 trailers', async () => {
      const section = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseTrailers);
      if (await section.getAttribute('aria-expanded') === 'false') await section.click();
      await expect(page.locator('body')).toContainText('h2-complete');
    });
    await media.step('24-h2-body', '读取 HTTP/2 JSON / Read the HTTP/2 JSON body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView)).toContainText('h2');
    });
    await media.step('25-websocket', '捕获 WebSocket 文本 / Capture WebSocket text', async () => {
      const scenario = trafficLab.scenarios().find(candidate => candidate.id === 'ws-text');
      if (!scenario) throw new Error('Missing WebSocket example.');
      expect(await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort()))
        .toMatchObject({ state: 'complete' });
      await rows.filter({ hasText: '/playground/ws/text' }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
    });
    await media.step('26-message', '查看发送方向的载荷 / Inspect a sent payload', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionSent).click();
      const frame = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.websocketFrame).first();
      await frame.click();
      await expect(page.locator('body')).toContainText('hello from client');
    });
    await media.step('27-grpc', '捕获 gRPC JSON / Capture gRPC JSON', async () => {
      const scenario = trafficLab.scenarios().find(candidate => candidate.id === 'grpc-unary-json');
      if (!scenario) throw new Error('Missing gRPC example.');
      expect(await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort()))
        .toMatchObject({ state: 'complete', response: { trailers: { 'grpc-status': '0' } } });
      await rows.filter({ hasText: '/playground.Capture/UnaryJson' }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
    });
    await media.step('28-grpc-response', '查看 gRPC response 消息 / Inspect the gRPC response message', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.grpc.responseSide).click();
      await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.grpcMessage).first().click();
      await expect(page.locator('body')).toContainText('world');
    });
    for (const [id, label] of [
      ['body-html', 'HTML代码 / HTML source'],
      ['body-markdown', 'Markdown预览 / Markdown preview'],
      ['body-form', 'Form字段 / Form fields'],
      ['body-png', 'PNG图片 / PNG image'],
      ['body-binary', '二进制Hex / Binary Hex'],
      ['body-audio', '音频元信息 / Audio metadata'],
      ['body-video', '视频元信息 / Video metadata'],
      ['encoding-gzip', 'gzip解码 / gzip decoding'],
      ['encoding-corrupt-gzip', '损坏编码的实际提示 / Actual corrupt-encoding notice'],
    ] as const) {
      await media.step(`29-${id}`, label, async () => {
        const scenario = trafficLab.scenarios().find(candidate => candidate.id === id);
        if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing body example ${id}`);
        expect(await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort()))
          .toMatchObject({ state: 'complete', response: { statusCode: 200 } });
        await rows.filter({ hasText: scenario.defaultDraft.path }).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody)).toBeVisible();
      });
    }
    await media.step('30-decryption-off', '关闭本轮 HTTPS 解密 / Disable this run’s decryption', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('31-remove-exception', '移除演示源站例外 / Remove the demo origin exception', async () => {
      await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'))).toHaveCount(0);
    });
    // 业务断言与证据：暂停的请求未补录，输入值与章节清单逐项一致。
    // Assert and evidence: paused requests were not backfilled; persist the exact example values.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (tlsTouched) await cleanHttpsCapture(desktopApp);
      expect(await sharedCertificateThumbprint()).toBe(certificateBefore);
    } finally {
      await media.stop({ filter: prefix, url: httpTrafficRunner.url(requestPath), response: body,
        protocolFilter: '/playground', h2Path: '/playground/h2-json',
        websocketPath: '/playground/ws/text', websocketPayload: 'hello from client',
        grpcPath: '/playground.Capture/UnaryJson', grpcRequest: '{"message":"hello"}',
        grpcResponse: '{"message":"world"}', originException: 'localhost (removed after the demonstration)' });
    }
  }
  // 清理：正式Close恢复系统代理，fixture核对全部进程和8888。
  // Cleanup: normal Close restores the proxy; the fixture verifies all processes and port 8888.
});
