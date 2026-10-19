import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import { generateCACertificate } from 'mockttp';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const network = process.env.INTERCEPTOR_E2E_WPAD_NETWORK;
const mode = process.env.INTERCEPTOR_E2E_WPAD_MODE;
test.skip(process.platform !== 'win32' || network === undefined, 'Requires the isolated Windows DNS/DHCP WPAD lab.');

test('settings.upstream.windows discovers the isolated network and restores routes across generations', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  if (!['dns', 'dhcp', 'both'].includes(network ?? '') || !['wpad', 'system'].includes(mode ?? '')) {
    throw new Error('Select a real DNS/DHCP lab and the WPAD or System workflow mode.');
  }
  testInfo.annotations.push({ type: 'renderer-workflow', description: `settings.upstream.windows.${network}.${mode}` });
  desktopApp.preserveUserDataOnFailure();
  const expectedProxyPort = network === 'dns' ? 18081 : 18082;
  const expectedPacPath = network === 'dns' ? '/wpad.dat' : '/dhcp.pac';
  const ids = AUTOMATION_IDS.upstream;
  const connections: { proxyPort: number; target: string; protocol: 'http' | 'connect' }[] = [];
  const observations: { generation: string; pacUrl: string; proxiedHttp: boolean; directHttp: boolean; proxiedTls: boolean }[] = [];
  const sockets = new Set<Duplex>();
  const certificate = await generateCACertificate({ subject: { commonName: 'localhost' } });
  const tlsOrigin = https.createServer({ key: certificate.key, cert: certificate.cert }, (request, response) => {
    response.end(`tls-origin:${request.url}`);
  });
  tlsOrigin.on('connection', trackSocket);
  tlsOrigin.listen(0, '127.0.0.1');
  await once(tlsOrigin, 'listening');
  const tlsAddress = tlsOrigin.address();
  if (!tlsAddress || typeof tlsAddress === 'string') throw new Error('The TLS origin has no port.');
  const tlsPort = tlsAddress.port;
  const proxies = [18081, 18082].map(createUpstream);
  const proxiesReady = Promise.all(proxies.map(proxy => once(proxy, 'listening')));
  let nextGeneration: LocalElectronApplicationDriver | null = null;
  let nextGenerationClosed = false;
  let original: unknown;

  try {
    // 准备：真实系统配置和隔离网络由外部lab提供，fixture只拥有可观测的origin和两条上游。
    // Arrange: the external isolated lab supplies native configuration; this fixture owns only observable origins and upstreams.
    const startupJournal: unknown = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8'));
    if (typeof startupJournal !== 'object' || startupJournal === null || !('original' in startupJournal)) {
      throw new Error('The real startup takeover did not retain its original WinINet snapshot.');
    }
    original = startupJournal.original;
    expect(original).toMatchObject({ flags: mode === 'system' ? 9 : 1, proxyEnabled: false, autoDetect: mode === 'system', pacUrl: null });
    await proxiesReady;
    await startRecording(desktopApp);

    // 用户操作：只在UI选择WPAD或保留System，不把发现到的PAC URL填入产品。
    // User actions: select WPAD in the UI or retain System, never entering the discovered PAC URL.
    await getByAutomationId(desktopApp.page, ids.trigger).click();
    if (mode === 'wpad') {
      await getByAutomationId(desktopApp.page, ids.mode.wpad).check();
      await getByAutomationId(desktopApp.page, ids.apply).click();
    }
    await assertRouteAndTraffic(desktopApp, 'initial');
    await getByAutomationId(desktopApp.page, ids.openSettings).click();
    await expect(getByAutomationId(desktopApp.page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', mode!);
    await expect(getByAutomationId(desktopApp.page, ids.currentRoute)).toHaveAttribute('data-route-kind', 'pac');
    const firstJournal: unknown = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8'));
    expect(firstJournal).toMatchObject({ version: 1, original });
    await screenshotStep('用户操作：只在UI选择WPAD或保留System，不把发现到的PAC URL填入产品。 / User actions: select WPAD in the UI or retain System, never entering the discovered PAC URL.');

    // 业务断言：WPAD正常重启回载偏好；System跨profile崩溃恢复原快照，并重新配置新Core的PAC路线。
    // Business assertions: WPAD reloads its saved intent; System recovers the original journal across fresh profiles and configures PAC in the new Core.
    await desktopApp.captureFinalScreenshot(testInfo);
    if (mode === 'system') {
      await desktopApp.crashAbruptly(testInfo);
      nextGeneration = await desktopApp.relaunchAfterCrash(testInfo, 'recovered');
    } else {
      await desktopApp.stopTrace(testInfo);
      await desktopApp.closeGracefully();
      await desktopApp.writeEvidence(testInfo);
      expect(await desktopApp.readSystemProxySettings()).toEqual(original);
      nextGeneration = await LocalElectronApplicationDriver.launch(testInfo, {
        userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'reloaded',
      });
    }
    await nextGeneration.waitUntilReady();
    await startRecording(nextGeneration);
    await getByAutomationId(nextGeneration.page, ids.trigger).click();
    await assertRouteAndTraffic(nextGeneration, mode === 'system' ? 'recovered' : 'reloaded');
    const recoveredJournal: unknown = JSON.parse(await readFile(nextGeneration.systemProxyJournalPath(), 'utf8'));
    expect(recoveredJournal).toMatchObject({ version: 1, original });
    if (mode === 'system') expect(recoveredJournal).toEqual(firstJournal);

    const core = await nextGeneration.currentCoreProcessIdentity();
    await getByAutomationId(nextGeneration.page, ids.close).click();
    await nextGeneration.terminateCoreProcessGeneration(core);
    await nextGeneration.waitForRestartedCoreProcess(core.processId);
    await expect(getByAutomationId(nextGeneration.page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'true', { timeout: 35_000 });
    await getByAutomationId(nextGeneration.page, ids.trigger).click();
    await assertRouteAndTraffic(nextGeneration, 'new-core');
    await getByAutomationId(nextGeneration.page, ids.close).click();

    // 证据：记录真实URL、PAC分流及代际结果；DNS/DHCP来源由同轮服务器报文单独证明。
    // Evidence: retain real PAC URLs, routed traffic and generations; server packet capture independently proves DNS/DHCP origin.
    await nextGeneration.captureFinalScreenshot(testInfo);
    await nextGeneration.stopTrace(testInfo);
    await nextGeneration.closeGracefully();
    await nextGeneration.writeEvidence(testInfo);
    nextGenerationClosed = true;
    expect(await nextGeneration.readSystemProxySettings()).toEqual(original);
    await expect(readFile(nextGeneration.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(testInfo.outputPath('windows-wpad-network.json'), JSON.stringify({
      network, mode, expectedProxyPort, original, observations, connections,
      finalWinInetRestored: true, finalJournalRemoved: true,
    }, null, 2), 'utf8');
    desktopApp.releasePreservedUserData();
  } finally {
    // 清理：每代正常Close或明确记录故意crash，外层guard验证进程、端口、系统代理和共享CA。
    // Cleanup: close each generation normally or record an intentional crash; the outer guard verifies processes, ports, WinINet and the shared CA.
    if (nextGeneration && !nextGenerationClosed) {
      await nextGeneration.stopTrace(testInfo);
      await nextGeneration.closeGracefully();
      await nextGeneration.writeEvidence(testInfo);
    }
    for (const socket of sockets) socket.destroy();
    await Promise.all([...proxies, tlsOrigin].map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
    if (nextGenerationClosed && nextGeneration?.userDataDirectory !== desktopApp.userDataDirectory) {
      await nextGeneration?.removeUserData();
    }
  }

  function trackSocket(socket: Duplex): void {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  }

  function createUpstream(proxyPort: number): http.Server {
    const server = http.createServer((request, response) => {
      if (!URL.canParse(request.url ?? '')) { response.writeHead(400).end(); return; }
      const url = new URL(request.url!);
      if (url.hostname !== '127.0.0.1' || Number(url.port) !== httpTrafficRunner.port) {
        response.writeHead(403).end('Only this workflow origin is allowed.');
        return;
      }
      connections.push({ proxyPort, target: url.href, protocol: 'http' });
      const outgoing = http.request({
        hostname: '127.0.0.1', port: httpTrafficRunner.port, method: request.method,
        path: `${url.pathname}${url.search}`, headers: request.headers, agent: false,
      }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(response);
      });
      outgoing.once('error', error => response.destroy(error));
      request.pipe(outgoing);
    });
    server.on('connection', trackSocket);
    server.on('connect', (request, downstream, head) => {
      if (request.url !== `localhost:${tlsPort}`) {
        downstream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      connections.push({ proxyPort, target: request.url, protocol: 'connect' });
      const upstream = net.connect(tlsPort, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      trackSocket(upstream);
      upstream.once('error', error => downstream.destroy(error));
      downstream.once('error', () => upstream.destroy());
      downstream.once('close', () => upstream.destroy());
    });
    server.listen(proxyPort, '127.0.0.1');
    return server;
  }

  async function assertRouteAndTraffic(driver: LocalElectronApplicationDriver, generation: string): Promise<void> {
    const route = getByAutomationId(driver.page, ids.currentRoute);
    await expect(route).toHaveAttribute('data-upstream-mode', mode!, { timeout: 35_000 });
    await expect(route).toHaveAttribute('data-route-kind', 'pac');
    await expect(getByAutomationId(driver.page, ids.trigger)).toHaveAttribute('data-upstream-mode', mode!);
    await expect(getByAutomationId(driver.page, ids.error)).toHaveCount(0);
    const pacUrl = await route.locator('code').getAttribute('title');
    if (!pacUrl) throw new Error('The discovered PAC URL is not visible in the product.');
    expect(new URL(pacUrl).pathname).toBe(expectedPacPath);
    if (network !== 'dns') expect(pacUrl).toBe('http://192.168.233.1/dhcp.pac');
    const proxiedPath = `/via-upstream-${randomUUID()}`;
    const directPath = `/direct-${randomUUID()}`;
    for (const requestPath of [proxiedPath, directPath]) {
      httpTrafficRunner.respondWith(requestPath, { statusCode: 200, body: requestPath, headers: { 'content-type': 'text/plain' } });
    }
    const before = connections.length;
    expect((await httpTrafficRunner.requestThroughProxy(driver.capturePort(), proxiedPath)).body).toBe(proxiedPath);
    expect(connections.slice(before)).toEqual([{
      proxyPort: expectedProxyPort, target: httpTrafficRunner.url(proxiedPath), protocol: 'http',
    }]);
    expect((await httpTrafficRunner.requestThroughProxy(driver.capturePort(), directPath)).body).toBe(directPath);
    expect(connections.length).toBe(before + 1);
    const tlsPath = `/tls-${randomUUID()}`;
    const response = await requestTls(driver.capturePort(), tlsPath);
    expect(response).toContain(`tls-origin:${tlsPath}`);
    expect(connections.slice(before + 1)).toEqual([{
      proxyPort: expectedProxyPort, target: `localhost:${tlsPort}`, protocol: 'connect',
    }]);
    observations.push({ generation, pacUrl, proxiedHttp: true, directHttp: true, proxiedTls: true });
  }

  function requestTls(capturePort: number, requestPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port: capturePort, method: 'CONNECT', path: `localhost:${tlsPort}`, agent: false,
      });
      request.once('connect', (response, socket, head) => {
        if (response.statusCode !== 200 || head.length > 0) {
          socket.destroy();
          reject(new Error(`Unexpected capture CONNECT status: ${response.statusCode}`));
          return;
        }
        const secure = tls.connect({ socket, servername: 'localhost', rejectUnauthorized: false }, () => {
          secure.write(`GET ${requestPath} HTTP/1.1\r\nHost: localhost:${tlsPort}\r\nConnection: close\r\n\r\n`);
        });
        trackSocket(secure);
        let body = '';
        secure.setEncoding('utf8');
        secure.setTimeout(10_000, () => secure.destroy(new Error('The test TLS response timed out.')));
        secure.on('data', chunk => { body += chunk; });
        secure.once('end', () => resolve(body));
        secure.once('error', reject);
      });
      request.setTimeout(10_000, () => request.destroy(new Error('The test CONNECT timed out.')));
      request.once('error', reject);
      request.end();
    });
  }
});
