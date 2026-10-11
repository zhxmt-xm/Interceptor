import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { Locator } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture } from '../../fixtures/ui/https-capture';
import { MacosWorkflowHostSafetyOperations } from '../../fixtures/safety/macos-workflow-host-safety-operations';

const execute = promisify(execFile);

async function messageGeometry(pane: Locator) {
  return pane.evaluate(element => {
    let scroll = element.parentElement;
    while (scroll && !/auto|scroll/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
    if (!scroll) throw new Error('Message has no scroll viewport.');
    const box = element.getBoundingClientRect();
    const parent = scroll.getBoundingClientRect();
    const style = getComputedStyle(element);
    const slider = element.querySelector('.scrollbar.vertical .slider');
    return {
      height: box.height, top: box.top, resize: style.resize,
      available: scroll.clientHeight - scroll.scrollTop - box.top + parent.top,
      outerScroll: scroll.scrollTop,
      border: parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
      sliderTop: slider instanceof HTMLElement ? parseFloat(slider.style.top) : null,
    };
  });
}

for (const protocol of ['grpc', 'websocket'] as const) {
  test(`capture.messages.compact-layout ${protocol} keeps long messages bounded and resizable`, async ({
    desktopApp, trafficLab,
  }, testInfo) => {
    test.setTimeout(240_000);
    testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.messages.compact-layout' });
    const { page } = desktopApp;
    const readCopiedText = async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    const requestPath = `/e2e/${protocol}/compact-message-layout`;
    const short = JSON.stringify({ requestId: 'short-message', status: 'ready', count: 18 }, null, 2);
    const long = JSON.stringify({
      requestId: 'long-message',
      entries: Array.from({ length: 28 }, (_, index) => ({ index, product: `sku-${1042 + index}`, state: 'available' })),
      end: 'compact-message-end',
    }, null, 2);
    const payloads = [short, long, ...Array.from({ length: 4 }, (_, index) => JSON.stringify({ after: `next-message-${index}` }))];
    const evidence: Record<string, unknown> = { protocol };
    try {
      // 准备：真实协议流量经过8888，gRPC仅复用日常CA并设置本轮localhost例外。
      // Arrange: send real protocol traffic through 8888; gRPC reuses the daily CA and a local origin exception.
      if (protocol === 'grpc') await prepareHttpsCapture(desktopApp);
      await startRecording(desktopApp);
      if (protocol === 'grpc') {
        const scenario = trafficLab.scenarios().find(value => value.id === 'grpc-unary-json');
        if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing gRPC JSON scenario.');
        const result = await trafficLab.run(scenario.id, {
          ...scenario.defaultDraft, path: requestPath,
          requestMessages: [{ data: '{"request":"compact"}', encoding: 'utf8', compressed: false }],
          responseMessages: payloads.map(data => ({ data, encoding: 'utf8', compressed: false })),
        }, desktopApp.capturePort());
        expect(result).toMatchObject({ state: 'complete', protocol: 'grpc', response: { statusCode: 200 } });
        expect(result.response?.bodyBytes).toBe(payloads.reduce((size, value) => size + 5 + Buffer.byteLength(value), 0));
      } else {
        const client = await trafficLab.webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), requestPath);
        try {
          for (const payload of payloads) {
            const received = once(client, 'message', { signal: AbortSignal.timeout(5_000) });
            client.sendBinary(Buffer.from(payload));
            const [bytes, binary] = await received;
            expect(bytes).toEqual(Buffer.from(payload));
            expect(binary).toBe(true);
          }
        } finally {
          await client.closeGracefully(1000, 'compact-complete');
        }
      }

      // 用户操作：按自产连接及公共消息ID展开短/长正文，不调用业务API或注入Store。
      // User actions: select the captured connection and expand short/long payloads through public IDs, without injected state.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      const id = await row.getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing captured exchange ID.');
      const exchangeId = id.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      await row.click();
      await getByAutomationId(page, protocol === 'grpc'
        ? AUTOMATION_IDS.capture.inspector.tab.grpc : AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await getByAutomationId(page, protocol === 'grpc'
        ? AUTOMATION_IDS.capture.grpc.responseSide : AUTOMATION_IDS.capture.websocket.directionSent).click();
      const messages = getByAutomationIdPrefix(page, protocol === 'grpc'
        ? `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.response.`
        : `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`);
      await expect(messages).toHaveCount(payloads.length);
      const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
      const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
      await messages.nth(0).click();
      await raw.click();
      await expect(pane).toContainText('short-message');
      const shortGeometry = await messageGeometry(pane);
      expect(shortGeometry.height).toBeCloseTo(5 * 20 + 26 + shortGeometry.border, 1);
      evidence.short = shortGeometry;
      await messages.nth(0).click();
      await messages.nth(1).click();
      await raw.click();
      await expect(pane).toContainText('long-message');
      const initial = await messageGeometry(pane);
      evidence.initial = initial;
      await page.screenshot({ path: testInfo.outputPath(`${protocol}-initial.png`) });
      await writeFile(testInfo.outputPath(`${protocol}-geometry.json`), JSON.stringify(evidence, null, 2), 'utf8');

      // 业务断言：长正文只占容器可用空间，右下角真实拖拽改变显示高度而非字节。
      // Assertions: bound the long body to available space; real corner dragging changes height, not payload bytes.
      expect(initial.resize).toBe('vertical');
      expect(initial.height).toBeLessThanOrEqual(initial.available + 1);
      expect(initial.height).toBeGreaterThan(100);
      const box = await pane.boundingBox();
      if (!box) throw new Error('The message pane is not visible.');
      await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 3, box.y + box.height - 63, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await messageGeometry(pane)).height).toBeLessThan(initial.height - 40);
      const resized = await messageGeometry(pane);
      evidence.resized = resized;
      await page.screenshot({ path: testInfo.outputPath(`${protocol}-resized.png`) });

      // 交互断言：滚动正文时标题不移动，到末行后继续滚外层；键盘及Copy仍可访问完整消息。
      // Interaction: scroll within the body before chaining outward; keyboard navigation and Copy retain the full message.
      await page.mouse.move(box.x + 100, box.y + 40);
      await page.mouse.wheel(0, 400);
      await expect.poll(async () => (await messageGeometry(pane)).sliderTop ?? 0).toBeGreaterThan(0);
      expect((await messageGeometry(pane)).outerScroll).toBe(resized.outerScroll);
      await pane.click({ position: { x: 100, y: 40 } });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
      await expect(pane).toContainText('compact-message-end');
      await page.mouse.wheel(0, 400);
      await expect.poll(async () => (await messageGeometry(pane)).outerScroll).toBeGreaterThan(resized.outerScroll);
      evidence.scrolled = await messageGeometry(pane);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(readCopiedText).toBe(long);
      const messageId = await messages.nth(1).getAttribute('data-automation-id');
      if (!messageId) throw new Error('Missing selected message identity.');
      const sequence = Number(messageId.slice(messageId.lastIndexOf('.') + 1));
      await getByAutomationId(page, protocol === 'grpc'
        ? AutomationIdFactory.grpcPayloadCopy(exchangeId, 'response', 1)
        : AutomationIdFactory.websocketPayloadCopy(exchangeId, sequence)).click();
      const messageCopy = protocol === 'grpc' ? long
        : [...Buffer.from(long)].map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      await expect.poll(readCopiedText).toBe(messageCopy);
      evidence.copy = { length: long.length, sha256: createHash('sha256').update(long).digest('hex') };

      // 窗口尺寸：只调整本轮真实Main窗口，恢复空间后保留手动正文高度。
      // Window sizing: resize only the owned Main window and restore its manually selected body height.
      if (process.platform === 'darwin') {
        const owner = desktopApp.nativeFileDialogOwner();
        expect(await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId)).toEqual(owner);
        const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        const resizeWindow = async (height: number): Promise<void> => {
          await execute('/usr/bin/osascript', ['-e', `
tell application "System Events"
  tell first application process whose unix id is ${owner.processId}
    set size of window 1 to {${originalSize.width}, ${height}}
  end tell
end tell
`], { encoding: 'utf8', timeout: 5_000 });
          await expect.poll(() => page.evaluate(() => innerHeight)).toBe(height);
        };
        try {
          await resizeWindow(originalSize.height - 200);
          await expect.poll(async () => (await messageGeometry(pane)).height).toBeLessThan(resized.height);
          const smaller = await messageGeometry(pane);
          expect(smaller.height).toBeLessThanOrEqual(smaller.available + 1);
          evidence.smallerWindow = smaller;
        } finally {
          await resizeWindow(originalSize.height);
        }
        await expect.poll(async () => (await messageGeometry(pane)).height).toBeCloseTo(resized.height, 1);
      }

      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex).click();
      await expect(pane).toHaveCount(0);
      await raw.click();
      await expect(pane).toBeVisible();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await pane.evaluate(element => getComputedStyle(element).resize)).toBe('none');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      expect(await pane.evaluate(element => getComputedStyle(element).resize)).toBe('vertical');
      await messages.nth(1).click();
      await messages.nth(0).click();
      await raw.click();
      expect((await messageGeometry(pane)).height).toBeCloseTo(shortGeometry.height, 1);
      if (protocol === 'grpc') {
        // 分页回归：使用同一外层滚动容器继续加载超过两页的真实消息并复制末条。
        // Pagination regression: the same outer scroll viewport loads over two real message pages and copies the last one.
        const scenario = trafficLab.scenarios().find(value => value.id === 'grpc-unary-json');
        if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing gRPC pagination scenario.');
        const pagedPath = `${requestPath}/pagination`;
        const pagePayloads = Array.from({ length: 205 }, (_, index) => JSON.stringify({ index, state: 'complete' }));
        const result = await trafficLab.run(scenario.id, {
          ...scenario.defaultDraft, path: pagedPath,
          responseMessages: pagePayloads.map(data => ({ data, encoding: 'utf8', compressed: false })),
        }, desktopApp.capturePort());
        expect(result.state).toBe('complete');
        const pagedRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: pagedPath });
        await pagedRow.click();
        const pagedId = await pagedRow.getAttribute('data-automation-id');
        if (!pagedId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing paged exchange identity.');
        const pagedExchange = pagedId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.grpc.responseSide).click();
        const lastMessage = getByAutomationId(page, AutomationIdFactory.grpcMessage(pagedExchange, 'response', 204));
        const scroll = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
        await scroll.hover({ position: { x: 100, y: 120 } });
        await expect.poll(async () => {
          await page.mouse.wheel(0, 5000);
          evidence.pagination = {
            expectedMessages: pagePayloads.length,
            visibleIds: await getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${pagedExchange}.response.`)
              .evaluateAll(elements => elements.map(element => element.getAttribute('data-automation-id'))),
            viewport: await scroll.evaluate(element => ({
              height: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop,
              status: element.textContent?.slice(0, 450),
            })),
          };
          return lastMessage.isVisible();
        }, { timeout: 15_000 }).toBe(true);
        await lastMessage.click();
        await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(pagedExchange, 'response', 204)).click();
        await expect.poll(readCopiedText).toBe(pagePayloads[204]);
        evidence.pagination = { messageCount: pagePayloads.length, lastIndex: 204, lastCopied: true };
      }
      expect(desktopApp.rendererPageErrors()).toEqual([]);
    } finally {
      // 证据与清理：保留实际结果，经UI恢复本profile TLS配置，外层fixture验证全部进程和系统恢复。
      // Evidence and cleanup: retain observed results, restore profile TLS through UI, and let the fixture verify process and host restoration.
      await writeFile(testInfo.outputPath(`${protocol}-geometry.json`), JSON.stringify(evidence, null, 2), 'utf8');
      if (protocol === 'grpc') await cleanHttpsCapture(desktopApp);
    }
  });
}
