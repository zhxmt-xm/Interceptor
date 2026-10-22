import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import tls from 'node:tls';

import { generateCACertificate } from 'mockttp';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';

test.use({ dismissTlsCompatibilityDialogs: false });

async function rejectInterceptedCertificate(
  proxyPort: number,
  originPort: number,
  host: string,
  unrelatedCa: string,
): Promise<{ host: string; errorCode: string }> {
  return new Promise((resolve, reject) => {
    const connectRequest = request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `127.0.0.1:${originPort}`,
      headers: { host: `127.0.0.1:${originPort}` },
    });
    connectRequest.once('error', reject);
    connectRequest.setTimeout(15_000, () => connectRequest.destroy(new Error('TLS compatibility CONNECT timed out.')));
    connectRequest.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`TLS compatibility CONNECT returned ${response.statusCode}.`));
        return;
      }
      if (head.length > 0) socket.unshift(head);
      const client = tls.connect({ socket, servername: host, ca: unrelatedCa, rejectUnauthorized: true });
      client.setTimeout(15_000, () => client.destroy(new Error('TLS compatibility handshake timed out.')));
      client.once('secureConnect', () => {
        client.destroy();
        reject(new Error('The isolated TLS client unexpectedly trusted the interception certificate.'));
      });
      client.once('error', (error: NodeJS.ErrnoException) => {
        client.destroy();
        resolve({ host, errorCode: error.code ?? error.name });
      });
    });
    connectRequest.end();
  });
}

test('settings.tls-compatibility selects patterns from real failed TLS handshakes', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tls-compatibility' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const suffix = `compatibility-${randomUUID()}.test`;
  const hosts = [0, 1, 2, 3, 4].map(index => `api.group${index}.${suffix}`);
  const selectedPatterns = [hosts[0]!, `*.group1.${suffix}`];
  const dismissedHost = `dismiss.${suffix}`;
  const observations: Array<{ host: string; errorCode: string }> = [];
  const cleanupErrors: unknown[] = [];
  let workflowError: unknown;
  const dismiss = getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.dismiss);
  const dialog = page.getByRole('dialog').filter({ has: dismiss });
  const hostRow = (host: string) => getByAutomationId(page, AutomationIdFactory.tlsCompatibilityHost(host));
  const patternCheckbox = (host: string, pattern: string) => getByAutomationId(page, AutomationIdFactory.tlsCompatibilityPattern(host, pattern));
  const addSelected = getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.addSelected);

  try {
    // 准备：正式UI启用本轮CA与MITM，客户端使用另一份独立CA，不修改系统信任来制造失败。
    // Arrange: enable this run's CA and MITM through UI; the client trusts an unrelated CA without changing system trust.
    await startRecording(desktopApp);
    await prepareHttpsCapture(desktopApp);
    const origin = await trafficLab.getTlsTrafficRunner();
    const unrelatedCa = await generateCACertificate();

    // 用户流程：本地CONNECT承载测试SNI，真实证书拒绝经Core/Main事件打开兼容性弹窗。
    // User flow: local CONNECT carries test-owned SNI; real certificate rejection opens the dialog through Core/Main events.
    for (const host of hosts) {
      const observation = await rejectInterceptedCertificate(desktopApp.capturePort(), origin.port, host, unrelatedCa.cert);
      expect(observation.errorCode).toMatch(/^(SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT)$/);
      observations.push(observation);
      await expect(hostRow(host)).toHaveCount(1);
    }
    await expect(dialog).toBeVisible();
    const hostList = getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.hostList);
    await expect(hostList).toHaveCSS('max-height', '264px');
    const rowLayouts = [];
    for (const host of hosts) {
      await expect(patternCheckbox(host, host)).toHaveAttribute('aria-checked', 'true');
      const wildcardChoices = hostRow(host).locator('[role="checkbox"][aria-checked="false"]');
      await expect(wildcardChoices).toHaveCount(2);
      const layout = await hostRow(host).locator(':scope > div > code').evaluate(element => ({
        fontSize: getComputedStyle(element).fontSize,
        lineHeight: getComputedStyle(element).lineHeight,
        height: element.getBoundingClientRect().height,
      }));
      expect(layout).toMatchObject({ fontSize: '11.5px', lineHeight: 'normal' });
      rowLayouts.push({ host, ...layout });
    }
    await hostList.hover();
    await page.mouse.wheel(0, 2_000);
    await expect.poll(() => hostList.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(hostRow(hosts.at(-1)!)).toBeInViewport({ ratio: 0.9 });
    await hostList.press('Home');
    await expect.poll(() => hostList.evaluate(element => element.scrollTop)).toBe(0);
    await hostList.press('End');
    await expect(hostRow(hosts.at(-1)!)).toBeInViewport({ ratio: 0.9 });
    await screenshotStep('用户流程：本地CONNECT承载测试SNI，真实证书拒绝经Core/Main事件打开兼容性弹窗。 / User flow: local CONNECT carries test-owned SNI; real certificate rejection opens the dialog through Core/Main events.');

    // 业务断言：全部取消时不能保存，精确host与父域wildcard只按用户勾选持久化。
    // Product assertions: no selection disables Save; persist only the exact host and parent wildcard chosen by the user.
    for (const host of hosts) await patternCheckbox(host, host).click();
    const selectedCheckboxes = hostList.locator('[role="checkbox"][aria-checked="true"]');
    const backgroundPatternIds = await selectedCheckboxes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-automation-id')!));
    for (const automationId of backgroundPatternIds) {
      await getByAutomationId(page, automationId).click();
    }
    await expect(selectedCheckboxes).toHaveCount(0);
    await expect(addSelected).toBeDisabled();
    await screenshotStep('没有选择主机时不能保存透传配置 / Passthrough cannot be saved without selected hosts', {
      highlights: [{ target: addSelected, label: '1' }],
    });
    await patternCheckbox(hosts[0]!, selectedPatterns[0]!).click();
    await patternCheckbox(hosts[1]!, selectedPatterns[1]!).click();
    expect(await selectedCheckboxes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-automation-id')).sort())).toEqual([
      AutomationIdFactory.tlsCompatibilityPattern(hosts[0]!, selectedPatterns[0]!),
      AutomationIdFactory.tlsCompatibilityPattern(hosts[1]!, selectedPatterns[1]!),
    ].sort());
    await expect(addSelected).toBeEnabled();
    await hostList.press('Home');
    await screenshotStep('核对精确主机与父域通配范围后再保存 / Review exact-host and parent wildcard scopes before saving', {
      highlights: [
        { target: hostRow(hosts[0]!), label: '1' },
        { target: hostRow(hosts[1]!), label: '2' },
        { target: addSelected, label: '3' },
      ],
    });
    await dialog.screenshot({ path: testInfo.outputPath('tls-compatibility-selected.png') });
    await addSelected.click();
    await expect(dialog).toHaveCount(0);
    for (const pattern of selectedPatterns) {
      await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(pattern))).toBeVisible();
    }
    for (const host of hosts.slice(1)) {
      await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(host))).toHaveCount(0);
    }
    await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(`*.${suffix}`))).toHaveCount(0);
    await screenshotStep('业务断言：全部取消时不能保存，精确host与父域wildcard只按用户勾选持久化。 / Product assertions: no selection disables Save; persist only the exact host and parent wildcard chosen by the user.');

    // 再次真实提示：Not now不增加pattern，已保存选择在页面重开后保持。
    // A second real prompt: Not now adds no pattern, and saved choices survive reopening Settings.
    const dismissedObservation = await rejectInterceptedCertificate(desktopApp.capturePort(), origin.port, dismissedHost, unrelatedCa.cert);
    expect(dismissedObservation.errorCode).toMatch(/^(SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT)$/);
    observations.push(dismissedObservation);
    await expect(hostRow(dismissedHost)).toHaveCount(1);
    await screenshotStep('Not now只关闭提示，不添加透传主机 / Not now closes the prompt without adding passthrough hosts', {
      highlights: [{ target: dismiss, label: '1' }],
    });
    await dismiss.click();
    await expect(dialog).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
    await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(dismissedHost))).toHaveCount(0);
    for (const pattern of selectedPatterns) {
      await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(pattern))).toBeVisible();
    }
    await screenshotStep('再次真实提示：Not now不增加pattern，已保存选择在页面重开后保持。 / A second real prompt: Not now adds no pattern, and saved choices survive reopening Settings.');

    // 证据：只保存自产host、实际TLS错误、行尺寸和零应用字节，不读取或修改Renderer Store。
    // Evidence: retain test-owned hosts, actual TLS errors, geometry and zero application bytes without accessing Renderer Store.
    expect(origin.applicationByteCount()).toBe(0);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    const evidencePath = testInfo.outputPath('tls-compatibility.json');
    await writeFile(evidencePath, JSON.stringify({ observations, rowLayouts, selectedPatterns, backgroundPatternIds, applicationBytes: origin.applicationByteCount() }, null, 2), 'utf8');
    await testInfo.attach('tls-compatibility.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：正式UI删除本轮pattern、卸载CA和关闭MITM；fixture核验进程、8888与完整宿主恢复。
    // Cleanup: remove this run's patterns and CA and stop MITM through UI; fixtures verify processes, 8888 and host restoration.
    try {
      if (await dismiss.isVisible()) await dismiss.click();
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
      for (const pattern of selectedPatterns) {
        const row = getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(pattern));
        if (await row.isVisible()) {
          await screenshotStep('移除本次添加的透传范围 / Remove the passthrough scope added for this operation', {
            highlights: [{ target: getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(pattern)), label: '1' }],
          });
          await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(pattern)).click();
          await expect(row).toHaveCount(0);
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length === 0) desktopApp.releasePreservedUserData();
    await screenshotStep('清理：正式UI删除本轮pattern、卸载CA和关闭MITM；fixture核验进程、8888与完整宿主恢复。 / Cleanup: remove this run\'s patterns and CA and stop MITM through UI; fixtures verify processes, 8888 and host restoration.');
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'TLS compatibility and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'TLS compatibility cleanup failed.');
});