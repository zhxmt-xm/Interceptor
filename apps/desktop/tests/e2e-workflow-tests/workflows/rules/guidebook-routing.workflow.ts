import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { cleanHttpsCapture, prepareHttpsCapture } from '../../fixtures/ui/https-capture';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('rules guide records Map Remote scheme/host/port and recovery from a missing Map Local file', async ({
  desktopApp, httpTrafficRunner, trafficLab,
}, testInfo) => {
  test.setTimeout(420_000);
  const { page } = desktopApp;
  const prefix = '/guide/map-routing';
  const sourcePath = `${prefix}/remote-source`;
  const targetPath = `${prefix}/remote-target`;
  const fileBody = '{"message":"guide-local-file"}';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-map-'));
  const file = path.join(directory, 'guide-map-local.json');
  const missing = path.join(directory, 'guide-missing.json');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  let ruleId = '';
  let media: GuidebookMedia | undefined;
  let tlsPrepared = false;
  let completed = false;
  let sourceUrl = '';
  const card = () => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).locator('../..');
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  const editRule = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  };
  const show = async (pathname: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await rows.filter({ hasText: pathname }).last().click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  };
  try {
    // 准备：TLS与HTTP origin均归本轮所有，沿用日常CA；本地输入文件只能由产品保存。
    // Arrange: own both TLS/HTTP origins and reuse the daily CA; local input files must be saved through the product.
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
    tlsPrepared = true;
    await prepareHttpsCapture(desktopApp);
    await startRecording(desktopApp);
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    sourceUrl = `https://${tlsTrafficRunner.targetHost()}${sourcePath}`;
    const httpsRequest = async (pathname: string): Promise<{ statusCode: number | undefined; body: string }> => {
      const socket = await tlsTrafficRunner.openHttp1Socket(desktopApp.capturePort());
      try {
        return await new Promise((resolve, reject) => {
          const outgoing = request({
            createConnection: () => socket, hostname: 'localhost', port: tlsTrafficRunner.port,
            method: 'GET', path: pathname, headers: { connection: 'close' },
          }, incoming => {
            const chunks: Buffer[] = [];
            incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
            incoming.once('error', reject);
            incoming.once('aborted', () => reject(new Error('The owned mapped response was aborted.')));
            incoming.once('end', () => resolve({ statusCode: incoming.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
          });
          outgoing.setTimeout(10_000, () => outgoing.destroy(new Error('The owned mapped request timed out.')));
          outgoing.once('error', reject);
          outgoing.end();
        });
      } finally { socket.destroy(); }
    };
    httpTrafficRunner.respondWith(targetPath, { body: '{"message":"mapped-http-origin"}', headers: { 'content-type': 'application/json' } });
    httpTrafficRunner.respondWith(`${prefix}/file-source`, { body: fileBody, headers: { 'content-type': 'application/json' } });
    media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-routing');
    await media.step('01-rules', '打开Rules / Open Rules', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click(); });
    await media.step('02-create', '创建Guide mapping / Create Guide mapping', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing mapping Rule identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide mapping');
    });
    await media.step('03-source-host', '限定原请求Host为localhost / Restrict the original Host to localhost', async () => { await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('localhost'); });
    await media.step('04-add-path', '添加Path条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('05-path', '限定演示前缀 / Restrict the example prefix', async () => { await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix); });
    await media.step('06-remove-header', '移除默认Header动作 / Remove the default Header action', async () => { await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).click(); });
    await media.step('07-map-remote', '添加Map Remote / Add Map Remote', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapRemote).click();
    });
    await media.step('08-http', '将目标scheme明确设为http / Explicitly set the target scheme to http', async () => {
      await card().getByRole('combobox').click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });
    await media.step('09-target-host', '把目标Host改为127.0.0.1 / Change target Host to 127.0.0.1', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(0).fill('127.0.0.1'); });
    await media.step('10-target-port', '填写另一个真实HTTP服务端口 / Enter the other actual HTTP service port', async () => { await card().locator('input[type="number"]').fill(String(httpTrafficRunner.port)); });
    await media.step('11-target-path', '填写remote-target路径 / Enter the remote-target path', async () => { await card().locator('input:not([readonly]):not([type="number"])').nth(1).fill(targetPath); });
    await media.step('12-enable', '启用映射规则 / Enable the mapping Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('13-apply', 'Apply映射 / Apply mapping', apply);
    await media.step('14-remote-result', '核对HTTPS输入到HTTP目标的真实往返 / Verify HTTPS input reaches the actual HTTP destination', async () => {
      const result = await httpsRequest(sourcePath);
      await testInfo.attach('mapped-client-result', { body: JSON.stringify(result), contentType: 'application/json' });
      expect(result).toEqual({ statusCode: 200, body: '{"message":"mapped-http-origin"}' });
      expect(httpTrafficRunner.observation(targetPath)?.method).toBe('GET');
      await show(sourcePath);
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('mapped-http-origin');
    });
    await media.step('15-edit', '返回映射规则 / Return to the mapping Rule', editRule);
    await media.step('16-disable', '停用Map Remote / Disable Map Remote', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('17-apply-off', 'Apply停用 / Apply disabling', apply);
    await media.step('18-original-result', '停用后恢复原HTTPS端点的404 / Restore the original HTTPS endpoint’s 404 after disabling', async () => {
      const result = await httpsRequest(`${prefix}/remote-off`);
      expect(result.statusCode).toBe(404);
      await show(`${prefix}/remote-off`);
    });
    await media.step('19-file-source', '获取可以由产品保存的公开正文 / Fetch the public body the product can save', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/file-source`)).body).toBe(fileBody);
      await show(`${prefix}/file-source`);
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), file, () => media!.nativeDialogStep(
      '20-save-file', '产品保存guide-map-local.json / Save guide-map-local.json through the product',
    ));
    await media.step('21-check-file', '核对实际产品文件 / Verify the actual product-created file', async () => { expect(await readFile(file, 'utf8')).toBe(fileBody); });
    await media.step('22-edit-local', '返回规则准备Map Local / Return to prepare Map Local', editRule);
    await media.step('23-local-host', '将本段原请求Host设为127.0.0.1 / Set this example’s original Host to 127.0.0.1', async () => { await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1'); });
    await media.step('24-remove-remote', '移除Map Remote动作 / Remove the Map Remote action', async () => { await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'remove')).click(); });
    await media.step('25-local', '添加Map Local / Add Map Local', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapLocal).click();
    });
    await media.step('26-missing-name', '填写本轮不存在的文件名 / Enter the owned missing-file name', async () => { await card().locator('input').fill(missing); });
    await media.step('27-enable-local', '启用Map Local / Enable Map Local', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('28-apply-local', 'Apply本地映射 / Apply local mapping', apply);
    await media.step('29-missing-result', '核对缺失文件的真实404 / Verify the actual missing-file 404', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/local-missing`)).statusCode).toBe(404);
      expect(httpTrafficRunner.observation(`${prefix}/local-missing`)).toBeUndefined();
      await show(`${prefix}/local-missing`);
    });
    await media.step('30-correct-rule', '返回规则修正路径 / Return to correct the path', editRule);
    await media.step('31-correct-file', '选择同流程产品保存的实际路径 / Enter the actual path saved by this workflow', async () => { await card().locator('input').fill(file); });
    await media.step('32-apply-correct', 'Apply正确路径 / Apply the correct path', apply);
    await media.step('33-local-result', '核对实际文件替换与源站未调用 / Verify file replacement without calling the origin', async () => {
      expect(await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/local-correct`)).toMatchObject({ statusCode: 200, body: fileBody });
      expect(httpTrafficRunner.observation(`${prefix}/local-correct`)).toBeUndefined();
      await show(`${prefix}/local-correct`);
    });
    await media.step('34-final-rule', '返回规则收尾 / Return to the Rule for cleanup', editRule);
    await media.step('35-final-disable', '停用映射规则 / Disable the mapping Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('36-final-apply', 'Apply最终停用 / Apply final disabling', apply);
    await media.step('37-certificates', '进入Certificates恢复本轮TLS设置 / Open Certificates to restore this run’s TLS settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    });
    await media.step('38-mitm-off', '关闭本轮解密 / Disable this run’s decryption', async () => { await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle).click(); });
    await media.step('39-remove-exception', '移除localhost源站例外 / Remove the localhost origin exception', async () => { await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click(); });
    // 证据：scheme/Host/port/path都真实改变；缺失路径没有预造文件，成功输入由产品生成。
    // Evidence: scheme/Host/port/path actually change; no missing file is fabricated and the successful input is product-created.
    expect(tlsTrafficRunner.port).not.toBe(httpTrafficRunner.port);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    try { if (tlsPrepared) await cleanHttpsCapture(desktopApp); }
    finally {
      if (media) await media.stop({
        ruleName: 'Guide mapping', pathPrefix: prefix, source: sourceUrl,
        destination: `HTTP 127.0.0.1:${httpTrafficRunner.port}${targetPath}`,
        file: 'guide-map-local.json', fileBody, missingFile: 'guide-missing.json (never created)', missingStatus: '404',
        safety: 'Owned origins and product-created file only; daily CA retained',
        afterRemoteDisabled: 'The original HTTPS endpoint returns 404 for the unconfigured example path; the mapped HTTP target is not used',
      });
      if (completed) await rm(directory, { recursive: true, force: true });
    }
  }
  // 清理：正常Close核对代理、CA、所有进程与8888。
  // Cleanup: normal Close verifies proxy/CA, all processes and port 8888.
});
