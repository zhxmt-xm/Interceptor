import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request, type ClientRequest, type IncomingHttpHeaders } from 'node:http';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

interface GuideResponse {
  readonly statusCode: number | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

test('breakpoints guide records response headers, Text and a product-saved File', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/response';
  const requestBody = '{"request":"guide-response"}';
  const originBody = '{"message":"origin-response","orderId":"guide-response-001"}';
  const replacement = '{"message":"text-from-guide","orderId":"guide-response-001"}';
  const fileBody = '{\n  "message": "file-from-product",\n  "orderId": "guide-response-001"\n}';
  const filePath = testInfo.outputPath('guide-files', 'guide-response.json');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const requests = new Set<ClientRequest>();
  const responses: { path: string; statusCode: number | undefined; headers: IncomingHttpHeaders; bodyBase64: string }[] = [];
  let pending: Promise<GuideResponse> | undefined;
  let clientCompleted = false;
  let savedBody: Buffer | undefined;
  const send = (requestPath: string, method = 'POST'): Promise<GuideResponse> => {
    clientCompleted = false;
    const body = method === 'POST' ? requestBody : '';
    const result = new Promise<GuideResponse>((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1', port: desktopApp.capturePort(), method,
        path: httpTrafficRunner.url(requestPath),
        headers: {
          host: `127.0.0.1:${httpTrafficRunner.port}`, connection: 'close',
          'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)),
        },
      }, incoming => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        incoming.on('error', reject);
        incoming.on('aborted', () => reject(new Error('The guide response was aborted.')));
        incoming.on('end', () => {
          clientCompleted = true;
          const response = { statusCode: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) };
          responses.push({ path: requestPath, statusCode: response.statusCode,
            headers: response.headers, bodyBase64: response.body.toString('base64') });
          resolve(response);
        });
      });
      requests.add(outgoing);
      outgoing.once('close', () => requests.delete(outgoing));
      outgoing.on('error', reject);
      outgoing.end(body);
    });
    void result.catch(() => undefined);
    return result;
  };
  const pausedRow = (requestPath: string) => rows.filter({ hasText: requestPath });
  const assertPaused = async (requestPath: string): Promise<void> => {
    await expect(pausedRow(requestPath)).toHaveAttribute('data-breakpoint-state', 'head');
    await expect(pausedRow(requestPath)).toHaveAttribute('data-queue-key', 'http');
    await expect.poll(() => httpTrafficRunner.observation(requestPath)?.body.toString('utf8')).toBe(requestBody);
    expect(clientCompleted).toBe(false);
  };

  // 准备：规则草稿由既有UI helper创建；所有替换文件都必须由本轮产品保存。
  // Arrange: create the Rule with the existing UI helper; only this run's product may create the replacement file.
  await mkdir(testInfo.outputPath('guide-files'), { recursive: true });
  await startRecording(desktopApp);
  const ruleId = await createRequestBreakpointRule(page, 'Guide response breakpoint', 'POST');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 2, 'value')).fill(prefix);
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  httpTrafficRunner.respondWith(`${prefix}/source`, {
    headers: { 'content-type': 'application/json' }, body: Buffer.from(fileBody),
  });
  for (const suffix of ['header-only', 'text', 'file']) {
    httpTrafficRunner.respondWith(`${prefix}/${suffix}`, {
      headers: { 'content-type': 'application/json', 'x-guide-response': 'original' },
      body: Buffer.from(originBody),
    });
  }
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-response');
  try {
    // 用户操作：先从产品保存正文，再切换响应阶段并分别编辑Header、Text和File。
    // User actions: save a body through the product, then select response phase and edit Header, Text and File.
    await media.step('01-source', '获取可保存的示例响应 / Fetch the source response', async () => {
      expect((await send(`${prefix}/source`, 'GET')).body).toEqual(Buffer.from(fileBody));
      await expect(pausedRow(`${prefix}/source`)).toBeVisible();
    });
    await media.step('02-select-source', '选中 source 请求 / Select the source request', async () => {
      await pausedRow(`${prefix}/source`).click();
    });
    await media.step('03-response-body', '打开 Response 正文 / Open the Response body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('file-from-product');
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath, () => media.nativeDialogStep(
      '04-save-dialog', 'Save body 保存 guide-response.json / Save body as guide-response.json',
    ));
    await media.step('05-saved-body', '确认产品保存了完整正文 / Verify the product-saved body', async () => {
      await expect.poll(async () => {
        try { return await readFile(filePath, 'utf8'); }
        catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
          throw error;
        }
      }).toBe(fileBody);
      savedBody = await readFile(filePath);
      expect(savedBody).toEqual(Buffer.from(fileBody));
    });
    await media.step('06-rules', '打开 Guide response breakpoint / Open the response Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Guide response breakpoint');
    });
    await media.step('07-phase-menu', '展开断点阶段 / Open the breakpoint phase options', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response'))).toBeVisible();
    });
    await media.step('08-response-phase', '选择 response 阶段 / Select response phase', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeEnabled();
    });
    await media.step('09-apply', 'Apply 响应断点 / Apply the response breakpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    });
    await media.step('10-capture', '返回 Capture / Return to Capture', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    });
    await media.step('11-header-paused', '发出 header-only 并等待响应 / Pause the header-only response', async () => {
      pending = send(`${prefix}/header-only`);
      await assertPaused(`${prefix}/header-only`);
    });
    await media.step('12-select-header', '选中响应断点 / Select the paused response', async () => {
      await pausedRow(`${prefix}/header-only`).click();
      await expect(page.locator('#breakpoint-response-status')).toHaveValue('200');
    });
    await media.step('13-body-off', '保持 Body Off / Keep body replacement Off', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('14-header-value', '仅修改 x-guide-response / Edit only x-guide-response', async () => {
      const names = page.locator('[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]');
      const headerNames = await names.all();
      let edited = false;
      for (const name of headerNames) {
        if (await name.inputValue() !== 'x-guide-response') continue;
        const id = await name.getAttribute('data-automation-id');
        if (!id) throw new Error('The response Header omitted its public identity.');
        await getByAutomationId(page, id.replace(/\.name$/, '.value')).fill('header-only-guide');
        edited = true;
        break;
      }
      expect(edited).toBe(true);
      await expect(names).toHaveCount(headerNames.length);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('15-header-forward', 'Forward edited，正文保持原样 / Forward the Header edit without changing body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      const response = await pending!;
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-guide-response']).toBe('header-only-guide');
      expect(response.body).toEqual(Buffer.from(originBody));
      expect(httpTrafficRunner.observation(`${prefix}/header-only`)?.body).toEqual(Buffer.from(requestBody));
      await expect(pausedRow(`${prefix}/header-only`)).not.toHaveAttribute('data-breakpoint-id');
    });
    await media.step('16-text-paused', '发出 Text 示例响应 / Pause the Text example response', async () => {
      pending = send(`${prefix}/text`);
      await assertPaused(`${prefix}/text`);
    });
    await media.step('17-select-text', '选中 Text 示例 / Select the Text example', async () => {
      await pausedRow(`${prefix}/text`).click();
      await expect(page.locator('#breakpoint-response-status')).toHaveValue('200');
    });
    await media.step('18-text-mode', '选择 Text / Choose Text replacement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeVisible();
    });
    await media.step('19-text-value', '输入 text-from-guide / Enter text-from-guide', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(replacement);
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue(replacement);
    });
    await media.step('20-text-forward', 'Forward edited，核对 Text 字节 / Forward and verify the Text bytes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      const response = await pending!;
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(Buffer.from(replacement));
      expect(httpTrafficRunner.observation(`${prefix}/text`)?.body).toEqual(Buffer.from(requestBody));
      await expect(pausedRow(`${prefix}/text`)).not.toHaveAttribute('data-breakpoint-id');
    });
    await media.step('21-file-paused', '发出 File 示例响应 / Pause the File example response', async () => {
      pending = send(`${prefix}/file`);
      await assertPaused(`${prefix}/file`);
    });
    await media.step('22-select-file', '选中 File 示例 / Select the File example', async () => {
      await pausedRow(`${prefix}/file`).click();
      await expect(page.locator('#breakpoint-response-status')).toHaveValue('200');
    });
    await media.step('23-file-mode', '选择 File / Choose File replacement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.file).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile)).toBeVisible();
    });
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath, () => media.nativeDialogStep(
      '24-open-dialog', '选择产品保存的 guide-response.json / Select the product-saved guide-response.json',
    ));
    await media.step('25-file-preview', '折叠响应头，完整查看文件预览 / Collapse Headers to read the File preview', async () => {
      const selected = getByAutomationId(page, AUTOMATION_IDS.breakpoints.selectedFile);
      const preview = getByAutomationId(page, AUTOMATION_IDS.breakpoints.filePreview);
      const contentId = await getByAutomationId(page, AUTOMATION_IDS.breakpoints.addHeader)
        .locator('xpath=ancestor::div[@id][1]').getAttribute('id');
      if (!contentId) throw new Error('The response Headers omitted their public section relationship.');
      const headerToggle = page.locator(`[aria-controls="${contentId}"]`);
      await expect(headerToggle).toHaveAttribute('aria-expanded', 'true');
      await headerToggle.click();
      await expect(headerToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(selected).toHaveAttribute('data-file-name', 'guide-response.json');
      await expect(selected).toHaveAttribute('data-file-size', String(Buffer.byteLength(fileBody)));
      await expect(preview).toBeInViewport({ ratio: 1 });
      await expect(preview).toContainText('file-from-product');
      await expect(preview).toContainText('guide-response-001');
    });
    await media.step('26-file-forward', 'Forward edited，核对完整文件字节 / Forward and verify the complete file bytes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      const response = await pending!;
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(savedBody);
      expect(response.body).toEqual(Buffer.from(fileBody));
      expect(httpTrafficRunner.observation(`${prefix}/file`)?.body).toEqual(Buffer.from(requestBody));
      await expect(pausedRow(`${prefix}/file`)).not.toHaveAttribute('data-breakpoint-id');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');
    });
    await media.step('27-cleanup-rule', '返回响应规则 / Return to the response Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('28-disable', '停用响应断点 / Disable the response breakpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('29-apply-disabled', 'Apply 停用状态 / Apply the disabled state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    });
  } finally {
    // 证据与清理：保存真实两端字节；只取消本轮客户端，App由driver正常Close并验证宿主恢复。
    // Evidence and cleanup: retain real wire bytes; cancel only owned clients and let the driver Close and verify restoration.
    for (const outgoing of requests) outgoing.destroy(new Error('The guide workflow is closing its client.'));
    await media.stop({
      rule: 'Guide response breakpoint', path: prefix, method: 'POST', phase: 'response',
      requestBody, originBody, headerName: 'x-guide-response', headerValue: 'header-only-guide',
      textReplacement: replacement, fileName: 'guide-response.json', fileBody,
      origin: httpTrafficRunner.url(),
    });
    const evidencePath = testInfo.outputPath('response-wire-evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      origin: httpTrafficRunner.evidence(), responses,
      fileName: 'guide-response.json', savedBodyBase64: savedBody?.toString('base64'),
    }, null, 2), 'utf8');
    await testInfo.attach('response-wire-evidence', { path: evidencePath, contentType: 'application/json' });
  }
});
