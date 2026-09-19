import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import tls from 'node:tls';
import { promisify } from 'node:util';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES } from '../../../../src/shared/automation-ids';
import { expect, test as workflowTest } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { disableClashxSystemProxy, enableClashxSystemProxy, requireReadyClashx } from '../../fixtures/ui/macos-clashx';

const execute = promisify(execFile);
const originHost = 'example.com';

interface ExternalUpstream {
  readonly authority: string;
  readonly port: number;
  readonly original: unknown;
}

const test = workflowTest.extend<{ externalUpstream: ExternalUpstream }>({
  externalUpstream: [async ({}, use) => {
    const helperPath = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
      ? path.join(process.env.INTERCEPTOR_E2E_MACOS_APP_PATH, 'Contents/Resources/system-proxy/macos-proxy-helper')
      : path.resolve('dist/system-proxy/macos-proxy-helper');
    const effective = JSON.parse((await execute(helperPath, ['get-effective-proxies'], { encoding: 'utf8' })).stdout) as Record<string, unknown>;
    if (effective.HTTPEnable !== 1 || effective.HTTPSEnable !== 1
      || effective.HTTPProxy !== '127.0.0.1' || effective.HTTPSProxy !== effective.HTTPProxy
      || typeof effective.HTTPPort !== 'number' || !Number.isInteger(effective.HTTPPort)
      || effective.HTTPPort < 1 || effective.HTTPPort > 65_535 || effective.HTTPPort === 8888
      || effective.HTTPSPort !== effective.HTTPPort || effective.ProxyAutoConfigEnable === 1) {
      throw new Error('This workflow requires a running external loopback HTTP proxy configured for both HTTP and HTTPS, such as ClashX system proxy mode.');
    }
    const original: unknown = JSON.parse((await execute(helperPath, ['get'], { encoding: 'utf8' })).stdout);
    await use({ authority: `127.0.0.1:${effective.HTTPPort}`, port: effective.HTTPPort, original });
  }, { auto: true }],
});

test.skip(process.platform !== 'darwin', 'macOS external system proxy integration only');

function openPassthroughConnection(proxyPort: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: proxyPort, method: 'CONNECT', path: `${originHost}:443` });
    request.setTimeout(20_000, () => request.destroy(new Error('External upstream CONNECT timed out.')));
    request.once('error', reject);
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`External upstream CONNECT returned ${response.statusCode ?? 0}.`));
        return;
      }
      if (head.length > 0) socket.unshift(head);
      const secure = tls.connect({ socket, servername: originHost, rejectUnauthorized: true, ALPNProtocols: ['http/1.1'] });
      secure.setTimeout(20_000, () => secure.destroy(new Error('External upstream TLS handshake timed out.')));
      secure.once('error', reject);
      secure.once('secureConnect', () => resolve(secure));
    });
    request.end();
  });
}

test('settings.proxy.upstream preserves the external system upstream while Interceptor owns the system proxy', async ({ desktopApp, externalUpstream }, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.proxy.upstream' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  let secure: tls.TLSSocket | null = null;
  let upstreamConnectionObserved = false;
  let restoredThroughUi = false;

  // 准备：fixture已在App启动前只读保存外部上游和完整代理基线。
  // Arrange: the fixture captured the external upstream and complete proxy baseline before launching the App.
  try {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.statusbar)).toContainText(externalUpstream.authority);

    // 用户操作：经真实listener建立TLS直通，不安装CA或注入Core上游配置。
    // User action: create a real passthrough TLS connection through the listener without installing a CA or injecting Core upstream settings.
    secure = await openPassthroughConnection(desktopApp.capturePort());
    expect(secure.authorized).toBe(true);

    // 业务断言：持有8888的Core进程确实连接原上游，Capture显示真实目标。
    // Business assertions: the Core process owning port 8888 connects to the original upstream and Capture shows the real destination.
    const listener = await execute('/usr/sbin/lsof', ['-nP', '-a', '-iTCP:8888', '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' });
    const processIds = [...listener.stdout.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1]));
    expect(processIds).toHaveLength(1);
    const connections = await execute('/usr/sbin/lsof', [
      '-nP', '-a', '-p', String(processIds[0]), `-iTCP:${externalUpstream.port}`, '-sTCP:ESTABLISHED', '-Fn',
    ], { encoding: 'utf8' });
    expect(connections.stdout).toContain(`->${externalUpstream.authority}`);
    upstreamConnectionObserved = true;
    await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: originHost })).toHaveCount(1);
    const closed = once(secure, 'close');
    secure.destroy();
    await closed;
    secure = null;

    // 用户恢复：通过Settings Restore恢复外部应用配置，不由测试直接写系统代理。
    // User restoration: restore the external application's configuration through Settings, never by test-side proxy writes.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
    await expect.poll(async () => desktopApp.matchesSystemProxyEvidence(
      await desktopApp.readSystemProxySettings(), externalUpstream.original,
    )).toBe(true);
    restoredThroughUi = true;
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    desktopApp.releasePreservedUserData();
  } finally {
    // 证据与清理：仅保存上游端口、基线hash和实际结果；fixture负责正常Close和完整宿主恢复。
    // Evidence and cleanup: retain only the upstream port, baseline hash and actual results; the fixture owns normal Close and full host restoration.
    secure?.destroy();
    await writeFile(testInfo.outputPath('external-upstream.json'), JSON.stringify({
      upstreamAuthority: externalUpstream.authority, upstreamConnectionObserved, restoredThroughUi,
      originalSha256: createHash('sha256').update(JSON.stringify(externalUpstream.original)).digest('hex'),
    }, null, 2), 'utf8');
  }
});

test('settings.proxy.upstream preserves external ClashX changes when Interceptor exits', async ({ desktopApp, externalUpstream }, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.proxy.upstream' });
  desktopApp.preserveUserDataOnFailure();
  const clashx = await requireReadyClashx();
  let externalChangePreserved = false;
  let baselineRestored = false;
  let externalSnapshot: unknown;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  const completedActions: string[] = [];

  // 准备：外部代理仍运行，通过ClashX原生菜单重新接管系统设置。
  // Arrange: the external proxy remains running; use ClashX's native menu to reapply its system settings.
  try {
    await disableClashxSystemProxy(clashx);
    completedActions.push('initial-disable');
    await enableClashxSystemProxy(clashx);
    completedActions.push('initial-enable');
    await expect.poll(async () => desktopApp.matchesSystemProxyEvidence(
      await desktopApp.readSystemProxySettings(), externalUpstream.original,
    )).toBe(true);

    // 用户操作：在ClashX中停用系统代理，保持ClashX监听进程和Interceptor均运行。
    // User actions: disable the system proxy in ClashX while both proxy processes remain running.
    await disableClashxSystemProxy(clashx);
    completedActions.push('external-disable');
    await expect.poll(async () => {
      externalSnapshot = await desktopApp.readSystemProxySettings();
      return desktopApp.matchesSystemProxyEvidence(externalSnapshot, externalUpstream.original);
    }).toBe(false);

    // 业务断言：产品正常Close不得覆盖外部刚保存的配置。
    // Business assertion: normal product Close must not overwrite the configuration saved by the external app.
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    completedActions.push('product-close');
    externalChangePreserved = desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), externalSnapshot);
    expect(externalChangePreserved).toBe(true);
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理与证据：通过ClashX原生菜单恢复本轮基线，不直接调用产品或helper写设置。
    // Cleanup and evidence: restore this run's baseline through ClashX's native menu, never through a direct product or helper write.
    try {
      await enableClashxSystemProxy(clashx);
      await expect.poll(async () => desktopApp.matchesSystemProxyEvidence(
        await desktopApp.readSystemProxySettings(), externalUpstream.original,
      )).toBe(true);
      baselineRestored = true;
    } catch (error) { cleanupErrors.push(error); }
    await writeFile(testInfo.outputPath('external-change.json'), JSON.stringify({
      externalChangePreserved, baselineRestored, completedActions,
      originalSha256: createHash('sha256').update(JSON.stringify(externalUpstream.original)).digest('hex'),
    }, null, 2), 'utf8');
  }
  if (workflowError && cleanupErrors.length) throw new AggregateError([workflowError, ...cleanupErrors], 'External proxy workflow and restoration failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'External proxy restoration failed.');
  desktopApp.releasePreservedUserData();
});