import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

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
  // 截图准备：收起无关facet，各场景只筛选其既有自产路径。
  // Screenshot preparation: collapse unrelated facets and filter each scenario by its existing owned path.
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  for (const expected of TEXT_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing body scenario: ${expected.id}`);
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(scenario.defaultDraft.path);
      if (expected.id === 'body-json') {
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(scenario.defaultDraft.path);
        await screenshotStep('按/playground/body/json筛选同一HTTP示例 / Filter the HTTP example by /playground/body/json', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter), label: '1' }],
        });
      }
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });

      // 产品操作：选择自产Capture行，检查Request正文，再切换Response正文的既有模式。
      // Product actions: select the generated Capture row, inspect its Request body, and select the existing Response mode.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('200');
      const rowId = await row.getAttribute('data-automation-id');
      if (expected.id === 'body-json') {
        await screenshotStep('同一POST进入Capture列表 / The POST appears in the Capture list', {
          highlights: [{ target: row, label: '1' }],
        });
      }
      await row.click();
      if (expected.id === 'body-json') {
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toBeVisible();
        await screenshotStep('选中/playground/body/json请求 / Select the /playground/body/json request', {
          highlights: [{ target: row, label: '1' }],
        });
        const headersTab = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers);
        await headersTab.click();
        for (const [sectionId, values] of [
          [AUTOMATION_IDS.capture.inspector.section.requestHeaders, ['application/json', 'body-json']],
          [AUTOMATION_IDS.capture.inspector.section.responseHeaders, ['application/json']],
        ] as const) {
          const section = getByAutomationId(page, sectionId);
          if (await section.getAttribute('aria-expanded') === 'false') await section.click();
          const contentId = await section.getAttribute('aria-controls');
          if (!contentId) throw new Error('The JSON example omitted its Header content identity.');
          for (const value of values) await expect(page.locator(`[id="${contentId}"]`)).toContainText(value);
        }
        await screenshotStep('检查同一HTTP示例的Headers / Inspect Headers for the same HTTP example', {
          highlights: [{ target: headersTab, label: '1' }],
        });
      }
      if (scenario.defaultDraft.body) {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
        const mode = expected.id === 'body-text' ? 'default' : 'raw';
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
          .toContainText(scenario.defaultDraft.body, { useInnerText: true });
        await screenshotStep(`${expected.id}查看请求正文 / Inspect the ${expected.id} request body`, {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]), label: '1' }],
        });
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody))
        .toContainText(String(Buffer.byteLength(expected.body)));
      const responseMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[expected.mode]);
      await responseMode.click();
      await expect(responseMode).toHaveAttribute('aria-checked', 'true');
      await screenshotStep(`${expected.id}选择响应查看模式 / Select the ${expected.id} response view`, {
        highlights: [{ target: responseMode, label: '1' }],
      });

      // 业务断言：固定正文独立于流量库定义；HTML/SVG不执行，Markdown按真实Preview渲染。
      // Product assertions: body expectations are independent of the traffic library; HTML/SVG stay inert and Markdown renders in Preview.
      if (expected.id === 'body-markdown') {
        const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Capture Lab');
        await expect(bodyView.getByRole('listitem')).toHaveText(['request', 'response']);
        await screenshotStep('Markdown Preview显示Capture Lab及列表 / Markdown Preview shows Capture Lab and its list', {
          highlights: [{ target: responseMode, label: '1' }],
        });

        // Markdown：从Preview用真实键盘选择Split/Source，核对原文和全屏返回。
        // Markdown: use real keyboard navigation from Preview to Split/Source and verify source text and fullscreen return.
        const modes = responseMode.locator('..').getByRole('radio');
        await expect(modes).toHaveCount(4);
        await responseMode.press('ArrowRight');
        await expect(modes.nth(1)).toHaveAttribute('aria-checked', 'true');
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Capture Lab');
        await expect(bodyView).toContainText('# Capture Lab');
        await expect(bodyView).toContainText('- request');
        await screenshotStep('Markdown选择Split，同时查看预览与源码 / Select Markdown Split to inspect preview and source together', {
          highlights: [{ target: modes.nth(1), label: '1' }],
        });

        await modes.nth(1).press('ArrowRight');
        await expect(modes.nth(2)).toHaveAttribute('aria-checked', 'true');
        const sourcePane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await expect(sourcePane).toContainText('# Capture Lab');
        await expect(sourcePane).toContainText('- response');
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveCount(0);
        await screenshotStep('Markdown选择Source查看原文 / Select Markdown Source to inspect the original text', {
          highlights: [{ target: modes.nth(2), label: '1' }],
        });
        const copySource = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
        await copySource.click();
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
          .toBe(expected.body);
        await screenshotStep('在Markdown Source中复制原文 / Copy the original Markdown from Source', {
          highlights: [{ target: copySource, label: '1' }],
        });

        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCount(1);
        await expect(dialog).toBeVisible();
        await expect(sourcePane).toHaveCount(1);
        await expect(dialog.locator(`[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyPane}"]`))
          .toContainText('# Capture Lab');
        await expect(modes.nth(2)).toHaveAttribute('aria-checked', 'true');
        await screenshotStep('Markdown Source打开全屏 / Open Markdown Source fullscreen', {
          highlights: [{ target: modes.nth(2), label: '1' }],
        });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(modes.nth(2)).toHaveAttribute('aria-checked', 'true');
        await expect(sourcePane).toContainText('# Capture Lab');
        await screenshotStep('Escape返回后仍保留Markdown Source / Retain Markdown Source after pressing Escape', {
          highlights: [{ target: modes.nth(2), label: '1' }],
        });
        await responseMode.click();
        await expect(responseMode).toHaveAttribute('aria-checked', 'true');
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Capture Lab');
        await expect(bodyView.getByRole('listitem')).toHaveText(['request', 'response']);
        await screenshotStep('Markdown返回Preview / Return Markdown to Preview', {
          highlights: [{ target: responseMode, label: '1' }],
        });
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

      // JSON：在已验证的同一HTTP响应中切Tree，折叠/展开根节点后复制并返回Raw。
      // JSON: switch the verified HTTP response to Tree, collapse/expand its root, copy it, and return to Raw.
      if (expected.id === 'body-json') {
        const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
        const treeMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.tree);
        await treeMode.click();
        await expect(treeMode).toHaveAttribute('aria-checked', 'true');
        await expect(bodyView).toContainText('ready');
        await expect(bodyView).toContainText('items');
        const disclosures = bodyView.locator('button[aria-expanded]');
        await expect(disclosures).toHaveCount(2);
        await expect(bodyView.getByText('0', { exact: true })).toBeVisible();
        await screenshotStep('HTTP JSON选择Tree查看字段和数组层级 / Select Tree to inspect HTTP JSON fields and array structure', {
          highlights: [{ target: treeMode, label: '1' }],
        });
        const root = disclosures.first();
        await root.click();
        await expect(root).toHaveAttribute('aria-expanded', 'false');
        await expect(disclosures).toHaveCount(1);
        await expect(bodyView).not.toContainText('ready');
        await screenshotStep('折叠HTTP JSON根节点 / Collapse the HTTP JSON root', {
          highlights: [{ target: root, label: '1' }],
        });
        await root.click();
        await expect(root).toHaveAttribute('aria-expanded', 'true');
        await expect(disclosures).toHaveCount(2);
        await expect(bodyView).toContainText('ready');
        await expect(bodyView.getByText('0', { exact: true })).toBeVisible();
        await screenshotStep('重新展开HTTP JSON根节点 / Expand the HTTP JSON root again', {
          highlights: [{ target: root, label: '1' }],
        });
        const copyTree = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
        await copyTree.click();
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
          .toBe(expected.body);
        await screenshotStep('在HTTP JSON Tree中复制同一份原文 / Copy the same source from HTTP JSON Tree', {
          highlights: [{ target: copyTree, label: '1' }],
        });
        await responseMode.click();
        await expect(responseMode).toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expected.body);
        await screenshotStep('HTTP JSON从Tree返回Raw / Return HTTP JSON from Tree to Raw', {
          highlights: [{ target: responseMode, label: '1' }],
        });

        // 同一请求：继续Hex与全屏，不用另一个示例拼出入门操作顺序。
        // Same request: continue through Hex and fullscreen without combining different examples.
        const hexMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex);
        await hexMode.click();
        await expect(hexMode).toHaveAttribute('aria-checked', 'true');
        await expect(bodyView).toContainText('00000000');
        await expect(bodyView).toContainText('7b 22');
        await screenshotStep('同一HTTP JSON切换Hex / Select Hex for the same HTTP JSON', {
          highlights: [{ target: hexMode, label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCount(1);
        await expect(dialog).toBeVisible();
        await expect(hexMode).toHaveAttribute('aria-checked', 'true');
        await expect(dialog).toContainText('7b 22');
        await screenshotStep('同一HTTP JSON在Hex中打开全屏 / Open the same HTTP JSON fullscreen in Hex', {
          highlights: [{ target: hexMode, label: '1' }],
        });
        await responseMode.click();
        await expect(responseMode).toHaveAttribute('aria-checked', 'true');
        const fullscreenPane = dialog.locator(`[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyPane}"]`);
        await expect(fullscreenPane).toContainText(expected.body);
        const headerCopy = dialog.locator('header').getByRole('button').first();
        await headerCopy.click();
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
          .toBe(expected.body);
        await screenshotStep('全屏切回Raw并复制同一JSON原文 / Return to Raw in fullscreen and copy the same JSON source', {
          highlights: [{ target: headerCopy, label: '1' }],
        });
        // Copy提示也响应Escape；先把真实键盘焦点交回弹窗内无提示的模式按钮。
        // Copy's tooltip also handles Escape; return keyboard focus to the dialog's tooltip-free mode control first.
        const fullscreenRawMode = dialog.locator(`[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyMode.raw}"]`);
        await fullscreenRawMode.click();
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        await expect(fullscreenRawMode).toBeFocused();
        await expect(fullscreenRawMode).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(responseMode).toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expected.body);
        await expect(row).toHaveAttribute('data-automation-id', rowId!);
        await screenshotStep('从Raw模式控件按Escape返回同一HTTP请求 / Press Escape from the Raw mode control to return to the same HTTP request', {
          highlights: [{ target: responseMode, label: '1' }],
        });
        await testInfo.attach('body-json-example.json', {
          body: Buffer.from(JSON.stringify({
            url: trafficLab.httpTrafficRunner.url(scenario.defaultDraft.path),
            method: scenario.defaultDraft.method,
            requestBody: scenario.defaultDraft.body,
            responseBody: expected.body,
            statusCode: result.response!.statusCode,
            row: rowId,
          }, null, 2), 'utf8'),
          contentType: 'application/json',
        });
      }
      await expect(row).toHaveCount(1);
      evidence.push({ scenarioId: expected.id, row: await row.getAttribute('data-automation-id'), bytes: Buffer.byteLength(expected.body) });
      await screenshotStep(`${expected.id}核对响应内容 / Verify the ${expected.id} response content`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }
  await screenshotStep('准备：经产品UI开启Recording，场景只负责向真实代理发送流量。 / Arrange: start Recording through product UI; scenarios only send traffic to the real proxy.');

  // 截断边界：真实响应使2 MiB落在多字节字符内，只比较剪贴板摘要，不向trace返回完整大正文。
  // Truncation boundary: real responses split UTF-8 characters at 2 MiB; compare clipboard digests without returning large bodies to the trace.
  const previewLimit = 2 * 1024 * 1024;
  for (const boundary of [
    { id: 'two-byte', character: '\u00e9', partialBytes: 1, mime: 'text/plain; charset=utf-8', mode: 'default' },
    { id: 'three-byte', character: '\u4e2d', partialBytes: 2, mime: 'application/x-interceptor-text', mode: 'default' },
    { id: 'four-byte', character: '\ud83d\ude42', partialBytes: 3, mime: 'text/javascript; charset=utf-8', mode: 'raw' },
  ] as const) {
    await test.step(`utf8-preview-${boundary.id}`, async () => {
      const requestPath = `/e2e/body-preview/${boundary.id}`;
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
      const visibleText = 'a'.repeat(previewLimit - boundary.partialBytes);
      const body = Buffer.from(`${visibleText}${boundary.character}after-preview`);
      trafficLab.httpTrafficRunner.respondWith(requestPath, { headers: { 'content-type': boundary.mime }, body });
      const response = await trafficLab.httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
      expect(response.statusCode).toBe(200);
      expect(Buffer.byteLength(response.body)).toBe(body.byteLength);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const mode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[boundary.mode]);
      await mode.click();
      await expect(mode).toHaveAttribute('aria-checked', 'true');
      const previewNote = page.locator(
        `[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyView}"] > div:has(> svg)`,
      ).first();
      await expect(previewNote).toBeVisible();
      const noteLayout = await previewNote.evaluate((note) => {
        const style = getComputedStyle(note);
        const box = note.getBoundingClientRect();
        const iconBox = note.querySelector('svg')!.getBoundingClientRect();
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          bodyLineHeight: style.getPropertyValue('--interceptor-line-height'),
          padding: style.padding,
          gap: style.gap,
          iconCenterDelta: iconBox.y + iconBox.height / 2 - box.y - box.height / 2,
          pixelRatio: devicePixelRatio,
        };
      });
      expect(noteLayout).toMatchObject({ fontSize: '11.5px', padding: '9px 11px', gap: '8px' });
      expect(Number.parseFloat(noteLayout.lineHeight)).toBeCloseTo(11.5 * Number.parseFloat(noteLayout.bodyLineHeight), 2);
      expect(Math.abs(noteLayout.iconCenterDelta)).toBeLessThanOrEqual(1 / noteLayout.pixelRatio);
      await testInfo.attach(`${boundary.id}-preview-note-layout`, { body: Buffer.from(JSON.stringify(noteLayout)), contentType: 'application/json' });
      await testInfo.attach(`${boundary.id}-preview-note`, { body: await previewNote.screenshot(), contentType: 'image/png' });
      const expectedClipboard = {
        length: visibleText.length,
        tail: 'a'.repeat(12),
        digest: createHash('sha256').update(visibleText).digest('hex'),
      };
      const clipboardSummary = () => page.evaluate(async () => {
        const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { length: text.length, tail: text.slice(-12),
          digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
      await bodyPane.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+C');
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      evidence.push({ scenarioId: `utf8-preview-${boundary.id}`, row: await row.getAttribute('data-automation-id'), bytes: body.byteLength });

      // 原始保存：文件由产品Save产生，包含完整尾字符和预览范围以外的字节。
      // Raw export: the product Save action must retain the complete character and bytes beyond the preview limit.
      if (boundary.id === 'four-byte' && ['win32', 'darwin'].includes(process.platform)) {
        const destination = testInfo.outputPath('utf8-full-body.txt');
        try {
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
          await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), destination);
          await expect.poll(async () => {
            try { return createHash('sha256').update(await readFile(destination)).digest('hex'); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
              throw error;
            }
          }).toBe(createHash('sha256').update(body).digest('hex'));
        } finally {
          await rm(destination, { force: true });
        }
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      await screenshotStep('原始保存：文件由产品Save产生，包含完整尾字符和预览范围以外的字节。 / Raw export: the product Save action must retain the complete character and bytes beyond the preview limit.');
    });
  }
  await screenshotStep('截断边界：真实响应使2 MiB落在多字节字符内，只比较剪贴板摘要，不向trace返回完整大正文。 / Truncation boundary: real responses split UTF-8 characters at 2 MiB; compare clipboard digests without returning large bodies to the trace.');

  // 证据与清理：保存逐场景公开身份；fixture保存trace并关闭origin、Main/Core/Worker及恢复宿主。
  // Evidence and cleanup: retain public scenario identities; fixtures save traces, close origins and product processes, and restore the host.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('body-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});