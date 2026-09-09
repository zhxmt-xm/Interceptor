import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const TEXT_SCENARIOS = [
  { id: 'body-json', mode: 'raw', body: '{"ready":true,"items":[1,2,3]}' },
  { id: 'body-text', mode: 'default', body: 'Interceptor plain text body.' },
  { id: 'body-html', mode: 'raw', body: '<!doctype html><html><body><h1>Interceptor</h1></body></html>' },
  { id: 'body-css', mode: 'raw', body: 'body { color: #2570e0; }' },
  { id: 'body-javascript', mode: 'raw', body: 'const captured = true;\nconsole.log(captured);' },
  { id: 'body-xml', mode: 'raw', body: '<?xml version="1.0"?><capture ready="true"/>' },
  { id: 'body-yaml', mode: 'raw', body: 'capture:\n  ready: true\n  count: 3\n' },
  { id: 'body-svg', mode: 'raw', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#2570e0"/></svg>' },
  { id: 'body-markdown', mode: 'default', body: '# Capture Lab\n\n- request\n- response\n' },
  { id: 'body-form', mode: 'raw', body: 'name=Interceptor&ready=true' },
  { id: 'body-unknown-text', mode: 'default', body: 'Unknown MIME, valid UTF-8 text.' },
] as const;

test('capture.scenarios.bodies displays the captured text document and form bodies', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.bodies' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; row: string | null; bytes: number }> = [];

  // 准备：经产品UI开启Recording，场景只负责向真实代理发送流量。
  // Arrange: start Recording through product UI; scenarios only send traffic to the real proxy.
  await startRecording(desktopApp);
  for (const expected of TEXT_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing body scenario: ${expected.id}`);
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });

      // 产品操作：选择自产Capture行，检查Request正文，再切换Response正文的既有模式。
      // Product actions: select the generated Capture row, inspect its Request body, and select the existing Response mode.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('200');
      await row.click();
      if (scenario.defaultDraft.body) {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
        const mode = expected.id === 'body-text' ? 'default' : 'raw';
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
          .toContainText(scenario.defaultDraft.body, { useInnerText: true });
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody))
        .toContainText(String(Buffer.byteLength(expected.body)));
      const responseMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[expected.mode]);
      await responseMode.click();
      await expect(responseMode).toHaveAttribute('aria-checked', 'true');

      // 业务断言：固定正文独立于流量库定义；HTML/SVG不执行，Markdown按真实Preview渲染。
      // Product assertions: body expectations are independent of the traffic library; HTML/SVG stay inert and Markdown renders in Preview.
      if (expected.id === 'body-markdown') {
        const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Capture Lab');
        await expect(bodyView.getByRole('listitem')).toHaveText(['request', 'response']);
      } else {
        const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await bodyPane.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('ControlOrMeta+C');
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
          .toBe(expected.body);
        if (expected.id === 'body-html' || expected.id === 'body-svg') {
          await expect(bodyPane.locator('iframe, img, script')).toHaveCount(0);
        }
      }
      evidence.push({ scenarioId: expected.id, row: await row.getAttribute('data-automation-id'), bytes: Buffer.byteLength(expected.body) });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }

  // 证据与清理：保存逐场景公开身份；fixture保存trace并关闭origin、Main/Core/Worker及恢复宿主。
  // Evidence and cleanup: retain public scenario identities; fixtures save traces, close origins and product processes, and restore the host.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('body-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});