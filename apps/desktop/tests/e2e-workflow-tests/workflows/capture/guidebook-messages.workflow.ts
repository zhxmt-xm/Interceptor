import { once } from 'node:events';
import type { Locator } from '@playwright/test';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cleanHttpsCapture, prepareHttpsCapture } from '../../fixtures/ui/https-capture';

for (const protocol of ['websocket', 'grpc'] as const) {
  test(`capture guide records ${protocol} message viewing, copying and pagination`, async ({
    desktopApp, trafficLab,
  }, testInfo) => {
    test.setTimeout(420_000);
    const { page } = desktopApp;
    page.setDefaultTimeout(15_000);
    const prefix = `/guide/messages/${protocol}`;
    const requestPath = `${prefix}/detail`;
    const pagedPath = `${prefix}/pages`;
    const short = '{"message":"guide-short","state":"ready"}';
    const long = JSON.stringify({
      message: 'guide-long',
      entries: Array.from({ length: 28 }, (_, index) => ({ index, product: `guide-${index}`, state: 'available' })),
      end: 'guide-message-end',
    }, null, 2);
    const payloads = [short, long, ...Array.from({ length: 4 }, (_, index) => JSON.stringify({ after: `guide-next-${index}` }))];
    const pagePayloads = Array.from({ length: 205 }, (_, index) => JSON.stringify({ index, message: `guide-page-${index}` }));
    const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
    const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
    let exchangeId = '';
    let media: GuidebookMedia | undefined;
    let tlsPrepared = false;
    const messages = () => getByAutomationIdPrefix(page, protocol === 'grpc'
      ? `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.response.`
      : `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`);
    const selectRow = async (pathname: string): Promise<void> => {
      const row = rows.filter({ hasText: pathname });
      await expect(row).toHaveCount(1);
      const id = await row.getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing message exchange identity.');
      exchangeId = id.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      await row.click();
    };
    const send = async (pathname: string, values: readonly string[], binary: boolean): Promise<void> => {
      if (protocol === 'grpc') {
        const scenario = trafficLab.scenarios().find(candidate => candidate.id === 'grpc-unary-json');
        if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing owned gRPC scenario.');
        const result = await trafficLab.run(scenario.id, {
          ...scenario.defaultDraft, path: pathname,
          requestMessages: [{ data: '{"request":"guide-messages"}', encoding: 'utf8', compressed: false }],
          responseMessages: values.map(data => ({ data, encoding: 'utf8', compressed: false })),
        }, desktopApp.capturePort());
        expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
        expect(result.response?.bodyBytes).toBe(values.reduce((sum, value) => sum + 5 + Buffer.byteLength(value), 0));
      } else {
        const client = await trafficLab.webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), pathname);
        try {
          for (const value of values) {
            const received = once(client, 'message', { signal: AbortSignal.timeout(5_000) });
            if (binary) client.sendBinary(Buffer.from(value));
            else client.sendText(value);
            const [bytes, isBinary] = await received;
            expect(bytes).toEqual(Buffer.from(value));
            expect(isBinary).toBe(binary);
          }
        } finally {
          await client.closeGracefully(1000, 'guide-complete');
        }
      }
    };
    const payloadCopy = async (message: Locator, expected: string): Promise<void> => {
      const id = await message.getAttribute('data-automation-id');
      if (!id) throw new Error('Missing message identity.');
      const index = Number(id.slice(id.lastIndexOf('.') + 1));
      if (!Number.isSafeInteger(index)) throw new Error('Invalid message index.');
      await getByAutomationId(page, protocol === 'grpc'
        ? AutomationIdFactory.grpcPayloadCopy(exchangeId, 'response', index)
        : AutomationIdFactory.websocketPayloadCopy(exchangeId, index)).click();
      expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(expected);
    };
    const scrollViewport = (anchor: Locator) => anchor.evaluate(element => {
      let parent = element.parentElement;
      while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
      if (!parent) throw new Error('The message has no scroll viewport.');
      const box = parent.getBoundingClientRect();
      return { top: parent.scrollTop, x: box.x, y: box.y, width: box.width, height: box.height };
    });
    try {
      // 准备：只使用自有协议服务；gRPC沿用已录证书前提，不生成或删除日常CA。
      // Arrange: use owned protocol services; gRPC reuses the documented CA prerequisite without replacing the daily CA.
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
      if (protocol === 'grpc') {
        tlsPrepared = true;
        await prepareHttpsCapture(desktopApp);
      }
      media = await GuidebookMedia.start(desktopApp, testInfo, `capture-${protocol}-messages`);
      await media.step('01-filter', '限定本轮消息路径 / Scope this run’s message paths', async () => {
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
      });
      await media.step('02-record', '开启 Recording / Start Recording', async () => { await startRecording(desktopApp); });
      await media.step('03-messages', '发送六条公开消息 / Send six public messages', async () => { await send(requestPath, payloads, true); });
      await media.step('04-select', '选择本轮连接 / Select this run’s connection', async () => { await selectRow(requestPath); });
      await media.step('05-tab', '打开消息页 / Open the messages tab', async () => {
        await getByAutomationId(page, protocol === 'grpc' ? AUTOMATION_IDS.capture.inspector.tab.grpc : AUTOMATION_IDS.capture.inspector.tab.messages).click();
      });
      await media.step('06-direction', protocol === 'grpc'
        ? '选择 Response 消息 / Select response messages' : '选择 Sent 消息 / Select sent messages', async () => {
        await getByAutomationId(page, protocol === 'grpc' ? AUTOMATION_IDS.capture.grpc.responseSide : AUTOMATION_IDS.capture.websocket.directionSent).click();
        await expect(messages()).toHaveCount(6);
      });
      await media.step('07-short', '展开 guide-short / Expand guide-short', async () => {
        await messages().nth(0).click();
        await expect(pane).toContainText('guide-short');
      });
      await media.step('08-short-raw', '选择 Raw 查看原文 / Select Raw to inspect the text', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
        await expect(pane).toContainText('guide-short');
      });
      await media.step('09-copy-short', '复制当前短消息正文 / Copy the current short message body', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
        expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(short);
      });
      await media.step('10-collapse-short', '收起短消息 / Collapse the short message', async () => { await messages().nth(0).click(); });
      await media.step('11-long', '展开 guide-long / Expand guide-long', async () => {
        await messages().nth(1).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
        await expect(pane).toContainText('guide-long');
      });
      await media.step('12-resize', '拖动正文右下角缩小高度 / Drag the body corner to reduce its height', async () => {
        const box = await pane.boundingBox();
        if (!box) throw new Error('The message body is not visible.');
        await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 3, box.y + box.height - 63, { steps: 12 });
        await page.mouse.up();
        await expect.poll(async () => (await pane.boundingBox())?.height).toBeLessThan(box.height - 40);
      });
      await media.step('13-wheel', '在长消息中滚动 / Scroll inside the long message', async () => {
        const before = await pane.textContent();
        await pane.hover({ position: { x: 100, y: 40 } });
        await page.mouse.wheel(0, 400);
        await expect.poll(() => pane.textContent()).not.toBe(before);
      });
      await media.step('14-keyboard-end', '用键盘到达消息末尾 / Reach the message end with the keyboard', async () => {
        await pane.click({ position: { x: 100, y: 40 } });
        await page.keyboard.press('Meta+ArrowDown');
        await expect(pane).toContainText('guide-message-end');
      });
      await media.step('15-scroll-out', '到底后继续滚动消息列表 / Continue scrolling the list at the body boundary', async () => {
        const before = (await scrollViewport(pane)).top;
        await page.mouse.wheel(0, 400);
        await expect.poll(async () => (await scrollViewport(pane)).top).toBeGreaterThan(before);
      });
      await media.step('16-copy-long', '复制完整长消息正文 / Copy the complete long message body', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
        expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(long);
      });
      await media.step('17-payload-copy', protocol === 'grpc'
        ? '使用消息专用 Copy / Use the message-specific Copy'
        : '复制 binary 消息的原始 Hex / Copy the binary message as original Hex', async () => {
        await payloadCopy(messages().nth(1), protocol === 'grpc' ? long : [...Buffer.from(long)].map(byte => byte.toString(16).padStart(2, '0')).join(' '));
      });
      await media.step('18-fullscreen', '全屏查看这条消息 / View this message fullscreen', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      });
      await media.step('19-return', 'Escape 返回同一消息 / Return to the same message with Escape', async () => {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await getByAutomationId(page, protocol === 'grpc' ? AUTOMATION_IDS.capture.inspector.tab.grpc : AUTOMATION_IDS.capture.inspector.tab.messages).hover();
      });
      await media.step('20-paged-input', '在新连接发送205条消息 / Send 205 messages on a new connection', async () => {
        await send(pagedPath, pagePayloads, false);
      });
      await media.step('21-paged-select', '选择新的 pages 连接 / Select the new pages connection', async () => { await selectRow(pagedPath); });
      await media.step('22-paged-tab', '打开新连接的消息 / Open messages for the new connection', async () => {
        await getByAutomationId(page, protocol === 'grpc' ? AUTOMATION_IDS.capture.inspector.tab.grpc : AUTOMATION_IDS.capture.inspector.tab.messages).click();
        await getByAutomationId(page, protocol === 'grpc' ? AUTOMATION_IDS.capture.grpc.responseSide : AUTOMATION_IDS.capture.websocket.directionSent).click();
      });
      const lastMessage = protocol === 'grpc'
        ? getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, 'response', 204))
        : messages().filter({ hasText: 'guide-page-204' });
      await media.step('23-load-pages', '滚动加载后续消息页 / Scroll to load subsequent message pages', async () => {
        const viewport = await scrollViewport(messages().first());
        await page.mouse.move(viewport.x + Math.min(100, viewport.width / 2), viewport.y + Math.min(120, viewport.height / 2));
        await expect.poll(async () => {
          await page.mouse.wheel(0, 5000);
          return lastMessage.isVisible();
        }, { timeout: 20_000 }).toBe(true);
      });
      await media.step('24-last-message', '展开第205条消息 / Expand message 205', async () => {
        await lastMessage.click();
        await expect(pane).toBeVisible();
      });
      if (protocol === 'grpc') {
        await media.step('24a-last-raw', '切到 Raw 查看末条原文 / Switch to Raw for the last message text', async () => {
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
          await expect(pane).toContainText('guide-page-204');
        });
        await media.step('24b-last-visible', '继续滚动使末条正文完整可见 / Continue scrolling to show the whole last message', async () => {
          const viewport = await scrollViewport(pane);
          await page.mouse.move(viewport.x + 8, viewport.y + 80);
          await page.mouse.wheel(0, 500);
          await pane.scrollIntoViewIfNeeded();
          await expect(pane).toBeInViewport({ ratio: 1 });
          await expect(pane).toContainText('guide-page-204');
        });
      } else {
        await expect(pane).toContainText('guide-page-204');
      }
      await media.step('25-copy-last', '复制最后一条并核对 index 204 / Copy the last message and verify index 204', async () => {
        await payloadCopy(lastMessage, pagePayloads[204]!);
      });
      if (protocol === 'grpc') {
        await media.step('26-settings', '返回 Settings / Return to Settings', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click(); });
        await media.step('27-certificates', '打开 Certificates / Open Certificates', async () => { await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click(); });
        await media.step('28-mitm-off', '关闭本轮解密 / Disable this run’s decryption', async () => {
          await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle).click();
          await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
        });
        await media.step('29-origin-remove', '移除自有localhost例外 / Remove the owned localhost exception', async () => {
          await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click();
          await expect(getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'))).toHaveCount(0);
        });
      }
      // 证据：源站完整收发、UI逐页读取和末条Copy共同证明消息没有被首屏截断。
      // Evidence: complete transport, paged UI reading and the last Copy prove the first viewport is not the whole session.
      expect(desktopApp.rendererPageErrors()).toEqual([]);
    } finally {
      try { if (tlsPrepared) await cleanHttpsCapture(desktopApp); }
      finally {
        if (media) await media.stop({
          protocol, filter: prefix, detailPath: requestPath, pagePath: pagedPath,
          firstMessage: short, longMessage: 'guide-long with 28 entries; ending guide-message-end',
          firstCount: '6', pagedCount: '205', finalMessage: pagePayloads[204]!,
          detailEncoding: protocol === 'grpc' ? 'gRPC JSON' : 'binary JSON; body Copy is text, message Copy is Hex',
          pagedEncoding: protocol === 'grpc' ? 'gRPC JSON' : 'WebSocket text',
          tlsScope: protocol === 'grpc' ? 'existing CA; localhost exception removed, decryption stopped' : 'plain WebSocket; no CA changes',
        });
      }
    }
    // 清理：沿用真实Close与宿主guard，回收连接、App进程及8888并保留日常CA。
    // Cleanup: normal Close and the host guard reclaim connections, App processes and port 8888 while preserving the daily CA.
  });
}
