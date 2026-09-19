import { readFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

const MEDIA_SCENARIOS = [
  { id: 'body-png', kind: 'image', bytes: 68, mime: 'image/png', hex: '' },
  { id: 'body-binary', kind: 'hex', bytes: 8, mime: 'application/octet-stream', hex: '000102037f80feff' },
  { id: 'body-unknown-binary', kind: 'hex', bytes: 5, mime: '', hex: '009f9296ff' },
  { id: 'body-audio', kind: 'save', bytes: 48, mime: 'audio/wav', hex: '524946462800000057415645666d74201000000001000100401f0000401f000001000800646174610400000080a06080' },
  { id: 'body-video', kind: 'save', bytes: 24, mime: 'video/mp4', hex: '000000186674797069736f6d0000000069736f6d6d703431' },
] as const;

test('capture.scenarios.body-media previews images and hex and saves media without loading players', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.body-media' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; bytes: number; verification: string }> = [];

  // 准备：真实UI开启Recording；正文由已有场景经网络产生，不预造Capture输入。
  // Arrange: enable Recording through UI; existing scenarios create bodies through the network without seeding Capture.
  await startRecording(desktopApp);
  for (const expected of MEDIA_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing media scenario: ${expected.id}`);
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200, bodyBytes: expected.bytes } });
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('200');
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const section = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody);
      await expect(section).toContainText(String(expected.bytes));
      const bodyId = await section.getAttribute('aria-controls');
      if (!bodyId) throw new Error('Missing response body section.');
      const body = page.locator(`[id="${bodyId}"]`);

      // 产品断言：PNG必须真实解码；二进制按实际字节显示Hex；音视频仅显示MIME和保存动作。
      // Product assertions: PNG decodes, binary bytes appear in Hex, and audio/video expose MIME and Save without players.
      if (expected.kind === 'image') {
        const image = body.locator('img');
        await expect(image).toHaveCount(1);
        await expect(image).toHaveJSProperty('complete', true);
        await expect(image).toHaveJSProperty('naturalWidth', 1);
        await expect(image).toHaveJSProperty('naturalHeight', 1);
        await testInfo.attach('png-preview', { body: await body.screenshot(), contentType: 'image/png' });
      } else if (expected.kind === 'hex') {
        const hexMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex);
        await expect(hexMode).toHaveAttribute('aria-checked', 'true');
        const bytes = expected.hex.match(/../g)!.join(' ');
        await expect(body).toContainText(bytes);
      } else {
        await expect(body).toContainText(expected.mime);
        await expect(body.locator('audio, video, iframe')).toHaveCount(0);
        const save = body.getByRole('button');
        await expect(save).toHaveCount(1);
        const layout = await save.evaluate((button) => {
          const host = button.parentElement!;
          const content = host.firstElementChild!;
          const icon = content.firstElementChild!;
          const details = content.lastElementChild!;
          const mime = details.querySelector('b')!;
          const size = details.querySelector('span')!;
          const hostBox = host.getBoundingClientRect();
          return {
            contentGap: getComputedStyle(content).gap,
            detailGap: getComputedStyle(details).gap,
            actionGap: getComputedStyle(host).gap,
            actionHeight: button.getBoundingClientRect().height,
            mimeFontSize: getComputedStyle(mime).fontSize,
            mimeLineHeight: getComputedStyle(mime).lineHeight,
            sizeFontSize: getComputedStyle(size).fontSize,
            sizeLineHeight: getComputedStyle(size).lineHeight,
            bodyLineHeight: getComputedStyle(size).getPropertyValue('--interceptor-line-height'),
            centerDeltas: [icon, ...details.children, button].map((element) => {
              const box = element.getBoundingClientRect();
              return box.x + box.width / 2 - hostBox.x - hostBox.width / 2;
            }),
            pixelRatio: devicePixelRatio,
          };
        });
        expect(layout).toMatchObject({
          contentGap: '10px', detailGap: '7px', actionGap: '13px', actionHeight: 28,
          mimeFontSize: '13px', mimeLineHeight: 'normal', sizeFontSize: '11.5px',
        });
        expect(Number.parseFloat(layout.sizeLineHeight)).toBeCloseTo(11.5 * Number.parseFloat(layout.bodyLineHeight), 2);
        for (const centerDelta of layout.centerDeltas) expect(Math.abs(centerDelta)).toBeLessThanOrEqual(1 / layout.pixelRatio);
        await testInfo.attach(`${expected.id}-layout`, { body: Buffer.from(JSON.stringify(layout)), contentType: 'application/json' });
        await testInfo.attach(`${expected.id}-placeholder`, { body: await body.screenshot(), contentType: 'image/png' });
        const destination = testInfo.outputPath(`${expected.id}.${expected.id === 'body-audio' ? 'wav' : 'mp4'}`);

        // 原生保存：真实点击唯一Save并操作系统对话框，只读核对产品生成文件的独立预期字节。
        // Native export: click Save and use the real system dialog, then read the product-generated file against independent expected bytes.
        await save.click();
        await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), destination);
        await expect.poll(async () => {
          try { return (await readFile(destination)).toString('hex'); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
          }
        }).toBe(expected.hex);
      }
      evidence.push({ scenarioId: expected.id, bytes: expected.bytes, verification: expected.kind });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }

  // 证据与清理：产品无page error；fixture保存trace并验证原生对话框、进程、8888及宿主恢复。
  // Evidence and cleanup: require zero page errors; fixtures retain traces and verify native dialogs, processes, port 8888, and host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('body-media-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});