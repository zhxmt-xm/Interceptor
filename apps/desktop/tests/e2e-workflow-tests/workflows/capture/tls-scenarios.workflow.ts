import { createHash, X509Certificate } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import { chromium, type Browser } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { recordScreenshotExample, screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints, sharedCertificateDirectory } from '../../fixtures/ui/https-capture';

test('capture.scenarios.tls distinguishes opaque tunnels from decrypted H1 and H2 bodies', async ({
  desktopApp, trafficLab, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  desktopApp.preserveUserDataOnFailure();
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.tls' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const evidence: Array<{ scenarioId: string; protocol: string; row: string | null }> = [];
  const mapLocalFilePath = testInfo.outputPath('https-map-local-response.txt');
  const missingMapLocalFilePath = testInfo.outputPath('https-map-local-missing.txt');
  let browser: Browser | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备与未解密流量：fresh profile只开启Recording，原生TLS握手不得产生伪造HTTP正文。
    // Arrange and opaque traffic: enable only Recording on a fresh profile; a native TLS handshake must not create fake HTTP bodies.
    await startRecording(desktopApp);
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('localhost');
    // 截图准备：Tunnel按Host筛选，保留唯一行/端口断言，收起其他流量的facet值。
    // Screenshot preparation: filter tunnels by host, retain unique-row/port assertions, and collapse other traffic's facet values.
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    const passthrough = trafficLab.scenarios().find((candidate) => candidate.id === 'tls-passthrough');
    if (!passthrough) throw new Error('Missing TLS passthrough scenario.');
    const tunnelResult = await trafficLab.run(passthrough.id, passthrough.defaultDraft, desktopApp.capturePort());
    expect(tunnelResult).toMatchObject({ state: 'complete', protocol: 'tls', response: { statusCode: 200, bodyBytes: 0 } });
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    recordScreenshotExample('tls-origin', `https://localhost:${tlsTrafficRunner.port}/`);
    expect(tlsTrafficRunner.applicationByteCount()).toBe(0);
    const tunnelRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: 'localhost' });
    await expect(tunnelRow).toHaveCount(1);
    for (const value of ['CONNECT', 'tls']) await expect(tunnelRow).toContainText(value);
    await tunnelRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel).click();
    const inspector = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
    await expect(inspector).toContainText('localhost');
    await expect(inspector).toContainText(String(tlsTrafficRunner.port));
    await screenshotStep('选择本轮端口的未解密localhost CONNECT / Select the opaque localhost CONNECT on this run\'s port', {
      highlights: [{ target: tunnelRow, label: '1' }],
    });
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    evidence.push({ scenarioId: passthrough.id, protocol: 'tls', row: await tunnelRow.getAttribute('data-automation-id') });
    await screenshotStep('打开Tunnel查看连接元信息，没有HTTP正文 / Open Tunnel to inspect connection metadata without an HTTP body', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel), label: '1' }],
    });

    // 打开并取消HTTPS设置：共享CA已就绪，取消不改变未解密状态。
    // Open and cancel HTTPS setup: the shared CA is ready, but cancellation must preserve opaque traffic.
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.setupHttps).click();
    const setup = page.getByRole('dialog');
    await expect(setup).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.connectionChain)).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.generate)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.install)).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting)).toBeEnabled();
    await setup.screenshot({ path: testInfo.outputPath('https-setup-connection-chain.png') });
    await screenshotStep('打开HTTPS Setup，确认Start decrypting可用 / Open HTTPS Setup and confirm Start decrypting is available', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel).click();
    await expect(setup).toHaveCount(0);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    await screenshotStep('取消HTTPS Setup后仍保持Tunnel / Cancel HTTPS Setup and retain the opaque Tunnel', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tunnel), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();

    // 用户操作：复用共享CA，经真实Certificates UI启用MITM，不重复生成或安装。
    // User actions: reuse the shared CA and enable MITM through Certificates UI without regenerating or installing it.
    await prepareHttpsCapture(desktopApp);
    for (const expected of [
      { id: 'tls-mitm-h1', protocol: 'h1', alpn: 'http/1.1', mode: 'https-h1', path: '/playground/tls/h1' },
      { id: 'tls-mitm-h2', protocol: 'h2', alpn: 'h2', mode: 'https-h2', path: '/playground/tls/h2' },
    ] as const) {
      await test.step(expected.id, async () => {
        const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
        if (!scenario) throw new Error(`Missing TLS scenario: ${expected.id}`);
        await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(expected.path);
        const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
        await testInfo.attach(`${expected.id}-transport.json`, {
          body: Buffer.from(JSON.stringify(result)), contentType: 'application/json',
        });
        expect(result).toMatchObject({ state: 'complete', protocol: 'tls', tls: { alpn: expected.alpn },
          response: { statusCode: 200 }, request: { method: 'GET', path: expected.path },
        });

        // 业务断言：选择真正解密的HTTP行，Response显示origin JSON，TLS页保留目标和协议事实。
        // Product assertions: select the decrypted HTTP row, inspect origin JSON in Response, and verify target/protocol facts in TLS.
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: expected.path });
        await expect(row).toHaveCount(1);
        for (const value of ['GET', '200', expected.protocol]) await expect(row).toContainText(value);
        await row.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
        const body = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await expect(body).toContainText(`"mode": "${expected.mode}"`);
        await expect(body).toContainText('"secure": true');
        await screenshotStep(`${expected.id}读取解密后的Response Raw正文 / Read the decrypted ${expected.id} Response body in Raw`, {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tls).click();
        for (const value of ['https', 'localhost', String(tlsTrafficRunner.port), 'TLS']) await expect(inspector).toContainText(value);
        evidence.push({ scenarioId: expected.id, protocol: expected.protocol, row: await row.getAttribute('data-automation-id') });
        await screenshotStep(`${expected.id}打开TLS核对目标与协议 / Open TLS to inspect the ${expected.id} target and protocol`, {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.tls), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      });
    }
    await screenshotStep('用户操作：复用共享CA，经真实Certificates UI启用MITM，不重复生成或安装。 / User actions: reuse the shared CA and enable MITM through Certificates UI without regenerating or installing it.');

    // 路由：原HTTPS请求经正式Map Remote改到本轮HTTP端口，停用后恢复原源站。
    // Routing: map the original HTTPS request to this workflow's HTTP port and restore its origin after disabling.
    const mappingPrefix = '/e2e/rules/tls-mapping';
    const targetPath = '/e2e/rules/mapped-http';
    httpTrafficRunner.respondWith(targetPath, { body: 'owned-http-mapping-result' });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    const automationId = await ruleRow.getAttribute('data-automation-id');
    if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('The mapping Rule omitted its identity.');
    const ruleId = automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    const action = (name: string) => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, name));
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E HTTPS to HTTP mapping');
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('E2E HTTPS to HTTP mapping');
    await screenshotStep('填写HTTPS到HTTP映射规则名称 / Name the HTTPS-to-HTTP mapping Rule', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
    });
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('localhost');
    await expect(getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'))).toHaveValue('localhost');
    await screenshotStep('匹配原HTTPS请求的localhost / Match localhost on the original HTTPS request', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(mappingPrefix);
    await expect(getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'))).toHaveValue(mappingPrefix);
    await screenshotStep('限定原HTTPS路径前缀 / Limit the original HTTPS path prefix', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')), label: '1' }],
    });
    await action('remove').click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapRemote)).toBeVisible();
    await screenshotStep('打开动作菜单并选择Map Remote / Open the action menu for Map Remote', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapRemote), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapRemote).click();
    const card = action('remove').locator('../..');
    await card.getByRole('combobox').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(card.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    await card.scrollIntoViewIfNeeded();
    await screenshotStep('为目标选择http scheme / Select the destination http scheme', {
      highlights: [{ target: card, label: '1' }],
    });
    await card.locator('input:not([readonly]):not([type="number"])').nth(0).fill('127.0.0.1');
    await expect(card.locator('input:not([readonly]):not([type="number"])').nth(0)).toHaveValue('127.0.0.1');
    await screenshotStep('填写HTTP目标Host / Enter the HTTP destination Host', {
      highlights: [{ target: card.locator('input:not([readonly]):not([type="number"])').nth(0), label: '1' }],
    });
    await card.locator('input[type="number"]').fill(String(httpTrafficRunner.port));
    await expect(card.locator('input[type="number"]')).toHaveValue(String(httpTrafficRunner.port));
    await screenshotStep('填写本轮HTTP服务端口 / Enter this HTTP service port', {
      highlights: [{ target: card.locator('input[type="number"]'), label: '1' }],
    });
    await card.locator('input:not([readonly]):not([type="number"])').nth(1).fill(targetPath);
    await expect(card.locator('input:not([readonly]):not([type="number"])').nth(1)).toHaveValue(targetPath);
    await screenshotStep('填写HTTP目标Path / Enter the HTTP destination Path', {
      highlights: [{ target: card.locator('input:not([readonly]):not([type="number"])').nth(1), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('启用跨协议映射草稿 / Enable the cross-scheme mapping draft', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('Apply使HTTPS到HTTP映射生效 / Apply the HTTPS-to-HTTP mapping', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    const mappedRequest = async (suffix: string) => {
      const socket = await tlsTrafficRunner.openHttp1Socket(desktopApp.capturePort());
      try {
        return await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
          const outgoing = request({
            createConnection: () => socket, hostname: 'localhost', port: tlsTrafficRunner.port,
            method: 'GET', path: `${mappingPrefix}/${suffix}`, headers: { connection: 'close' },
          }, incoming => {
            const chunks: Buffer[] = [];
            incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
            incoming.once('error', reject);
            incoming.once('aborted', () => reject(new Error('The owned mapped response was aborted.')));
            incoming.once('end', () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
          });
          outgoing.setTimeout(10_000, () => outgoing.destroy(new Error('The owned mapped request timed out.')));
          outgoing.once('error', reject);
          outgoing.end();
        });
      } finally {
        socket.destroy();
      }
    };
    expect(await mappedRequest('enabled')).toEqual({ status: 200, body: 'owned-http-mapping-result' });
    expect(httpTrafficRunner.observation(targetPath)?.method).toBe('GET');
    // 结果：只选择这次映射的Capture记录，实际正文不能由普通TLS示例代替。
    // Result: select this mapping's Capture record; ordinary TLS examples cannot stand in for its response.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/rules/');
    const mappedRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
    await expect(mappedRows).toHaveCount(1);
    await expect(mappedRows).toContainText('200');
    const mappedRowId = await mappedRows.getAttribute('data-automation-id');
    await mappedRows.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('owned-http-mapping-result');
    await screenshotStep('HTTPS请求显示HTTP目标的真实响应 / The HTTPS request shows the HTTP destination response', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
    });

    // 文件来源：只由当前Response的产品Save生成Map Local输入，不能预写业务文件。
    // File source: create the Map Local input only with this Response's product Save action, never a test-written file.
    await expect(readFile(mapLocalFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mapLocalFilePath);
    const mapLocalFileSha256 = createHash('sha256').update('owned-http-mapping-result', 'utf8').digest('hex');
    await expect.poll(async () => {
      try { return createHash('sha256').update(await readFile(mapLocalFilePath)).digest('hex'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }).toBe(mapLocalFileSha256);
    const mapLocalFileBody = await readFile(mapLocalFilePath);
    expect(mapLocalFileBody).toEqual(Buffer.from('owned-http-mapping-result', 'utf8'));
    await testInfo.attach('https-map-local-response.txt', { path: mapLocalFilePath, contentType: 'text/plain' });
    await screenshotStep('从Response Save保存本轮映射文件 / Save this response as the local mapping file', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await ruleRow.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('E2E HTTPS to HTTP mapping');
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用跨协议映射规则 / Disable the cross-scheme mapping Rule', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('Apply保存映射停用状态 / Apply the disabled mapping state', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    expect((await mappedRequest('disabled')).status).toBe(404);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const disabledRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: `${mappingPrefix}/disabled` });
    await expect(disabledRow).toHaveCount(1);
    await expect(disabledRow).toContainText('404');
    await disabledRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    await screenshotStep('停用后新请求恢复原HTTPS端点的404 / A new request returns the original HTTPS endpoint 404 after disabling', {
      highlights: [{ target: disabledRow, label: '1' }],
    });
    await testInfo.attach('https-http-mapping.json', {
      body: Buffer.from(JSON.stringify({
        ruleId,
        sourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/enabled`,
        disabledSourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/disabled`,
        targetUrl: httpTrafficRunner.url(targetPath),
        enabled: { status: 200, body: 'owned-http-mapping-result', capturedRow: mappedRowId },
        disabled: { status: 404, capturedRow: await disabledRow.getAttribute('data-automation-id') },
      }, null, 2), 'utf8'),
      contentType: 'application/json',
    });

    // 本地映射：复用同一规则与匹配条件，真实输入缺失文件路径并保存启用状态。
    // Local mapping: reuse the Rule and matchers, enter a missing file path, and save the enabled state through the UI.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await ruleRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E HTTPS to local file mapping');
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('E2E HTTPS to local file mapping');
    await screenshotStep('把原映射规则改为本地文件示例 / Rename the existing Rule for local file mapping', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
    });
    await action('remove').click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapLocal)).toBeVisible();
    await screenshotStep('移除Map Remote后选择Map Local / Choose Map Local after removing Map Remote', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapLocal), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.mapLocal).click();
    const localPathField = card.getByRole('textbox');
    await expect(readFile(missingMapLocalFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await localPathField.fill(missingMapLocalFilePath);
    await expect(localPathField).toHaveValue(missingMapLocalFilePath);
    await screenshotStep('输入本轮不存在的Map Local路径 / Enter this run\'s missing Map Local file path', {
      highlights: [{ target: localPathField, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('启用本地文件映射草稿 / Enable the local file mapping draft', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('保存缺失路径的Map Local规则 / Save the Map Local Rule with the missing path', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    const missingLocalResult = await mappedRequest('map-local-missing');
    expect(missingLocalResult).toEqual({ status: 404, body: 'Map Local target not found.' });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${mappingPrefix}/map-local-missing`);
    const missingLocalRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
    await expect(missingLocalRow).toHaveCount(1);
    await expect(missingLocalRow).toContainText(`${mappingPrefix}/map-local-missing`);
    await expect(missingLocalRow).toContainText('404');
    const missingLocalRowId = await missingLocalRow.getAttribute('data-automation-id');
    await missingLocalRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(missingLocalResult.body);
    await screenshotStep('缺失本地文件的HTTPS请求返回明确404正文 / The HTTPS request returns the missing-file 404 body', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
    });

    // 修正与业务断言：只选本流程由产品Save的文件，真实HTTPS响应必须逐字节相同。
    // Correction and assertions: use only the file produced by this workflow's product Save; compare the actual HTTPS response byte for byte.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await ruleRow.click();
    await localPathField.fill(mapLocalFilePath);
    await expect(localPathField).toHaveValue(mapLocalFilePath);
    await screenshotStep('修正为刚由产品Save生成的文件路径 / Correct the path to the file just produced by Save', {
      highlights: [{ target: localPathField, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('保存修正后的Map Local路径 / Save the corrected Map Local path', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    const localResult = await mappedRequest('map-local-enabled');
    expect(localResult.status).toBe(200);
    expect(Buffer.from(localResult.body, 'utf8')).toEqual(mapLocalFileBody);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${mappingPrefix}/map-local-enabled`);
    const localRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
    await expect(localRow).toHaveCount(1);
    await expect(localRow).toContainText(`${mappingPrefix}/map-local-enabled`);
    await expect(localRow).toContainText('200');
    const localRowId = await localRow.getAttribute('data-automation-id');
    await localRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(localResult.body);
    await screenshotStep('HTTPS Map Local返回产品保存的文件正文 / HTTPS Map Local returns the product-saved file body', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
    });

    // 停用恢复：新请求回到原HTTPS服务的404空正文，与缺失文件提示明确区分。
    // Disable and restore: a new request returns the original HTTPS service's empty 404, distinct from the missing-file message.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await ruleRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled)).toHaveAttribute('aria-checked', 'false');
    await screenshotStep('停用本地文件映射 / Disable local file mapping', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('保存Map Local停用状态 / Save the disabled Map Local state', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
    const localDisabledResult = await mappedRequest('map-local-disabled');
    expect(localDisabledResult).toEqual({ status: 404, body: '' });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${mappingPrefix}/map-local-disabled`);
    const localDisabledRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
    await expect(localDisabledRow).toHaveCount(1);
    await expect(localDisabledRow).toContainText(`${mappingPrefix}/map-local-disabled`);
    await expect(localDisabledRow).toContainText('404');
    await localDisabledRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    await screenshotStep('停用Map Local后新HTTPS请求恢复原404 / A new HTTPS request restores the original 404 after disabling Map Local', {
      highlights: [{ target: localDisabledRow, label: '1' }],
    });
    await testInfo.attach('https-map-local.json', {
      body: Buffer.from(JSON.stringify({
        ruleId,
        exportedResponse: {
          sourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/enabled`,
          capturedRow: mappedRowId,
          path: mapLocalFilePath,
          bytes: mapLocalFileBody.byteLength,
          sha256: mapLocalFileSha256,
        },
        missing: {
          sourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/map-local-missing`,
          path: missingMapLocalFilePath,
          ...missingLocalResult,
          capturedRow: missingLocalRowId,
        },
        enabled: {
          sourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/map-local-enabled`,
          ...localResult,
          capturedRow: localRowId,
        },
        disabled: {
          sourceUrl: `https://localhost:${tlsTrafficRunner.port}${mappingPrefix}/map-local-disabled`,
          ...localDisabledResult,
          capturedRow: await localDisabledRow.getAttribute('data-automation-id'),
        },
      }, null, 2), 'utf8'),
      contentType: 'application/json',
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/playground/tls/browser-trust');

    // 浏览器信任：使用系统Edge默认HTTPS校验，不指定CA或忽略证书错误。
    // Browser trust: use system Edge's default HTTPS validation without a supplied CA or ignored certificate errors.
    browser = await chromium.launch({
      channel: 'msedge', headless: true,
      proxy: { server: `http://127.0.0.1:${desktopApp.capturePort()}`, bypass: '<-loopback>' },
    });
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: false });
    await test.step('browser-system-trust', async () => {
      const browserPage = await browserContext.newPage();
      const browserSession = await browserContext.newCDPSession(browserPage);
      const securityStates: Array<{ securityState: string; certificateSecurityState?: { certificate: string[]; certificateNetworkError?: string } }> = [];
      browserSession.on('Security.visibleSecurityStateChanged', ({ visibleSecurityState }) => securityStates.push(visibleSecurityState));
      await browserSession.send('Security.enable');
      try {
        const response = await browserPage.goto(`https://localhost:${tlsTrafficRunner.port}/playground/tls/browser-trust`, {
          waitUntil: 'domcontentloaded', timeout: 30_000,
        });
        expect(response?.status()).toBe(200);
        await expect(browserPage.locator('body')).toHaveText('Interceptor TLS browser trust');
        await expect.poll(() => securityStates.at(-1)?.securityState).toBe('secure');
        const encodedLeaf = securityStates.at(-1)?.certificateSecurityState?.certificate[0];
        expect(encodedLeaf).toBeDefined();
        const leaf = new X509Certificate(Buffer.from(encodedLeaf!, 'base64'));
        const root = new X509Certificate(await readFile(path.join(sharedCertificateDirectory(), 'root-cert.pem')));
        expect(leaf.checkHost('localhost')).toBe('localhost');
        expect(leaf.verify(root.publicKey), 'Browser leaf must be signed by the current shared CA').toBe(true);
        await testInfo.attach('browser-certificate.json', {
          body: Buffer.from(JSON.stringify({ leafFingerprint: leaf.fingerprint256, rootFingerprint: root.fingerprint256,
            issuer: leaf.issuer, subject: leaf.subject, securityDetails: await response!.securityDetails() })),
          contentType: 'application/json',
        });
      } catch (error) {
        try {
          const { tableNames } = await browserSession.send('Network.getCertificate', {
            origin: `https://localhost:${tlsTrafficRunner.port}`,
          });
          const root = new X509Certificate(await readFile(path.join(sharedCertificateDirectory(), 'root-cert.pem')));
          await testInfo.attach('browser-failed-certificate-chain.json', {
            body: Buffer.from(JSON.stringify({
              rootFingerprint: root.fingerprint256,
              certificates: tableNames.map((encoded: string) => {
                const certificate = new X509Certificate(Buffer.from(encoded, 'base64'));
                return {
                  fingerprint: certificate.fingerprint256, subject: certificate.subject, issuer: certificate.issuer,
                  signedBySharedCa: certificate.verify(root.publicKey),
                };
              }),
            })),
            contentType: 'application/json',
          });
        } catch (evidenceError) {
          await testInfo.attach('browser-certificate-evidence-error.json', {
            body: Buffer.from(JSON.stringify({ message: evidenceError instanceof Error ? evidenceError.message : String(evidenceError) })),
            contentType: 'application/json',
          });
        }
        await testInfo.attach('browser-trust-error.json', {
          body: Buffer.from(JSON.stringify({ message: error instanceof Error ? error.message : String(error) })),
          contentType: 'application/json',
        });
        throw error;
      } finally {
        await testInfo.attach('browser-security-state.json', {
          body: Buffer.from(JSON.stringify(securityStates)), contentType: 'application/json',
        });
      }
    });
    await screenshotStep('浏览器信任：使用系统Edge默认HTTPS校验，不指定CA或忽略证书错误。 / Browser trust: use system Edge\'s default HTTPS validation without a supplied CA or ignored certificate errors.');

    // 证据：保存三种场景的公开行身份与协议，Renderer必须无错误。
    // Evidence: retain all three public scenario identities/protocols and require zero Renderer errors.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('tls-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });

    // 设置清理：先关闭已验证的浏览器，再经真实Certificates UI停用解密并移除本轮例外。
    // Settings cleanup: close the verified browser, then disable decryption and remove this run's exception through Certificates UI.
    await browser.close();
    browser = null;
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    const certificatesSection = getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates);
    await certificatesSection.click();
    const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
    const localhostException = getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'));
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
    await expect(localhostException).toBeVisible();
    await screenshotStep('打开Certificates查看本轮HTTPS解密与localhost例外 / Open Certificates for this run\'s HTTPS decryption and localhost exception', {
      highlights: [{ target: certificatesSection, label: '1' }],
    });
    await mitmToggle.click();
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
    await mitmToggle.scrollIntoViewIfNeeded();
    await screenshotStep('通过Certificates停用HTTPS解密 / Disable HTTPS decryption through Certificates', {
      highlights: [{ target: mitmToggle, label: '1' }],
    });
    await localhostException.scrollIntoViewIfNeeded();
    await expect(localhostException).toBeVisible();
    await screenshotStep('定位本轮localhost源站例外并准备移除 / Locate this run\'s localhost origin exception before removing it', {
      highlights: [{ target: localhostException, label: '1' }],
    });
    await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click();
    await expect(localhostException).toBeHidden();
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
    const insecureHostInput = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput);
    await insecureHostInput.scrollIntoViewIfNeeded();
    await expect(insecureHostInput).toHaveValue('');
    await screenshotStep('localhost例外已移除，HTTPS解密保持停用 / The localhost exception is removed and HTTPS decryption remains disabled', {
      highlights: [{ target: insecureHostInput, label: '1' }],
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：通过UI恢复MITM/源站例外，保留共享CA和Root集合；fixture恢复进程与宿主。
    // Cleanup: restore MITM/origin settings, preserve the shared CA and Root stores, and let fixtures restore the host.
    await browser?.close().catch((error: unknown) => cleanupErrors.push(error));
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    await rm(mapLocalFilePath, { force: true }).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'TLS Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'TLS Capture cleanup failed.');
});