import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import { promisify } from 'node:util';
import { generateCACertificate } from 'mockttp';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { parseMacosSystemProxySnapshot } from '../../../../../../packages/platform-capabilities/src/helper/macos/utils';
import { expect, LocalElectronApplicationDriver, test as workflowTest } from '../../fixtures/runtime/local-electron-driver';
import { recordScreenshotExample, screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

interface UpstreamLab {
  readonly originPort: number;
  readonly proxyPort: number;
  readonly proxiedTargets: string[];
  readonly paths: string[];
  readonly pacRequests: string[];
  createTlsOrigin(): Promise<{ readonly port: number; readonly paths: string[] }>;
}

function readLabPort(name: 'INTERCEPTOR_E2E_DHCP_PAC_PORT' | 'INTERCEPTOR_E2E_WPAD_PROXY_PORT'): number {
  const value = process.env[name];
  if (value === undefined) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`The protected fixture port ${name} is invalid.`);
  }
  return port;
}

const test = workflowTest.extend<{ upstreamLab: UpstreamLab }>({
  upstreamLab: [async ({}, use) => {
    const sockets = new Set<Duplex>();
    const proxiedTargets: string[] = [];
    const paths: string[] = [];
    const pacRequests: string[] = [];
    const tlsPaths: string[] = [];
    let tlsOrigin: https.Server | undefined;
    let tlsOriginPort: number | undefined;
    let proxyPort = 0;
    const origin = http.createServer((request, response) => {
      if (request.url === '/proxy.pac') {
        pacRequests.push(request.url);
        response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', 'cache-control': 'no-store' });
        response.end(`function FindProxyForURL(url, host) { return host === "localhost" ? "DIRECT" : "PROXY 127.0.0.1:${proxyPort}"; }`);
      } else if (request.url === '/tls-proxy.pac') {
        pacRequests.push(request.url);
        response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', 'cache-control': 'no-store' });
        response.end(`function FindProxyForURL(url, host) { return url.indexOf("https:") === 0 ? "PROXY 127.0.0.1:${proxyPort}" : "DIRECT"; }`);
      } else {
        paths.push(request.url ?? '');
        response.end(`upstream-e2e:${request.url}`);
      }
    });
    origin.on('connection', socket => sockets.add(socket));
    origin.listen(readLabPort('INTERCEPTOR_E2E_DHCP_PAC_PORT'), '127.0.0.1');
    await once(origin, 'listening');
    const originAddress = origin.address();
    if (!originAddress || typeof originAddress === 'string') throw new Error('The upstream origin has no TCP address.');
    const originPort = originAddress.port;
    const proxy = http.createServer((request, response) => {
      if (!URL.canParse(request.url ?? '')) {
        response.writeHead(400).end('An absolute target URL is required.');
        return;
      }
      const url = new URL(request.url ?? '');
      if (url.hostname !== '127.0.0.1' || Number(url.port) !== originPort) {
        const localTarget = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
        response.writeHead(403, { 'content-type': 'text/plain' }).end(localTarget
          ? `Unexpected upstream target port ${url.port || 'default'}; expected ${originPort}.`
          : 'The test proxy refuses non-fixture destinations.');
        return;
      }
      proxiedTargets.push(url.host);
      const forwarded = http.request({
        hostname: '127.0.0.1', port: originPort, path: `${url.pathname}${url.search}`,
        method: request.method, headers: request.headers, agent: false,
      }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(response);
      });
      forwarded.on('error', error => response.destroy(error));
      request.pipe(forwarded);
    });
    proxy.on('connect', (request, downstream, head) => {
      const target = request.url;
      const targetPort = target === `127.0.0.1:${originPort}` ? originPort
        : tlsOriginPort !== undefined && target === `localhost:${tlsOriginPort}` ? tlsOriginPort : null;
      if (target === undefined || targetPort === null) {
        downstream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      proxiedTargets.push(target);
      const upstream = net.connect(targetPort, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      sockets.add(upstream).add(downstream);
      upstream.on('error', error => downstream.destroy(error));
      downstream.on('error', error => upstream.destroy(error));
    });
    proxy.on('connection', socket => sockets.add(socket));
    proxy.listen(readLabPort('INTERCEPTOR_E2E_WPAD_PROXY_PORT'), '127.0.0.1');
    await once(proxy, 'listening');
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('The upstream proxy has no TCP address.');
    proxyPort = proxyAddress.port;
    try {
      await use({
        originPort, proxyPort, proxiedTargets, paths, pacRequests,
        createTlsOrigin: async () => {
          if (tlsOrigin) throw new Error('This fixture already owns a TLS origin.');
          const certificate = await generateCACertificate({ subject: { commonName: 'upstream-e2e-origin' } });
          tlsOrigin = https.createServer({ cert: certificate.cert, key: certificate.key }, (request, response) => {
            tlsPaths.push(request.url ?? '');
            const body = `upstream-tls-e2e:${request.url}`;
            response.writeHead(200, { 'content-length': Buffer.byteLength(body), connection: 'close' });
            response.end(body);
          });
          tlsOrigin.on('connection', socket => sockets.add(socket));
          tlsOrigin.listen(0, '127.0.0.1');
          await once(tlsOrigin, 'listening');
          const address = tlsOrigin.address();
          if (!address || typeof address === 'string') throw new Error('TLS fixture has no TCP address.');
          tlsOriginPort = address.port;
          return { port: address.port, paths: tlsPaths };
        },
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await Promise.all([proxy, origin, ...(tlsOrigin ? [tlsOrigin] : [])].map(server => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      })));
    }
  }, { auto: true }],
});

test.skip(process.platform !== 'darwin', 'macOS upstream settings workflow');

function requestThroughCapture(port: number, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1', port, path: target, headers: { host: new URL(target).host }, agent: false,
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.once('error', reject);
      response.once('end', () => {
        if (response.statusCode !== 200) reject(new Error(`Captured test request returned HTTP ${response.statusCode}: ${body.slice(0,180)}`));
        else resolve(body);
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Captured upstream request timed out.')));
    request.once('error', reject);
  });
}

function requestTlsThroughCapture(capturePort: number, originPort: number, requestPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1', port: capturePort, method: 'CONNECT', path: `localhost:${originPort}`, agent: false,
    });
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200 || head.length !== 0) {
        socket.destroy();
        reject(new Error(`Unexpected capture CONNECT response: ${response.statusCode}`));
        return;
      }
      const secure = tls.connect({ socket, servername: 'localhost', rejectUnauthorized: false }, () => {
        secure.write(`GET ${requestPath} HTTP/1.1\r\nHost: localhost:${originPort}\r\nConnection: close\r\n\r\n`);
      });
      let raw = '';
      secure.setEncoding('utf8');
      secure.setTimeout(10_000, () => secure.destroy(new Error('Fixture HTTPS response timed out.')));
      secure.on('data', chunk => { raw += chunk; });
      secure.once('end', () => resolve(raw));
      secure.once('error', reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Capture CONNECT timed out.')));
    request.once('error', reject);
    request.end();
  });
}

test('settings.upstream applies shared Manual PAC and Direct routes and reloads the saved mode', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;
  const marker = randomUUID();
  recordScreenshotExample('upstream-proxy', `http://127.0.0.1:${upstreamLab.proxyPort}/`);
  recordScreenshotExample('pac-origin', `http://127.0.0.1:${upstreamLab.originPort}/proxy.pac`);

  // 准备：真实App已启动，fixture拥有回环源站、上游和PAC，不写产品配置文件。
  // Arrange: the real App is running; the fixture owns loopback origin, proxy and PAC without seeding product settings.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(marker);
  const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
  for (let index = 0; index < await facetToggles.count(); index += 1) {
    const toggle = facetToggles.nth(index);
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  }
  const showCapturedRequest = async (requestPath: string, title: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: requestPath });
    await expect(row).toBeVisible();
    await row.click();
    await screenshotStep(title, { highlights: [{ target: row, label: '1' }] });
  };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
  await screenshotStep('准备：真实App已启动，fixture拥有回环源站、上游和PAC，不写产品配置文件。 / Arrange: the real App is running; the fixture owns loopback origin, proxy and PAC without seeding product settings.');

  // 用户操作：草稿取消不改路线；Manual通过两个入口共用的Apply生效。
  // User actions: cancelling a draft keeps the route; Manual is applied through the shared settings operation.
  await getByAutomationId(page, ids.mode.direct).check();
  await screenshotStep('选择Direct草稿但尚未应用 / Select a Direct draft without applying it', {
    highlights: [{ target: getByAutomationId(page, ids.discard), label: '1' }],
  });
  await getByAutomationId(page, ids.discard).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
  await screenshotStep('Discard后仍使用System路线 / Retain the System route after Discard');
  await getByAutomationId(page, ids.mode.manual).check();
  await getByAutomationId(page, ids.host).fill('127.0.0.1');
  await getByAutomationId(page, ids.port).fill(String(upstreamLab.proxyPort));
  await screenshotStep('填写真实Manual上游的Host和Port / Enter the actual Manual upstream Host and Port', {
    highlights: [
      { target: getByAutomationId(page, ids.host), label: '1' },
      { target: getByAutomationId(page, ids.port), label: '2' },
      { target: getByAutomationId(page, ids.apply), label: '3' },
    ],
  });
  await getByAutomationId(page, ids.discard).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
  await screenshotStep('放弃Manual草稿，当前System路线不变 / Discard the Manual draft without changing the System route');
  await getByAutomationId(page, ids.mode.manual).check();
  await getByAutomationId(page, ids.host).fill('127.0.0.1');
  await getByAutomationId(page, ids.port).fill(String(upstreamLab.proxyPort));
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  await expect(getByAutomationId(page, ids.apply)).toBeDisabled();
  await screenshotStep('用户操作：草稿取消不改路线；Manual通过两个入口共用的Apply生效。 / User actions: cancelling a draft keeps the route; Manual is applied through the shared settings operation.');

  // 业务断言：实际连接经过上游，PAC分别选择代理和DIRECT，不以按钮文案代替网络结果。
  // Business assertions: real traffic crosses the proxy; PAC selects proxy and DIRECT independently of UI labels.
  const manualPath = `/manual-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${manualPath}`))
    .toBe(`upstream-e2e:${manualPath}`);
  await expect.poll(() => upstreamLab.proxiedTargets.length).toBeGreaterThan(0);
  await showCapturedRequest(manualPath, '查看实际通过Manual上游的请求 / Inspect the request sent through the Manual upstream');
  await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
  await getByAutomationId(page, ids.trigger).click();
  await screenshotStep('从Capture打开当前Manual快捷设置 / Open the current Manual route from Capture');
  await getByAutomationId(page, ids.mode.pac).check();
  const pacUrl = `http://127.0.0.1:${upstreamLab.originPort}/proxy.pac`;
  await getByAutomationId(page, ids.pacUrl).fill(pacUrl);
  await screenshotStep('填写快捷PAC草稿，可取消而不改变Manual路线 / Enter a PAC shortcut draft that can be cancelled without changing Manual', {
    highlights: [
      { target: getByAutomationId(page, ids.pacUrl), label: '1' },
      { target: getByAutomationId(page, ids.close), label: '2' },
    ],
  });
  await getByAutomationId(page, ids.close).click();
  await expect(getByAutomationId(page, ids.popover)).not.toBeVisible();
  await getByAutomationId(page, ids.trigger).click();
  await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
  await screenshotStep('取消后重新打开快捷设置，仍为Manual / Reopen the shortcut after cancellation and retain Manual');
  await getByAutomationId(page, ids.mode.pac).check();
  await getByAutomationId(page, ids.pacUrl).fill(pacUrl);
  await screenshotStep('填写PAC草稿并找到Open in Settings / Enter a PAC draft and locate Open in Settings', {
    highlights: [
      { target: getByAutomationId(page, ids.pacUrl), label: '1' },
      { target: getByAutomationId(page, ids.openSettings), label: '2' },
    ],
  });
  await getByAutomationId(page, ids.openSettings).click();
  await expect(getByAutomationId(page, ids.pacUrl)).toHaveValue(pacUrl);
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  await screenshotStep('Settings保留同一PAC草稿，当前路线尚未改变 / Settings retains the same PAC draft without changing the active route', {
    highlights: [
      { target: getByAutomationId(page, ids.pacUrl), label: '1' },
      { target: getByAutomationId(page, ids.apply), label: '2' },
    ],
  });
  await getByAutomationId(page, ids.discard).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  await screenshotStep('在Settings放弃PAC草稿，保留Manual路线 / Discard the PAC draft in Settings and retain Manual');
  await getByAutomationId(page, ids.mode.pac).check();
  await getByAutomationId(page, ids.pacUrl).fill(pacUrl);
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'pac');
  await screenshotStep('Apply后Current route显示PAC / Current route shows PAC after Apply');
  const beforePac = upstreamLab.proxiedTargets.length;
  const pacPath = `/pac-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${pacPath}`))
    .toBe(`upstream-e2e:${pacPath}`);
  await expect.poll(() => upstreamLab.proxiedTargets.length).toBeGreaterThan(beforePac);
  await showCapturedRequest(pacPath, '查看PAC选择PROXY的请求 / Inspect the request for which PAC selects PROXY');
  const beforeDirect = upstreamLab.proxiedTargets.length;
  const bypassPath = `/pac-direct-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://localhost:${upstreamLab.originPort}${bypassPath}`))
    .toBe(`upstream-e2e:${bypassPath}`);
  expect(upstreamLab.proxiedTargets.length).toBe(beforeDirect);
  await showCapturedRequest(bypassPath, '查看PAC选择DIRECT的localhost请求 / Inspect the localhost request for which PAC selects DIRECT');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
  await getByAutomationId(page, ids.mode.direct).check();
  await screenshotStep('选择Direct并准备应用 / Select Direct before applying the route', {
    highlights: [{ target: getByAutomationId(page, ids.apply), label: '1' }],
  });
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'direct');
  await screenshotStep('业务断言：实际连接经过上游，PAC分别选择代理和DIRECT，不以按钮文案代替网络结果。 / Business assertions: real traffic crosses the proxy; PAC selects proxy and DIRECT independently of UI labels.');

  // 证据与用户重启：经产品Close退出，同一profile回载真实SQLite偏好。
  // Evidence and user restart: exit through product Close, then reload the real SQLite preference from the same profile.
  await screenshotStep('保存Direct路线后正常关闭App / Close the App normally after saving the Direct route', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.shell.window.close), label: '1' }],
  });
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'upstream-restarted',
  });
  try {
    await restartedApp.waitUntilReady();
    await expect(getByAutomationId(restartedApp.page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'direct');
    await startRecording(restartedApp);
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(marker);
    const restartPath = `/restart-${marker}`;
    expect(await requestThroughCapture(restartedApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${restartPath}`))
      .toBe(`upstream-e2e:${restartPath}`);
    expect(upstreamLab.proxiedTargets.length).toBe(beforeDirect);
    expect(upstreamLab.paths).toEqual([manualPath, pacPath, bypassPath, restartPath]);
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.settings.section.upstream).click();
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'direct');
    await screenshotStep('真实重启后保留Direct路线 / Retain the Direct route after a real restart');
    await getByAutomationId(restartedApp.page, ids.mode.system).check();
    await screenshotStep('需要恢复原出口时选择System并Apply / Select System and Apply to return to the original upstream settings', {
      highlights: [{ target: getByAutomationId(restartedApp.page, ids.apply), label: '1' }],
    });
    await getByAutomationId(restartedApp.page, ids.apply).click();
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
    await screenshotStep('确认Current route已经回到System / Confirm Current route has returned to System');
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('upstream-routing.json'), JSON.stringify({
      manual: true, pacProxy: true, pacDirect: true, directAfterRestart: true,
      requests: upstreamLab.paths, proxiedConnections: upstreamLab.proxiedTargets.length,
    }, null, 2), 'utf8');
  } finally {
    // 清理：第二代正常Close；宿主guard核验两代进程、8888、代理、journal及证书。
    // Cleanup: close the second generation normally; the host guard verifies both generations, port 8888, proxies, journal and certificates.
    await restartedApp.stopTrace(testInfo);
    try { await restartedApp.closeGracefully(); }
    finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});

test('settings.upstream preserves Manual Direct System choices across a real restart', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.fixed-routes' });
  const ids = AUTOMATION_IDS.upstream;
  const marker = randomUUID();
  const { page } = desktopApp;

  // 准备：使用真实App、独立profile及当前workflow的回环源站和上游。
  // Arrange: use the real App, isolated profile and this workflow's loopback origin and proxy.
  await getByAutomationId(page, ids.trigger).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
  await getByAutomationId(page, ids.mode.manual).check();
  await getByAutomationId(page, ids.host).fill('127.0.0.1');
  await getByAutomationId(page, ids.port).fill(String(upstreamLab.proxyPort));
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  await expect(getByAutomationId(page, ids.apply)).toBeDisabled();
  await screenshotStep('准备：使用真实App、独立profile及当前workflow的回环源站和上游。 / Arrange: use the real App, isolated profile and this workflow\'s loopback origin and proxy.');

  // 用户操作与业务断言：Manual真实经上游，取消Direct不改路线，Apply Direct后不再经过上游。
  // User actions and assertions: Manual really uses the proxy; cancelling Direct keeps it, then applying Direct bypasses it.
  const manualPath = `/fixed-manual-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${manualPath}`))
    .toBe(`upstream-e2e:${manualPath}`);
  expect(upstreamLab.proxiedTargets).toHaveLength(1);
  await getByAutomationId(page, ids.mode.direct).check();
  await getByAutomationId(page, ids.discard).click();
  await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
  await getByAutomationId(page, ids.trigger).click();
  await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
  await getByAutomationId(page, ids.mode.direct).check();
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'direct');
  const directPath = `/fixed-direct-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${directPath}`))
    .toBe(`upstream-e2e:${directPath}`);
  expect(upstreamLab.proxiedTargets).toHaveLength(1);
  await getByAutomationId(page, ids.mode.system).check();
  await getByAutomationId(page, ids.openSettings).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'direct');
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
  await getByAutomationId(page, ids.mode.manual).check();
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  await screenshotStep('用户操作与业务断言：Manual真实经上游，取消Direct不改路线，Apply Direct后不再经过上游。 / User actions and assertions: Manual really uses the proxy; cancelling Direct keeps it, then applying Direct bypasses it.');

  // 用户重启：正常Close后复用同一profile，确认Manual及其参数由SQLite回载，而非测试注入。
  // User restart: close normally and reuse the same profile; Manual and its parameters reload from SQLite, not test injection.
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'fixed-upstream-restarted',
  });
  try {
    await restartedApp.waitUntilReady();
    await expect(getByAutomationId(restartedApp.page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
    const restartPath = `/fixed-restart-${marker}`;
    expect(await requestThroughCapture(restartedApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${restartPath}`))
      .toBe(`upstream-e2e:${restartPath}`);
    expect(upstreamLab.proxiedTargets).toHaveLength(2);
    expect(upstreamLab.paths).toEqual([manualPath, directPath, restartPath]);

    // 证据：保存真实路由及无重放结果；PAC测试仍独立保留，不能由本条代替。
    // Evidence: preserve actual routing and no-replay results; this does not replace the separate failing PAC workflow.
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('fixed-upstream-routing.json'), JSON.stringify({
      scope: 'Manual HTTP, Direct, System selection and persistence; PAC/WPAD not covered',
      manualProxyUsed: true, directBypassedProxy: true, restartLoadedManual: true,
      paths: upstreamLab.paths, proxiedConnections: upstreamLab.proxiedTargets.length,
    }, null, 2), 'utf8');
  } finally {
    // 清理：第二代经产品Close，宿主guard核对原代理、所有App代际及8888恢复。
    // Cleanup: close generation two through the product; the host guard verifies the original proxy, all generations and port 8888.
    await restartedApp.stopTrace(testInfo);
    try { await restartedApp.closeGracefully(); }
    finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});

test('settings.upstream keeps the Manual route after unavailable PAC or WPAD', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.failure-preservation' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：只读确认当前网络没有WPAD来源；为连接失败提供本workflow真实关闭的PAC端口。
  // Arrange: read the real network's absent WPAD inputs and close this workflow's own PAC port for a connection failure.
  const helperPath = path.resolve(desktopApp.desktopDirectory, '../../packages/platform-capabilities/dist/system-proxy/macos-proxy-helper');
  const { stdout } = await promisify(execFile)(helperPath, ['get-wpad-settings'], { encoding: 'utf8' });
  expect(JSON.parse(stdout), 'This negative scenario requires a real network without DHCP PAC or search domains.')
    .toEqual({ searchDomains: [], dhcpPacUrl: null });
  const unavailablePac = http.createServer((_request, response) => response.end());
  unavailablePac.listen(0, '127.0.0.1');
  await once(unavailablePac, 'listening');
  const address = unavailablePac.address();
  if (!address || typeof address === 'string') throw new Error('PAC fixture has no TCP address.');
  await new Promise<void>((resolve, reject) => unavailablePac.close(error => error ? reject(error) : resolve()));

  // 用户操作：由真实UI应用Manual，再分别尝试有效格式但不可访问的PAC及未发现配置的WPAD。
  // User actions: apply Manual through real UI, then try an unreachable valid PAC URL and WPAD with no discoverable configuration.
  await getByAutomationId(page, ids.trigger).click();
  await getByAutomationId(page, ids.mode.manual).check();
  await getByAutomationId(page, ids.host).fill('127.0.0.1');
  await getByAutomationId(page, ids.port).fill(String(upstreamLab.proxyPort));
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  for (const mode of ['pac', 'wpad'] as const) {
    await getByAutomationId(page, ids.mode[mode]).check();
    if (mode === 'pac') {
      await getByAutomationId(page, ids.pacUrl).fill(`http://127.0.0.1:${address.port}/unavailable.pac`);
    }
    await getByAutomationId(page, ids.apply).click();
    await expect(getByAutomationId(page, ids.error)).toBeVisible();
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
    await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');

    // 业务断言：错误后真实请求仍走原Manual上游，不因失败切为DIRECT或保存待应用草稿。
    // Business assertions: requests after each error still use Manual, without switching to DIRECT or committing the failed draft.
    const requestPath = `/failure-keeps-manual-${mode}-${randomUUID()}`;
    const before = upstreamLab.proxiedTargets.length;
    expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${requestPath}`))
      .toBe(`upstream-e2e:${requestPath}`);
    expect(upstreamLab.proxiedTargets.length).toBe(before + 1);
  }
  await getByAutomationId(page, ids.discard).click();
  await getByAutomationId(page, ids.trigger).click();
  await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
  await expect(getByAutomationId(page, ids.error)).toHaveCount(0);
  await screenshotStep('用户操作：由真实UI应用Manual，再分别尝试有效格式但不可访问的PAC及未发现配置的WPAD。 / User actions: apply Manual through real UI, then try an unreachable valid PAC URL and WPAD with no discoverable configuration.');

  // 证据：保存失败后的有效模式及真实路由结果，不把缺少WPAD的用例当作发现成功。
  // Evidence: record the effective mode and actual route after failures, without claiming successful WPAD discovery.
  await writeFile(testInfo.outputPath('upstream-failure-preservation.json'), JSON.stringify({
    scope: 'Unreachable PAC and missing WPAD preserve the Manual route; not WPAD success acceptance',
    requests: upstreamLab.paths, proxiedConnections: upstreamLab.proxiedTargets.length,
    activeMode: 'manual', failuresPreservedRoute: true,
  }, null, 2), 'utf8');

  // 清理：关闭浮层后由标准fixture点击产品Close并检查完整进程和宿主恢复。
  // Cleanup: dismiss the flyout; the standard fixture uses product Close and verifies complete process and host recovery.
  await getByAutomationId(page, ids.close).click();
  await screenshotStep('清理：关闭浮层后由标准fixture点击产品Close并检查完整进程和宿主恢复。 / Cleanup: dismiss the flyout; the standard fixture uses product Close and verifies complete process and host recovery.');
});

test('settings.upstream discovers DNS WPAD and reloads its saved mode through a real restart', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(60_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.dns-discovery' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：只读确认外部定时保护已建立真实系统搜索域，不在workflow内改系统DNS或伪造发现结果。
  // Arrange: read the real search domain established by the external guardian, without changing DNS or fabricating discovery.
  const helperPath = path.resolve(desktopApp.desktopDirectory, '../../packages/platform-capabilities/dist/system-proxy/macos-proxy-helper');
  const { stdout } = await promisify(execFile)(helperPath, ['get-wpad-settings'], { encoding: 'utf8' });
  const discovery: unknown = JSON.parse(stdout);
  if (typeof discovery !== 'object' || discovery === null
    || !('searchDomains' in discovery) || !Array.isArray(discovery.searchDomains)
    || !('dhcpPacUrl' in discovery) || discovery.dhcpPacUrl !== null) {
    throw new Error('DNS WPAD acceptance requires real search domains and no DHCP PAC source.');
  }
  const labDomain = discovery.searchDomains.find((value: unknown): value is string =>
    typeof value === 'string' && /^r[0-9a-f]{12}\.interceptor-wpad\.test$/.test(value));
  if (!labDomain) throw new Error('Start the protected DNS WPAD lab before running this workflow.');
  const expectedPacUrl = `http://wpad.${labDomain}/wpad.dat`;

  // 用户操作：快捷浮层仅选择WPAD，由Main发现地址；跳转Settings后确认两个入口共用生效值。
  // User actions: select WPAD without entering a URL, then open Settings to verify the same applied discovery result.
  await getByAutomationId(page, ids.trigger).click();
  await getByAutomationId(page, ids.mode.wpad).check();
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'wpad');
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
  await expect(getByAutomationId(page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
  await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'wpad');
  await getByAutomationId(page, ids.openSettings).click();
  await expect(getByAutomationId(page, ids.mode.wpad)).toBeChecked();
  await expect(getByAutomationId(page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
  await screenshotStep('用户操作：快捷浮层仅选择WPAD，由Main发现地址；跳转Settings后确认两个入口共用生效值。 / User actions: select WPAD without entering a URL, then open Settings to verify the same applied discovery result.');

  // 业务断言：本DNS场景的PAC明确选择DIRECT，真实Core仍须转发；PAC HTTP上游由独立回归覆盖。
  // Business assertions: this DNS scenario's PAC selects DIRECT through real Core; plain-HTTP proxying has a separate regression.
  const firstPath = `/dns-wpad-${randomUUID()}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${firstPath}`))
    .toBe(`upstream-e2e:${firstPath}`);
  expect(upstreamLab.proxiedTargets).toHaveLength(0);

  // 用户重启：正常Close后复用同一profile，确认WPAD偏好持久化并重新执行真实发现。
  // User restart: close normally and reuse the profile to verify persisted WPAD selection and fresh discovery.
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'dns-wpad-restarted',
  });

  try {
    await restartedApp.waitUntilReady();
    await expect(getByAutomationId(restartedApp.page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'wpad');
    await getByAutomationId(restartedApp.page, ids.trigger).click();
    await expect(getByAutomationId(restartedApp.page, ids.mode.wpad)).toBeChecked();
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
    const restartPath = `/dns-wpad-restart-${randomUUID()}`;
    expect(await requestThroughCapture(restartedApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${restartPath}`))
      .toBe(`upstream-e2e:${restartPath}`);
    expect(upstreamLab.paths).toEqual([firstPath, restartPath]);
    expect(upstreamLab.proxiedTargets).toHaveLength(0);

    // 证据：保存真实URL、DIRECT路径和回载结果，不代替系统Auto Detect、DHCP及HTTP上游的独立场景。
    // Evidence: retain the discovered URL, DIRECT traffic and persistence without replacing the separate Auto Detect, DHCP or HTTP proxy cases.
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('dns-wpad-routing.json'), JSON.stringify({
      scope: 'Real macOS DNS discovery, PAC DIRECT, shared UI and WPAD persistence',
      pacUrl: expectedPacUrl, paths: upstreamLab.paths, proxiedConnections: upstreamLab.proxiedTargets.length,
      restartLoadedWpad: true, systemAutoDetectVerified: false, dhcpVerified: false,
      pacHttpProxyVerified: false,
    }, null, 2), 'utf8');
    await getByAutomationId(restartedApp.page, ids.close).click();
  } finally {
    // 清理：第二代经产品Close，先核对代理和进程恢复，再由外部保护撤销专用DNS配置。
    // Cleanup: close generation two through the product, verify proxy/process recovery, then let the external guardian remove DNS.
    await restartedApp.stopTrace(testInfo);
    try { await restartedApp.closeGracefully(); }
    finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});

test('settings.upstream discovers DHCP WPAD and reloads its routes through a real restart', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(60_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.dhcp-discovery' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：外部保护已建立真实DHCP租约；只读核对主网络的Option 252，不写缓存或注入发现结果。
  // Arrange: the external guard owns a real DHCP lease; read its option 252 without writing caches or injecting discovery.
  expect(process.env.INTERCEPTOR_E2E_DHCP_PAC_PORT, 'Start the protected DHCP WPAD lab first.')
    .toBe(String(upstreamLab.originPort));
  const expectedPacUrl = `http://127.0.0.1:${upstreamLab.originPort}/tls-proxy.pac`;
  const helperPath = path.resolve(desktopApp.desktopDirectory, '../../packages/platform-capabilities/dist/system-proxy/macos-proxy-helper');
  const { stdout } = await promisify(execFile)(helperPath, ['get-wpad-settings'], { encoding: 'utf8' });
  expect(JSON.parse(stdout)).toEqual({ dhcpPacUrl: expectedPacUrl, searchDomains: [] });
  const tlsOrigin = await upstreamLab.createTlsOrigin();
  const verifyRoutes = async (app: LocalElectronApplicationDriver, phase: 'initial' | 'restarted'): Promise<void> => {
    const before = upstreamLab.proxiedTargets.length;
    const tlsPath = `/dhcp-https-${phase}-${randomUUID()}`;
    const raw = await requestTlsThroughCapture(app.capturePort(), tlsOrigin.port, tlsPath);
    expect(raw).toMatch(/^HTTP\/1\.1 200 /);
    expect(raw.endsWith(`upstream-tls-e2e:${tlsPath}`)).toBe(true);
    expect(tlsOrigin.paths.at(-1)).toBe(tlsPath);
    expect(upstreamLab.proxiedTargets.slice(before)).toEqual([`localhost:${tlsOrigin.port}`]);
    const directPath = `/dhcp-http-${phase}-${randomUUID()}`;
    expect(await requestThroughCapture(app.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${directPath}`))
      .toBe(`upstream-e2e:${directPath}`);
    expect(upstreamLab.paths.at(-1)).toBe(directPath);
    expect(upstreamLab.proxiedTargets).toHaveLength(before + 1);
  };

  // 用户操作：仅选择WPAD，不填写PAC地址；快捷浮层和Settings必须显示同一DHCP发现结果。
  // User actions: select WPAD without entering a PAC URL; the flyout and Settings must show the same DHCP discovery.
  await getByAutomationId(page, ids.trigger).click();
  await getByAutomationId(page, ids.mode.wpad).check();
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'wpad');
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
  await expect(getByAutomationId(page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
  await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'wpad');
  await getByAutomationId(page, ids.openSettings).click();
  await expect(getByAutomationId(page, ids.mode.wpad)).toBeChecked();
  await expect(getByAutomationId(page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
  await screenshotStep('用户操作：仅选择WPAD，不填写PAC地址；快捷浮层和Settings必须显示同一DHCP发现结果。 / User actions: select WPAD without entering a PAC URL; the flyout and Settings must show the same DHCP discovery.');

  // 业务断言：核对实际PAC下载、HTTPS CONNECT与HTTP DIRECT，而非只看当前模式或HTTP200。
  // Business assertions: verify actual PAC fetches, HTTPS CONNECT and HTTP DIRECT, not just the selected mode or HTTP 200.
  await verifyRoutes(desktopApp, 'initial');
  expect(upstreamLab.pacRequests.length).toBeGreaterThan(0);
  const firstGenerationPacRequests = upstreamLab.pacRequests.length;

  // 用户重启：正常Close后复用profile；第二代必须重新获取PAC并保持两条真实路线。
  // User restart: close normally and reuse the profile; generation two must fetch PAC again and preserve both real routes.
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'dhcp-wpad-restarted',
  });
  try {
    await restartedApp.waitUntilReady();
    const rediscovery = await promisify(execFile)(helperPath, ['get-wpad-settings'], { encoding: 'utf8' });
    expect(JSON.parse(rediscovery.stdout)).toEqual({ dhcpPacUrl: expectedPacUrl, searchDomains: [] });
    await expect(getByAutomationId(restartedApp.page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'wpad');
    await getByAutomationId(restartedApp.page, ids.trigger).click();
    await expect(getByAutomationId(restartedApp.page, ids.mode.wpad)).toBeChecked();
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute).locator('code')).toHaveAttribute('title', expectedPacUrl);
    await verifyRoutes(restartedApp, 'restarted');
    expect(upstreamLab.pacRequests.length).toBeGreaterThan(firstGenerationPacRequests);
    expect(upstreamLab.paths).toHaveLength(2);
    expect(tlsOrigin.paths).toHaveLength(2);

    // 证据：保存真实DHCP来源、PAC下载与两代选路；网络租约报文和完整恢复另由外部保护保留。
    // Evidence: retain real DHCP discovery, PAC fetches and both generations' routes; the external guard retains lease packets and recovery.
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('dhcp-wpad-routing.json'), JSON.stringify({
      scope: 'Real macOS DHCP option 252, shared WPAD UI, HTTPS PROXY, HTTP DIRECT and restart',
      pacUrl: expectedPacUrl, dhcpVerified: true, dnsDiscoveryUsed: false, restartLoadedWpad: true,
      pacRequests: upstreamLab.pacRequests, firstGenerationPacRequests,
      tlsPaths: tlsOrigin.paths, directPaths: upstreamLab.paths, proxiedTargets: upstreamLab.proxiedTargets,
    }, null, 2), 'utf8');
    await getByAutomationId(restartedApp.page, ids.close).click();
  } finally {
    // 清理：第二代通过产品Close，核对进程和代理恢复后才允许外部保护移除隔离DHCP网络。
    // Cleanup: close generation two through the product; verify processes and proxy recovery before removing the isolated DHCP network.
    await restartedApp.stopTrace(testInfo);
    try { await restartedApp.closeGracefully(); }
    finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});

test('settings.upstream inherits system Auto Detect and restores it after a real crash', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(60_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.system-auto-detect' });
  desktopApp.preserveUserDataOnFailure();
  const ids = AUTOMATION_IDS.upstream;

  // 准备：只读检查真实journal的系统原值，不能把测试写入的PAC当作Auto Detect。
  // Arrange: inspect the real journal's original OS settings, without substituting a seeded PAC for Auto Detect.
  const journal: unknown = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8'));
  if (typeof journal !== 'object' || journal === null || !('original' in journal)
    || !('owned' in journal) || !('effectiveProxies' in journal)
    || typeof journal.effectiveProxies !== 'object' || journal.effectiveProxies === null) {
    throw new Error('The real macOS proxy journal is unavailable.');
  }
  const original = parseMacosSystemProxySnapshot(journal.original);
  expect(original.services.length).toBeGreaterThan(0);
  for (const service of original.services) {
    expect(service.settings.ProxyAutoDiscoveryEnable).toBe(1);
    for (const key of ['HTTPEnable', 'HTTPSEnable', 'SOCKSEnable', 'ProxyAutoConfigEnable']) {
      expect(service.settings[key]).toBe(0);
    }
  }
  expect(journal.effectiveProxies).toHaveProperty('ProxyAutoDiscoveryEnable', 1);
  if (!('ProxyAutoConfigURLString' in journal.effectiveProxies)
    || typeof journal.effectiveProxies.ProxyAutoConfigURLString !== 'string') {
    throw new Error('macOS did not expose its automatic PAC URL.');
  }
  const systemPacUrl = journal.effectiveProxies.ProxyAutoConfigURLString;
  expect(systemPacUrl).toBe('http://wpad/wpad.dat');

  // 用户操作：打开默认System的快捷浮层，检查其发现的真实PAC，不手填地址。
  // User actions: open the default System route and inspect its discovered PAC, without entering a URL.
  await getByAutomationId(desktopApp.page, ids.trigger).click();
  await expect(getByAutomationId(desktopApp.page, ids.mode.system)).toBeChecked();
  await expect(getByAutomationId(desktopApp.page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
  const pacUrl = await getByAutomationId(desktopApp.page, ids.currentRoute).locator('code').getAttribute('title');
  if (!pacUrl) throw new Error('System Auto Detect did not expose a discovered PAC URL.');
  expect(pacUrl).toBe(systemPacUrl);
  const firstPath = `/system-wpad-${randomUUID()}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${firstPath}`))
    .toBe(`upstream-e2e:${firstPath}`);
  await screenshotStep('用户操作：打开默认System的快捷浮层，检查其发现的真实PAC，不手填地址。 / User actions: open the default System route and inspect its discovered PAC, without entering a URL.');

  // 异常退出：精确终止第一代后，用fresh profile启动第二代，保留共享journal的原配置。
  // Abrupt exit: terminate only generation one, then start a fresh profile while retaining the shared original journal.
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.crashAbruptly(testInfo);
  const restartedApp = await desktopApp.relaunchAfterCrash(testInfo, 'system-wpad-restarted');
  try {
    await restartedApp.waitUntilReady();
    await getByAutomationId(restartedApp.page, ids.trigger).click();
    await expect(getByAutomationId(restartedApp.page, ids.mode.system)).toBeChecked();
    await expect(getByAutomationId(restartedApp.page, ids.currentRoute).locator('code')).toHaveAttribute('title', pacUrl);
    const reloadedJournal: unknown = JSON.parse(await readFile(restartedApp.systemProxyJournalPath(), 'utf8'));
    expect(reloadedJournal).toEqual(journal);
    const restartPath = `/system-wpad-crash-restart-${randomUUID()}`;
    expect(await requestThroughCapture(restartedApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${restartPath}`))
      .toBe(`upstream-e2e:${restartPath}`);
    expect(upstreamLab.paths).toEqual([firstPath, restartPath]);
    expect(upstreamLab.proxiedTargets).toHaveLength(0);

    // 证据：保留crash后真实转发与journal不变的事实，记录系统Auto Detect而非DHCP结论。
    // Evidence: retain real traffic and unchanged journal after the crash, limited to system Auto Detect rather than DHCP.
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('system-wpad-crash-routing.json'), JSON.stringify({
      scope: 'System Auto Detect via real DNS, PAC DIRECT and cross-profile crash recovery',
      pacUrl, paths: upstreamLab.paths, originalAutoDetectPreserved: true,
      sharedJournalUnchanged: true, dhcpVerified: false, pacHttpProxyVerified: false,
    }, null, 2), 'utf8');
    await getByAutomationId(restartedApp.page, ids.close).click();
  } finally {
    // 清理：正常Close应先恢复Auto Detect，由独立外层保护再撤销实验代理和DNS。
    // Cleanup: normal Close must first restore Auto Detect, before the independent outer guardians undo experimental proxy and DNS.
    await restartedApp.stopTrace(testInfo);
    try {
      await restartedApp.closeGracefully();
      expect(await restartedApp.readSystemProxySettings()).toEqual(original);
    } finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
  desktopApp.releasePreservedUserData();
});

test('settings.upstream applies an explicit PAC to HTTPS PROXY and HTTP DIRECT', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(90_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.explicit-pac-routing' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：fixture提供本轮真实PAC、TLS源站及CONNECT代理，不改变DNS或系统CA。
  // Arrange: the fixture owns a real PAC, TLS origin and CONNECT proxy without changing DNS or system CA.
  const tlsOrigin = await upstreamLab.createTlsOrigin();
  const pacUrl = `http://127.0.0.1:${upstreamLab.originPort}/tls-proxy.pac`;
  const marker = randomUUID();

  // 用户操作：通过Settings输入并Apply显式PAC，Capture按钮读取同一生效配置。
  // User actions: apply the explicit PAC through Settings and verify the same saved mode in Capture.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
  await getByAutomationId(page, ids.mode.pac).check();
  await getByAutomationId(page, ids.pacUrl).fill(pacUrl);
  await getByAutomationId(page, ids.apply).click();
  await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'pac');
  await expect(getByAutomationId(page, ids.currentRoute).locator('code')).toHaveAttribute('title', pacUrl);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'pac');
  await screenshotStep('用户操作：通过Settings输入并Apply显式PAC，Capture按钮读取同一生效配置。 / User actions: apply the explicit PAC through Settings and verify the same saved mode in Capture.');

  // 业务断言：HTTPS必须经过实际CONNECT，HTTP必须DIRECT，不能只看源站200。
  // Business assertions: HTTPS must use the observed CONNECT route, while HTTP is DIRECT; origin HTTP 200 alone is insufficient.
  const tlsPath = `/explicit-pac-https-${marker}`;
  const raw = await requestTlsThroughCapture(desktopApp.capturePort(), tlsOrigin.port, tlsPath);
  expect(raw).toMatch(/^HTTP\/1\.1 200 /);
  expect(raw.endsWith(`upstream-tls-e2e:${tlsPath}`)).toBe(true);
  expect(upstreamLab.proxiedTargets).toEqual([`localhost:${tlsOrigin.port}`]);
  expect(tlsOrigin.paths).toEqual([tlsPath]);
  const directPath = `/explicit-pac-direct-${marker}`;
  expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${directPath}`))
    .toBe(`upstream-e2e:${directPath}`);
  expect(upstreamLab.paths).toEqual([directPath]);
  expect(upstreamLab.proxiedTargets).toHaveLength(1);

  // 证据：记录两条真实出口，不以此代替DNS-WPAD或DHCP验收。
  // Evidence: record both actual routes without replacing DNS-WPAD or DHCP acceptance.
  await writeFile(testInfo.outputPath('explicit-pac-routes.json'), JSON.stringify({
    scope: 'Explicit PAC HTTPS PROXY and HTTP DIRECT',
    tlsPaths: tlsOrigin.paths, directPaths: upstreamLab.paths,
    proxiedTargets: upstreamLab.proxiedTargets, pacUrl, dnsChanged: false,
  }, null, 2), 'utf8');

  // 清理：标准fixture使用产品Close，检查Main/Core/Worker、8888和原代理恢复。
  // Cleanup: the standard fixture uses product Close and verifies all processes, port 8888 and original proxy settings.
});

test('settings.upstream routes HTTPS PROXY and HTTP DIRECT through discovered WPAD and explicit PAC', async ({ desktopApp, upstreamLab }, testInfo) => {
  test.setTimeout(60_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.macos.pac-routing' });
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：外部保护已提供真实DNS/PAC，fixture代理仅允许本轮HTTP和HTTPS源站。
  // Arrange: the external guard owns real DNS/PAC; the fixture proxy only permits this run's HTTP and HTTPS origins.
  expect(process.env.INTERCEPTOR_E2E_WPAD_PROXY_PORT, 'Start the protected HTTPS-routing WPAD lab first.')
    .toBe(String(upstreamLab.proxyPort));
  const tlsOrigin = await upstreamLab.createTlsOrigin();
  let discoveredPacUrl: string | null = null;
  for (const mode of ['wpad', 'pac'] as const) {
    // 用户操作：先从WPAD发现PAC，再通过同一真实编辑器显式应用该PAC，不注入Core配置。
    // User actions: discover via WPAD, then explicitly apply that PAC through the same real editor without injecting Core state.
    if (mode === 'wpad') await getByAutomationId(page, ids.trigger).click();
    await getByAutomationId(page, ids.mode[mode]).check();
    if (mode === 'pac') {
      if (!discoveredPacUrl) throw new Error('WPAD did not provide a PAC URL.');
      await getByAutomationId(page, ids.pacUrl).fill(discoveredPacUrl);
    }
    await getByAutomationId(page, ids.apply).click();
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', mode);
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
    discoveredPacUrl = await getByAutomationId(page, ids.currentRoute).locator('code').getAttribute('title');
    expect(discoveredPacUrl).toMatch(/^http:\/\/wpad\.r[0-9a-f]{12}\.interceptor-wpad\.test\/wpad\.dat$/);
    await screenshotStep('用户操作：先从WPAD发现PAC，再通过同一真实编辑器显式应用该PAC，不注入Core配置。 / User actions: discover via WPAD, then explicitly apply that PAC through the same real editor without injecting Core state.');

    // 业务断言：HTTPS必须经过唯一上游CONNECT，HTTP必须按PAC的DIRECT绕过上游。
    // Business assertions: HTTPS must cross one upstream CONNECT, while HTTP must bypass it via the PAC's DIRECT result.
    const tlsPath = `/https-proxy-${mode}-${randomUUID()}`;
    const before = upstreamLab.proxiedTargets.length;
    const raw = await requestTlsThroughCapture(desktopApp.capturePort(), tlsOrigin.port, tlsPath);
    expect(raw).toMatch(/^HTTP\/1\.1 200 /);
    expect(raw.endsWith(`upstream-tls-e2e:${tlsPath}`)).toBe(true);
    expect(upstreamLab.proxiedTargets.slice(before)).toEqual([`localhost:${tlsOrigin.port}`]);
    expect(tlsOrigin.paths.at(-1)).toBe(tlsPath);
    const directPath = `/http-direct-${mode}-${randomUUID()}`;
    expect(await requestThroughCapture(desktopApp.capturePort(), `http://127.0.0.1:${upstreamLab.originPort}${directPath}`))
      .toBe(`upstream-e2e:${directPath}`);
    expect(upstreamLab.proxiedTargets).toHaveLength(before + 1);
  }
  await screenshotStep('准备：外部保护已提供真实DNS/PAC，fixture代理仅允许本轮HTTP和HTTPS源站。 / Arrange: the external guard owns real DNS/PAC; the fixture proxy only permits this run\'s HTTP and HTTPS origins.');

  // 证据：两种模式各有实际PROXY/DIRECT结果，PAC明文HTTP上游仍由独立回归验证。
  // Evidence: both modes have actual PROXY/DIRECT results; plain-HTTP upstream behavior has its own regression.
  await writeFile(testInfo.outputPath('wpad-pac-https-routing.json'), JSON.stringify({
    scope: 'Discovered WPAD and explicit PAC: HTTPS through proxy, HTTP DIRECT',
    pacUrl: discoveredPacUrl, tlsPaths: tlsOrigin.paths, directPaths: upstreamLab.paths,
    proxiedConnections: upstreamLab.proxiedTargets.length, pacPlainHttpProxyVerified: false, dhcpVerified: false,
  }, null, 2), 'utf8');

  // 清理：退出浮层，标准fixture正常Close并核对宿主；外层保护最后撤销DNS。
  // Cleanup: dismiss the flyout, close normally through the standard fixture, then let the outer guard remove DNS.
  await getByAutomationId(page, ids.close).click();
  await screenshotStep('清理：退出浮层，标准fixture正常Close并核对宿主；外层保护最后撤销DNS。 / Cleanup: dismiss the flyout, close normally through the standard fixture, then let the outer guard remove DNS.');
});
