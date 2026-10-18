import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('breakpoints guide records request Header-only, empty Text, product-created Files and response status', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  const prefix = '/guide/request-variants';
  const original = '{"message":"guide-original-request"}';
  const fileBody = '{"message":"guide-file-request","count":2}';
  const binary = Buffer.from([0, 1, 2, 3, 254, 255]);
  const reply = '{"message":"guide-origin-response"}';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-request-'));
  const jsonFile = path.join(directory, 'guide-request.json');
  const binaryFile = path.join(directory, 'guide-request.bin');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  let client: ReturnType<typeof httpTrafficRunner.startAbortableRequestThroughProxy> | undefined;
  let outcome: Promise<unknown> | undefined;
  let completed = false;
  const startPending = async (name: string): Promise<void> => {
    const pathname = `${prefix}/${name}`;
    httpTrafficRunner.respondWith(pathname, { body: reply, headers: { 'content-type': 'application/json' } });
    client = httpTrafficRunner.startAbortableRequestThroughProxy(desktopApp.capturePort(), pathname, { method: 'POST', body: original });
    outcome = client.result.then(result => ({ kind: 'response' as const, result }),
      (error: unknown) => ({ kind: 'error' as const, message: error instanceof Error ? error.message : String(error) }));
    const row = rows.filter({ hasText: pathname });
    await expect(row).toHaveAttribute('data-breakpoint-state', 'head');
    await row.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited)).toBeVisible();
  };
  const forward = async (name: string, expectedBody: Buffer): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    expect(await outcome).toMatchObject({ kind: 'response', result: { statusCode: 200, body: reply } });
    client = undefined;
    expect(httpTrafficRunner.observation(`${prefix}/${name}`)?.body).toEqual(expectedBody);
  };
  // 准备：文件从本轮产品Save body产生；POST规则在Apply前就限制自有Host/Path。
  // Arrange: create input files through this run's Save body and scope the POST Rule before Apply.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  const ruleId = await createRequestBreakpointRule(page, 'Guide request variants', 'POST', prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'breakpoints-request-variants');
  try {
    for (const input of [
      { name: 'json', body: Buffer.from(fileBody), mime: 'application/json', destination: jsonFile },
      { name: 'binary', body: binary, mime: 'application/octet-stream', destination: binaryFile },
    ]) {
      const pathname = `${prefix}/source-${input.name}`;
      httpTrafficRunner.respondWith(pathname, { body: input.body, headers: { 'content-type': input.mime } });
      await media.step(`${input.name}-01-source`, `获取公开${input.name}源文件正文 / Fetch the public ${input.name} source body`, async () => {
        expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), pathname)).statusCode).toBe(200);
      });
      await media.step(`${input.name}-02-select`, '选择源响应 / Select the source response', async () => {
        await rows.filter({ hasText: pathname }).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
      await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), input.destination, () => media.nativeDialogStep(
        `${input.name}-03-save`, `由产品保存${path.basename(input.destination)} / Save ${path.basename(input.destination)} through the product`,
      ));
      await media.step(`${input.name}-04-saved`, '核对实际保存的原始字节 / Verify the actually saved bytes', async () => {
        expect(await readFile(input.destination)).toEqual(input.body);
      });
    }
    await media.step('header-01-pending', '发送并选中Header-only等待项 / Send and select the Header-only pending request', async () => { await startPending('header-only'); });
    await media.step('header-02-off', '明确保持Body Off / Keep Body explicitly Off', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('header-03-add', '添加请求Header行 / Add a request Header row', async () => { await getByAutomationId(page, AUTOMATION_IDS.breakpoints.addHeader).click(); });
    await media.step('header-04-name', '填写x-guide-request / Enter x-guide-request', async () => {
      await page.locator('input[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]').last().fill('x-guide-request');
    });
    await media.step('header-05-value', '填写header-only / Enter header-only', async () => {
      await page.locator('input[data-automation-id^="breakpoints.header."][data-automation-id$=".value"]').last().fill('header-only');
    });
    await media.step('header-06-forward', 'Forward edited后原正文不变 / Forward edited while retaining the original body', async () => {
      await forward('header-only', Buffer.from(original));
      expect(httpTrafficRunner.observation(`${prefix}/header-only`)?.headers['x-guide-request']).toBe('header-only');
    });
    await media.step('empty-01-pending', '发送空Text示例 / Send the empty-Text example', async () => { await startPending('empty-text'); });
    await media.step('empty-02-text', '选择Text但不填写替换 / Choose Text without entering a replacement', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toHaveValue('');
    });
    await media.step('empty-03-forward', '核对HTTP头阶段空Text保持原正文 / Verify empty Text at the HTTP head stage retains the original body', async () => {
      await forward('empty-text', Buffer.from(original));
    });
    for (const input of [
      { name: 'json-file', destination: jsonFile, body: Buffer.from(fileBody) },
      { name: 'binary-file', destination: binaryFile, body: binary },
    ]) {
      await media.step(`${input.name}-01-pending`, '发送本次File等待请求 / Send the File replacement request', async () => { await startPending(input.name); });
      await media.step(`${input.name}-02-mode`, '选择File替换 / Choose File replacement', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.file).click();
      });
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
      await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), input.destination, () => media.nativeDialogStep(
        `${input.name}-03-open`, `选择刚保存的${path.basename(input.destination)} / Select the product-saved ${path.basename(input.destination)}`,
      ));
      await media.step(`${input.name}-04-preview`, '检查实际选择的文件 / Inspect the actually selected file', async () => {
        const selectedFile = getByAutomationId(page, AUTOMATION_IDS.breakpoints.selectedFile);
        await expect(selectedFile).toContainText(path.basename(input.destination));
        await expect(selectedFile).toHaveAttribute('data-file-size', String(input.body.length));
        if (input.name === 'json-file') {
          const preview = getByAutomationId(page, AUTOMATION_IDS.breakpoints.filePreview);
          await preview.scrollIntoViewIfNeeded();
          await expect(preview).toBeInViewport({ ratio: 0.9 });
        } else {
          await selectedFile.scrollIntoViewIfNeeded();
          await expect(selectedFile).toBeInViewport({ ratio: 0.9 });
          await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.filePreview)).toHaveCount(0);
        }
      });
      if (input.name === 'binary-file') {
        await media.step('binary-file-04a-type', '明确将Content-Type改为二进制 / Explicitly change Content-Type to binary', async () => {
          const name = page.locator('input[data-automation-id^="breakpoints.header."][data-automation-id$=".name"][value="content-type" i]');
          await name.locator('..').locator('input[data-automation-id$=".value"]').fill('application/octet-stream');
        });
      }
      await media.step(`${input.name}-05-forward`, '核对源站收到完整文件字节 / Verify the origin received the complete file bytes', async () => {
        await forward(input.name, input.body);
        if (input.name === 'binary-file') expect(httpTrafficRunner.observation(`${prefix}/${input.name}`)?.headers['content-type']).toBe('application/octet-stream');
      });
    }
    await media.step('status-01-rule', '返回同一规则 / Return to the same Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    });
    await media.step('status-02-phase', '切换到响应阶段 / Switch to the response phase', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
    });
    await media.step('status-03-apply', 'Apply响应阶段 / Apply the response phase', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    await media.step('status-04-capture', '返回Capture / Return to Capture', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click(); });
    await media.step('status-05-pending', '发送并等待源站响应头 / Send and wait for response headers', async () => {
      await startPending('response-status');
      expect(httpTrafficRunner.observation(`${prefix}/response-status`)?.body).toEqual(Buffer.from(original));
    });
    await media.step('status-06-code', '将响应状态改为202 / Change response status to 202', async () => {
      await page.locator('#breakpoint-response-status').fill('202');
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.off).click();
    });
    await media.step('status-07-forward', '核对状态改变而响应正文保持 / Verify the status changes while the response body is retained', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
      expect(await outcome).toMatchObject({ kind: 'response', result: { statusCode: 202, body: reply } });
      client = undefined;
    });
    await media.step('finish-01-rule', '返回规则收尾 / Return to the Rule for cleanup', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
      await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    });
    await media.step('finish-02-disable', '停用本轮规则 / Disable this Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('finish-03-apply', 'Apply停用状态 / Apply the disabled state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    });
    // 证据：Header-only/空Text/JSON File/二进制File/响应状态各核对实际线上字节。
    // Evidence: independently verify wire bytes for Header-only, empty Text, JSON File, binary File and status editing.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    client?.abort();
    await outcome;
    await media.stop({
      ruleName: 'Guide request variants', path: prefix, originalRequest: original,
      requestHeader: 'x-guide-request: header-only', jsonFile: 'guide-request.json', jsonFileBody: fileBody,
      binaryFile: 'guide-request.bin', binaryHex: binary.toString('hex'), responseStatus: '202', retainedResponseBody: reply,
      binaryPreview: 'The release shows file metadata without a text preview; forwarding still sends all six bytes',
      httpSnapshot: 'HTTP suspension is at the head stage; Capture may independently provide a readable original preview',
      source: 'Both replacement files are generated by this workflow’s real Save body',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：释放所有自有客户端，正式Close确认代理、CA、进程和8888。
  // Cleanup: release owned clients; real Close verifies proxy/CA, processes and port 8888.
});
