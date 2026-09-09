import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const WEBSOCKET_SCENARIOS = [
  { id: 'ws-text', sent: ['hello from client'], received: ['hello from client'] },
  { id: 'ws-binary', sent: ['00 01 02 03 ff'], received: ['00 01 02 03 ff'] },
  { id: 'ws-bidirectional', sent: ['client message'], received: ['client message', 'origin message'] },
  { id: 'ws-control', sent: [], received: [] },
] as const;

test('capture.scenarios.websocket captures directional text binary and controlled connections', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.websocket' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; exchangeId: string; sent: number; received: number }> = [];

  // 准备：通过产品UI录制，现有客户端与origin经真实代理建立各场景WebSocket。
  // Arrange: start Recording through UI; existing clients and origins establish each WebSocket through the real proxy.
  await startRecording(desktopApp);
  for (const expected of WEBSOCKET_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'websocket') throw new Error(`Missing WebSocket scenario: ${expected.id}`);
      const previousCloses = trafficLab.webSocketTrafficRunner.evidence().closeCodes.length;
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', protocol: 'websocket', response: { statusCode: 101 } });
      expect(result.events?.at(-1)?.type).toBe('close');
      await expect.poll(() => trafficLab.webSocketTrafficRunner.evidence().closeCodes).toHaveLength(previousCloses + 1);
      expect(trafficLab.webSocketTrafficRunner.latestCloseCode()).toBe(1000);
      if (expected.id === 'ws-control') {
        expect(result.events?.map((event) => event.type)).toEqual(['open', 'ping', 'pong', 'pong', 'close']);
      }

      // 产品操作：选择本轮101行，通过公开Messages与方向筛选查看真实捕获的数据消息。
      // Product actions: select this 101 row and use public Messages and direction controls to inspect captured data messages.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      for (const value of ['ws', '101']) await expect(row).toContainText(value);
      const rowId = await row.getAttribute('data-automation-id');
      if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing Capture identity.');
      const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      const framePrefix = `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`;
      const frames = getByAutomationIdPrefix(page, framePrefix);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      for (const [directionId, payloads] of [
        [AUTOMATION_IDS.capture.websocket.directionSent, expected.sent],
        [AUTOMATION_IDS.capture.websocket.directionReceived, expected.received],
      ] as const) {
        const direction = getByAutomationId(page, directionId);
        await direction.click();
        await expect(direction).toHaveAttribute('aria-checked', 'true');
        await expect(frames).toHaveCount(payloads.length);

        // 业务断言：固定文本或Hex同时显示在消息行与真实Copy结果中，不能串方向或串连接。
        // Product assertions: fixed text or Hex matches both frame previews and actual Copy results without mixing directions or connections.
        for (const payload of payloads) {
          const frame = frames.filter({ hasText: payload });
          await expect(frame).toHaveCount(1);
          const frameId = await frame.getAttribute('data-automation-id');
          const sequence = Number(frameId?.slice(framePrefix.length));
          expect(Number.isSafeInteger(sequence)).toBe(true);
          await frame.click();
          await getByAutomationId(page, AutomationIdFactory.websocketPayloadCopy(exchangeId, sequence)).click();
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
          await frame.click();
        }
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll).click();
      await expect(frames).toHaveCount(expected.sent.length + expected.received.length);
      if (expected.id === 'ws-control') {
        const screenshotPath = testInfo.outputPath('websocket-control-empty-state.png');
        await page.screenshot({ path: screenshotPath });
        await testInfo.attach('websocket-control-empty-state', { path: screenshotPath, contentType: 'image/png' });
        const presentation = await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll).evaluate((control) => {
          const toolbar = control.closest('[role="radiogroup"]')?.parentElement;
          const message = toolbar?.nextElementSibling?.firstElementChild?.firstElementChild;
          if (!(message instanceof HTMLElement)) throw new Error('The WebSocket message state is not visible.');
          const style = getComputedStyle(message);
          return { hasStateStyles: message.className.trim().length > 0, color: style.color, fontSize: style.fontSize,
            display: style.display, minHeight: style.minHeight, textAlign: style.textAlign, placeItems: style.placeItems };
        });
        await testInfo.attach('websocket-empty-presentation.json', {
          body: Buffer.from(JSON.stringify(presentation)), contentType: 'application/json',
        });
        expect(presentation).toMatchObject({ hasStateStyles: true, display: 'grid', minHeight: '116px',
          fontSize: '12px', textAlign: 'center', placeItems: 'center' });
        expect(presentation.color).not.toBe('rgb(0, 0, 0)');
      }
      evidence.push({ scenarioId: expected.id, exchangeId, sent: expected.sent.length, received: expected.received.length });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }

  // 证据与清理：控制帧不制造数据消息；fixture保存trace并验证连接、进程、8888与宿主恢复。
  // Evidence and cleanup: control frames do not create data messages; fixtures save traces and verify connections, processes, port 8888, and host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('websocket-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});