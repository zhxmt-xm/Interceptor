import { writeFile } from 'node:fs/promises';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer guide records response auto formatting failure preservation and the exact preview limit', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const language = await page.locator('html').getAttribute('lang');
  if (!language) throw new Error('The ready App omitted its language.');
  const previewLimit = 2 * 1024 * 1024;
  const scenarios = [
    {
      id: 'html', name: 'Guide HTML response',
      contentType: 'text/html; charset=utf-8',
      body: '<main><section><p>guide-html</p></section></main>',
    },
    {
      id: 'javascript', name: 'Guide JavaScript response',
      contentType: 'application/javascript; charset=utf-8',
      body: 'function guideExample(){const count=2;return {count};}',
    },
    {
      id: 'xml', name: 'Guide XML source',
      contentType: 'application/xml',
      body: '<root><',
    },
    {
      id: 'large', name: 'Guide large JSON',
      contentType: 'application/json',
      body: JSON.stringify({ message: 'guide-large-response', padding: 'z'.repeat(previewLimit) }),
    },
  ] as const;
  const format = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.format);
  const copy = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.copy);
  const requestIds: string[] = [];
  const summaries: Array<{
    id: string;
    length: number;
    lineCount: number;
    prefix: string;
    suffix: string;
  }> = [];
  const copySummary = async () => {
    await copy.click();
    return page.evaluate(async () => {
      const text = await navigator.clipboard.readText();
      return {
        length: text.length, lineCount: text.split('\n').length,
        prefix: text.slice(0, 100), suffix: text.slice(-100),
      };
    });
  };

  // 准备：只返回本轮自有HTTP内容，四个路径独立，不写入或损坏任何导入文件。
  // Arrange: serve only owned HTTP content at four separate paths, without creating or corrupting import files.
  for (const scenario of scenarios) {
    httpTrafficRunner.respondWith(`/guide/response-formatting/${scenario.id}`, {
      headers: { 'content-type': scenario.contentType }, body: scenario.body,
    });
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  const errorsBefore = desktopApp.rendererPageErrors();
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-response-formatting');
  try {
    // 用户操作：分别创建、命名、发送并复制真实响应，每个动作保留对应原生窗口图。
    // User actions: create, name, send and copy each real response, retaining a native-window image per step.
    for (const scenario of scenarios) {
      const requestPath = `/guide/response-formatting/${scenario.id}`;
      let requestId = '';
      await media.step(`${scenario.id}-01-new`, `新建${scenario.name} / Create ${scenario.name}`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
        const identity = await row.getAttribute('data-automation-id');
        if (!identity?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) {
          throw new Error('The new response example omitted its public request ID.');
        }
        requestId = identity.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
        requestIds.push(requestId);
      });
      await media.step(`${scenario.id}-02-name`, `命名${scenario.name} / Name ${scenario.name}`, async () => {
        await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(requestId)).click({ button: 'right' });
        await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename')).click();
        const input = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(requestId));
        await input.fill(scenario.name);
        await input.press('Enter');
      });
      await media.step(`${scenario.id}-03-url`, `填写${scenario.id}实际地址 / Enter the actual ${scenario.id} URL`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(requestPath));
      });
      await media.step(`${scenario.id}-04-send`, `发送并读取${scenario.id}响应 / Send and read the ${scenario.id} response`, async () => {
        await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
        await expect.poll(() => httpTrafficRunner.observation(requestPath)?.method).toBe('GET');
        if (scenario.id === 'large') await expect(format).toBeDisabled();
        else await expect(format).toBeEnabled();
      });
      if (scenario.id === 'xml') {
        await media.step('xml-05-format', '尝试Format并保留无效XML原文 / Try Format and retain the invalid XML source', async () => {
          await format.click();
          await expect(format).toBeEnabled();
          expect(desktopApp.rendererPageErrors()).toEqual(errorsBefore);
        });
      }
      await media.step(`${scenario.id}-06-copy`, `Copy核对${scenario.id}的实际显示 / Copy and verify the actual ${scenario.id} view`, async () => {
        if (scenario.id === 'html') {
          await expect.poll(async () => (await copySummary()).lineCount).toBeGreaterThan(1);
        } else if (scenario.id === 'javascript') {
          await expect.poll(async () => (await copySummary()).prefix).not.toBe(scenario.body);
        }
        const summary = await copySummary();
        if (scenario.id === 'html') {
          expect(summary.prefix).toContain('<main>');
          expect(summary.prefix).toContain('guide-html');
          expect(summary.suffix.trimEnd()).toMatch(/<\/main>$/);
        } else if (scenario.id === 'javascript') {
          expect(summary.prefix).toContain('function guideExample() {');
          expect(summary.suffix).toContain('return { count };');
        } else if (scenario.id === 'xml') {
          expect(summary).toEqual({
            length: scenario.body.length, lineCount: 1,
            prefix: scenario.body, suffix: scenario.body,
          });
        } else {
          expect(summary.length).toBe(previewLimit);
          expect(summary.prefix).toBe(scenario.body.slice(0, 100));
          expect(scenario.body.length).toBeGreaterThan(summary.length);
          await expect(format).toBeDisabled();
        }
        summaries.push({ id: scenario.id, ...summary });
      });
    }
    await media.step('restore-html', '切回HTML保留原格式化视图 / Return to HTML and retain its formatted view', async () => {
      const firstId = requestIds[0];
      const firstSummary = summaries[0];
      if (!firstId || !firstSummary) throw new Error('The original HTML example is missing.');
      await getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(firstId)).click();
      const restored = await copySummary();
      expect(restored).toEqual({
        length: firstSummary.length, lineCount: firstSummary.lineCount,
        prefix: firstSummary.prefix, suffix: firstSummary.suffix,
      });
    });

    // 业务断言与证据：真实源站四次请求，XML未引入异常，Copy只是当前预览。
    // Assertions and evidence: exactly four real origin requests, no XML-induced error, and Copy represents the current preview.
    expect(httpTrafficRunner.evidence()).toHaveLength(scenarios.length);
    expect(desktopApp.rendererPageErrors()).toEqual(errorsBefore);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    const evidence = testInfo.outputPath('response-formatting.json');
    await writeFile(evidence, JSON.stringify({ previewLimit, summaries, origin: httpTrafficRunner.evidence() }, null, 2), 'utf8');
    await testInfo.attach('response-formatting.json', { path: evidence, contentType: 'application/json' });
  } finally {
    // 清理：封存真实片段，原driver继续执行正常Close、进程/端口退出及宿主恢复。
    // Cleanup: finalize the actual recording; the existing driver verifies normal Close, process/port exit and host restoration.
    await media.stop({
      baseUrl: httpTrafficRunner.url('/guide/response-formatting'),
      html: scenarios[0].body, javascript: scenarios[1].body, invalidXml: scenarios[2].body,
      previewLimitBytes: String(previewLimit), largeJsonBytes: String(scenarios[3].body.length),
      largeJsonMarker: 'guide-large-response',
      scope: 'HTML/JavaScript auto formatting, XML failure preservation, oversized preview and response-scoped view restoration',
    });
  }
});
