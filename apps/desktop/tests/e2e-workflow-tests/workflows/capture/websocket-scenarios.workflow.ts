import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
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
  desktopApp.configureWorkflowTimeout(testInfo, 120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.websocket' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; exchangeId: string; sent: number; received: number }> = [];

  // 准备：通过产品UI录制，现有客户端与origin经真实代理建立各场景WebSocket。
  // Arrange: start Recording through UI; existing clients and origins establish each WebSocket through the real proxy.
  await startRecording(desktopApp);
  // 截图准备：消息检查不需要展开全量facet，每个连接仍筛选自己的原路径。
  // Screenshot preparation: message inspection does not need expanded global facets; filter each connection by its original path.
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await test.step('websocket-compact-json-tree', async () => {
    const requestPath = '/e2e/websocket/compact-json-tree';
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
    const payload = JSON.stringify({ buildId: 8431, state: 'running', branch: 'main' });
    const client = await trafficLab.webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), requestPath);
    try {
      const receivedMessage = once(client, 'message', { signal: AbortSignal.timeout(5_000) });
      client.sendBinary(Buffer.from(payload));
      const [receivedBytes, receivedBinary] = await receivedMessage;
      expect(receivedBinary).toBe(true);
      expect(receivedBytes).toEqual(Buffer.from(payload));
      await client.closeGracefully(1000, 'tree-complete');

      // 用户操作：通过自产连接和公开控件打开JSON消息的Tree，不注入正文或Store。
      // User actions: open Tree through this captured connection and public controls without injecting body or Store state.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      const rowId = await row.getAttribute('data-automation-id');
      if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing JSON WebSocket identity.');
      const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionSent).click();
      const frames = getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`);
      await expect(frames).toHaveCount(1);
      await frames.click();
      const codePane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
      await expect(codePane).toContainText('branch');
      const compactLayout = await codePane.evaluate((pane) => {
        const lines = Array.from(pane.querySelectorAll('.view-lines > .view-line'));
        if (lines.length === 0) throw new Error('Compact JSON lines are not ready.');
        const boxes = lines.map((line) => line.getBoundingClientRect());
        const style = getComputedStyle(pane);
        const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        const contentHeight = Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top)) + 26;
        return { hostHeight: pane.getBoundingClientRect().height, borderHeight, contentHeight,
          lineCount: lines.length, lineHeight: boxes[0]!.height,
          fontSize: getComputedStyle(lines[0]!).fontSize };
      });
      const compactEvidence = testInfo.outputPath('websocket-compact-code-height.json');
      await writeFile(compactEvidence, JSON.stringify(compactLayout, null, 2), 'utf8');
      await testInfo.attach('websocket-compact-code-height', { path: compactEvidence, contentType: 'application/json' });
      await codePane.screenshot({ path: testInfo.outputPath('websocket-compact-code-height.png') });
      expect(compactLayout).toMatchObject({ lineCount: 5, lineHeight: 20, fontSize: '12px' });
      expect(compactLayout.hostHeight).toBeCloseTo(compactLayout.contentHeight + compactLayout.borderHeight, 1);
      await screenshotStep('WebSocket JSON消息的默认Pretty / Inspect the default Pretty view of the WebSocket JSON message', {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default), label: '1' }],
      });
      const treeMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.tree);
      await treeMode.click();
      await expect(treeMode).toHaveAttribute('aria-checked', 'true');
      const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
      const saveTreeLayout = async (state: string) => {
        const layout = await bodyView.evaluate((viewer) => {
          const pane = viewer.lastElementChild;
          const rows = pane?.firstElementChild;
          if (!(pane instanceof HTMLElement) || !(rows instanceof HTMLElement)) throw new Error('Missing JSON tree pane.');
          const style = getComputedStyle(pane);
          return { paneHeight: pane.getBoundingClientRect().height, rowsHeight: rows.getBoundingClientRect().height,
            visibleRowsHeight: pane.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
            flex: style.flex, overflowY: style.overflowY, text: pane.textContent };
        });
        const filename = testInfo.outputPath(`websocket-tree-${state}.json`);
        await writeFile(filename, JSON.stringify(layout, null, 2), 'utf8');
        await testInfo.attach(`websocket-tree-${state}`, { path: filename, contentType: 'application/json' });
        await bodyView.screenshot({ path: testInfo.outputPath(`websocket-tree-${state}.png`) });
        return layout;
      };
      await screenshotStep('WebSocket JSON消息选择Tree / Select Tree for the WebSocket JSON message', {
        highlights: [{ target: treeMode, label: '1' }],
      });

      // 业务断言与证据：先记录实际可见高度，再核对展开/折叠及原文复制，空白面板不能算通过。
      // Assertions and evidence: save the real visible height before checking expansion and raw Copy; an empty pane cannot pass.
      const expanded = await saveTreeLayout('expanded');
      expect(expanded.rowsHeight).toBe(5 * 22);
      expect(expanded.visibleRowsHeight).toBeGreaterThanOrEqual(expanded.rowsHeight - 1);
      expect(expanded.overflowY).toBe('auto');
      await expect(bodyView).toContainText('buildId');
      await expect(bodyView).toContainText('branch');
      const disclosure = bodyView.locator('button[aria-expanded]');
      await expect(disclosure).toHaveCount(1);
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      const collapsed = await saveTreeLayout('collapsed');
      expect(collapsed.rowsHeight).toBe(22);
      expect(collapsed.visibleRowsHeight).toBeGreaterThanOrEqual(collapsed.rowsHeight - 1);
      expect(collapsed.paneHeight).toBeLessThan(expanded.paneHeight);
      await screenshotStep('折叠WebSocket消息的JSON根节点 / Collapse the JSON root in the WebSocket message', {
        highlights: [{ target: disclosure, label: '1' }],
      });
      await disclosure.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
      await screenshotStep('重新展开JSON根节点并复制原文 / Reopen the JSON root and copy the source', {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy), label: '1' }],
      });

      // 全屏与清理：同一Tree仍有MIME/Save与Header Copy，关闭后保留Tree及展开内容。
      // Fullscreen and cleanup: the same Tree keeps MIME/Save and header Copy, then returns to the expanded inline Tree.
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('application/octet-stream');
      await expect(dialog).toContainText('buildId');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save)).toBeVisible();
      const headerButtons = dialog.locator('header').getByRole('button');
      await expect(headerButtons).toHaveCount(2);
      await headerButtons.first().click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
      await dialog.screenshot({ path: testInfo.outputPath('websocket-tree-fullscreen.png') });
      await screenshotStep('WebSocket Tree全屏并复制同一消息 / Open WebSocket Tree fullscreen and copy the same message', {
        highlights: [{ target: headerButtons.first(), label: '1' }],
      });
      await headerButtons.nth(1).click();
      await expect(dialog).toHaveCount(0);
      await expect(treeMode).toHaveAttribute('aria-checked', 'true');
      const restored = await saveTreeLayout('restored');
      expect(restored.visibleRowsHeight).toBeGreaterThanOrEqual(restored.rowsHeight - 1);
      await screenshotStep('关闭全屏后保留WebSocket Tree / Retain WebSocket Tree after closing fullscreen', {
        highlights: [{ target: treeMode, label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll).click();
      await expect(frames).toHaveCount(2);
      evidence.push({ scenarioId: 'websocket-compact-json-tree', exchangeId, sent: 1, received: 1 });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      await screenshotStep('全屏与清理：同一Tree仍有MIME/Save与Header Copy，关闭后保留Tree及展开内容。 / Fullscreen and cleanup: the same Tree keeps MIME/Save and header Copy, then returns to the expanded inline Tree.');
    } finally {
      if (!client.isClosed()) await client.closeGracefully(1000, 'workflow-cleanup');
    }
  });
  for (const expected of WEBSOCKET_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'websocket') throw new Error(`Missing WebSocket scenario: ${expected.id}`);
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(scenario.defaultDraft.path);
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
      await screenshotStep(`${expected.id}选择WebSocket连接 / Select the ${expected.id} WebSocket connection`, {
        highlights: [{ target: row, label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await screenshotStep(`${expected.id}打开Messages / Open Messages for ${expected.id}`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages), label: '1' }],
      });
      for (const [directionId, payloads] of [
        [AUTOMATION_IDS.capture.websocket.directionSent, expected.sent],
        [AUTOMATION_IDS.capture.websocket.directionReceived, expected.received],
      ] as const) {
        const direction = getByAutomationId(page, directionId);
        await direction.click();
        await expect(direction).toHaveAttribute('aria-checked', 'true');
        await expect(frames).toHaveCount(payloads.length);
        await screenshotStep(`${expected.id}选择${directionId === AUTOMATION_IDS.capture.websocket.directionSent ? 'Sent' : 'Received'}方向 / Select the ${directionId === AUTOMATION_IDS.capture.websocket.directionSent ? 'Sent' : 'Received'} direction for ${expected.id}`, {
          highlights: [{ target: direction, label: '1' }],
        });

        // 业务断言：固定文本或Hex同时显示在消息行与真实Copy结果中，不能串方向或串连接。
        // Product assertions: fixed text or Hex matches both frame previews and actual Copy results without mixing directions or connections.
        for (const payload of payloads) {
          const frame = frames.filter({ hasText: payload });
          await expect(frame).toHaveCount(1);
          if (expected.id === 'ws-binary') {
            const typography = await frame.evaluate((element) => {
              const style = getComputedStyle(element);
              return { height: element.getBoundingClientRect().height, fontSize: style.fontSize,
                lineHeight: style.lineHeight, alignItems: style.alignItems, fontFamily: style.fontFamily,
                columns: Array.from(element.children, (column) => column.getBoundingClientRect().width) };
            });
            const name = directionId === AUTOMATION_IDS.capture.websocket.directionSent ? 'sent' : 'received';
            const filename = testInfo.outputPath(`websocket-binary-row-${name}.json`);
            await writeFile(filename, JSON.stringify(typography, null, 2), 'utf8');
            await testInfo.attach(`websocket-binary-row-${name}`, { path: filename, contentType: 'application/json' });
            await frame.screenshot({ path: testInfo.outputPath(`websocket-binary-row-${name}.png`) });
            expect(typography).toMatchObject({ height: 38, fontSize: '10.5px', lineHeight: 'normal', alignItems: 'center' });
            expect(typography.fontFamily).toContain('JetBrains Mono');
          }
          const frameId = await frame.getAttribute('data-automation-id');
          const sequence = Number(frameId?.slice(framePrefix.length));
          expect(Number.isSafeInteger(sequence)).toBe(true);
          await frame.click();
          const payloadCopy = getByAutomationId(page, AutomationIdFactory.websocketPayloadCopy(exchangeId, sequence));
          const payloadTitle = payloadCopy.locator('..').locator('b');
          await expect(payloadTitle).toBeVisible();
          if (expected.id === 'ws-text') {
            const screenshotPath = testInfo.outputPath(`websocket-${directionId}-title.png`);
            await page.screenshot({ path: screenshotPath });
            await testInfo.attach(`websocket-${directionId}-title`, { path: screenshotPath, contentType: 'image/png' });
          }
          await expect(payloadTitle).not.toContainText('capture.');
          await screenshotStep(`${expected.id}展开当前方向的消息 / Expand a message in the selected ${expected.id} direction`, {
            highlights: [{ target: payloadTitle, label: '1' }],
          });
          await payloadCopy.click();
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
          await screenshotStep(`${expected.id}复制选中消息 / Copy the selected ${expected.id} message`, {
            highlights: [{ target: payloadCopy, label: '1' }],
          });
          await frame.click();
        }
        await screenshotStep(`${expected.id}核对当前方向的消息列表 / Review the message list for the selected ${expected.id} direction`, {
          highlights: [{ target: direction, label: '1' }],
        });
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
            display: style.display, minHeight: style.minHeight, textAlign: style.textAlign,
            alignItems: style.alignItems, justifyContent: style.justifyContent };
        });
        await testInfo.attach('websocket-empty-presentation.json', {
          body: Buffer.from(JSON.stringify(presentation)), contentType: 'application/json',
        });
        expect(presentation).toMatchObject({ hasStateStyles: true, display: 'flex', minHeight: '116px',
          fontSize: '12px', textAlign: 'center', alignItems: 'center', justifyContent: 'center' });
        expect(presentation.color).not.toBe('rgb(0, 0, 0)');
      }
      evidence.push({ scenarioId: expected.id, exchangeId, sent: expected.sent.length, received: expected.received.length });
      await screenshotStep(`${expected.id}选择All查看消息结果 / Select All to inspect the ${expected.id} message results`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll), label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }

  // 预览边界：真实大消息跨过2 MiB，网络保留完整字符，行预览与两种Copy只保留完整前缀。
  // Preview boundary: a real message crosses 2 MiB; forwarding retains every byte while row previews and both Copy actions keep complete characters.
  await test.step('websocket-utf8-preview-boundary', async () => {
    const requestPath = '/e2e/websocket/utf8-preview-boundary';
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
    const visibleText = 'w'.repeat(2 * 1024 * 1024 - 3);
    const payload = `${visibleText}\ud83d\ude42after-preview`;
    const client = await trafficLab.webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), requestPath);
    try {
      client.sendText(payload);
      await client.waitForText(payload);
      expect(trafficLab.webSocketTrafficRunner.hasMessage(payload)).toBe(true);
      await client.closeGracefully(1000, 'utf8-complete');
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      const rowId = await row.getAttribute('data-automation-id');
      if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing UTF-8 WebSocket identity.');
      const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionSent).click();
      const framePrefix = `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.`;
      const frames = getByAutomationIdPrefix(page, framePrefix);
      await expect(frames).toHaveCount(1);
      await expect.poll(() => frames.evaluate((frame) => {
        const text = frame.textContent ?? '';
        const start = text.indexOf('w'.repeat(12));
        const preview = text.slice(start).match(/^w*/)?.[0] ?? '';
        return { length: preview.length, hasReplacementCharacter: text.includes('\ufffd') };
      })).toEqual({ length: visibleText.length, hasReplacementCharacter: false });
      const frameId = await frames.getAttribute('data-automation-id');
      const sequence = Number(frameId?.slice(framePrefix.length));
      expect(Number.isSafeInteger(sequence)).toBe(true);
      await frames.click();
      const expectedClipboard = { length: visibleText.length, digest: createHash('sha256').update(visibleText).digest('hex') };
      const clipboardSummary = () => page.evaluate(async () => {
        const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { length: text.length,
          digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      });
      await getByAutomationId(page, AutomationIdFactory.websocketPayloadCopy(exchangeId, sequence)).click();
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+C');
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      await frames.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.websocket.directionAll).click();
      await expect(frames).toHaveCount(2);
      evidence.push({ scenarioId: 'websocket-utf8-preview-boundary', exchangeId, sent: 1, received: 1 });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    } finally {
      if (!client.isClosed()) await client.closeGracefully(1000, 'workflow-cleanup');
    }
  });

  // 证据与清理：控制帧不制造数据消息；fixture保存trace并验证连接、进程、8888与宿主恢复。
  // Evidence and cleanup: control frames do not create data messages; fixtures save traces and verify connections, processes, port 8888, and host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('websocket-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});