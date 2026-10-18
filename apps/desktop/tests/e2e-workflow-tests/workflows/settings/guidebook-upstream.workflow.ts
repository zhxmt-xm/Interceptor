import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('settings guide applies owned Manual and PAC routes and distinguishes draft cancellation', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const ids = AUTOMATION_IDS.upstream;
  const prefix = '/guide/upstream';
  const proxiedTargets: string[] = [];
  const sockets = new Set<Duplex>();
  const proxy = http.createServer((incoming, response) => {
    if (!URL.canParse(incoming.url ?? '')) {
      response.writeHead(400).end('The demonstration proxy requires an absolute URL.');
      return;
    }
    const target = new URL(incoming.url!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || Number(target.port) !== httpTrafficRunner.port) {
      response.writeHead(403).end('The demonstration proxy accepts only its owned origin.');
      return;
    }
    proxiedTargets.push(target.host);
    const outgoing = http.request({
      hostname: '127.0.0.1', port: httpTrafficRunner.port,
      method: incoming.method, path: `${target.pathname}${target.search}`, headers: incoming.headers, agent: false,
    }, remote => {
      response.writeHead(remote.statusCode ?? 502, remote.headers);
      remote.pipe(response);
    });
    outgoing.once('error', error => response.destroy(error));
    incoming.pipe(outgoing);
  });
  proxy.on('connect', (incoming, downstream, head) => {
    const target = incoming.url;
    if (target !== `127.0.0.1:${httpTrafficRunner.port}` && target !== `localhost:${httpTrafficRunner.port}`) {
      downstream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    proxiedTargets.push(target);
    const upstream = net.connect(httpTrafficRunner.port, '127.0.0.1', () => {
      downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(downstream);
      downstream.pipe(upstream);
    });
    sockets.add(upstream).add(downstream);
    upstream.once('close', () => sockets.delete(upstream));
    upstream.on('error', error => downstream.destroy(error));
    downstream.on('error', error => upstream.destroy(error));
  });
  proxy.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('The owned upstream proxy has no port.');
  const proxyPort = address.port;
  const pacPath = `${prefix}/route.pac`;
  const pacUrl = httpTrafficRunner.url(pacPath);
  const pac = `function FindProxyForURL(url, host) { return host === "127.0.0.1" ? "PROXY 127.0.0.1:${proxyPort}" : "DIRECT"; }`;
  httpTrafficRunner.respondWith(pacPath, { body: pac, headers: { 'content-type': 'application/x-ns-proxy-autoconfig', 'cache-control': 'no-store' } });
  const request = async (name: string, useLocalhost = false): Promise<void> => {
    const pathname = `${prefix}/${name}`;
    const body = `guide-route:${name}`;
    httpTrafficRunner.respondWith(pathname, { body, headers: { 'content-type': 'text/plain' } });
    const url = new URL(httpTrafficRunner.url(pathname));
    if (useLocalhost) url.hostname = 'localhost';
    const actual = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
      const outgoing = http.request({
        host: '127.0.0.1', port: desktopApp.capturePort(), path: url.href,
        headers: { host: url.host, connection: 'close' },
      }, incoming => {
        const chunks: Buffer[] = [];
        incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
        incoming.once('error', reject);
        incoming.once('end', () => resolve({ statusCode: incoming.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      outgoing.setTimeout(10_000, () => outgoing.destroy(new Error('Owned upstream request timed out.')));
      outgoing.once('error', reject);
      outgoing.end();
    });
    expect(actual).toEqual({ statusCode: 200, body });
  };
  const apply = async (mode: string): Promise<void> => {
    await getByAutomationId(page, ids.apply).click();
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', mode);
    await expect(getByAutomationId(page, ids.apply)).toBeDisabled();
  };
  let media: GuidebookMedia | undefined;
  try {
    // 准备：只接收本轮自有origin的HTTP上游和PAC，不假设个人代理或WPAD环境。
    // Arrange: own an HTTP upstream and PAC restricted to this origin, without assuming personal proxy or WPAD infrastructure.
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
    await startRecording(desktopApp);
    media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-upstream');
    await media.step('01-settings', '打开Settings / Open Settings', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click(); });
    await media.step('02-upstream', '打开Upstream proxy / Open Upstream proxy', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
      await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
    });
    await media.step('03-direct-draft', '选择Direct草稿 / Select a Direct draft', async () => {
      await getByAutomationId(page, ids.mode.direct).check();
      await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
    });
    await media.step('04-discard', 'Discard草稿不改路线 / Discard the draft without changing the route', async () => {
      await getByAutomationId(page, ids.discard).click();
      await expect(getByAutomationId(page, ids.mode.system)).toBeChecked();
      await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
    });
    await media.step('05-manual', '选择Manual / Select Manual', async () => { await getByAutomationId(page, ids.mode.manual).check(); });
    await media.step('06-host', '填写自有上游Host / Enter the owned upstream Host', async () => { await getByAutomationId(page, ids.host).fill('127.0.0.1'); });
    await media.step('07-port', '填写实际上游端口 / Enter the actual upstream port', async () => { await getByAutomationId(page, ids.port).fill(String(proxyPort)); });
    await media.step('08-apply-manual', 'Apply Manual / Apply Manual', async () => { await apply('manual'); });
    await media.step('09-manual-request', '用真实转发核对Manual / Verify Manual through actual forwarding', async () => {
      await request('manual');
      expect(proxiedTargets).toContain(`127.0.0.1:${httpTrafficRunner.port}`);
    });
    await media.step('10-capture', '返回Capture查看生效路线 / Return to Capture to inspect the active route', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
    });
    await media.step('11-shortcut', '打开底栏快捷浮层 / Open the statusbar popover', async () => { await getByAutomationId(page, ids.trigger).click(); });
    await media.step('12-pac-draft', '在浮层选择PAC草稿 / Select a PAC draft in the popover', async () => { await getByAutomationId(page, ids.mode.pac).check(); });
    await media.step('13-pac-url', '填写自有PAC地址 / Enter the owned PAC URL', async () => { await getByAutomationId(page, ids.pacUrl).fill(pacUrl); });
    await media.step('14-cancel-draft', 'Cancel放弃本次浮层草稿 / Cancel this popover draft', async () => {
      await getByAutomationId(page, ids.close).click();
      await expect(getByAutomationId(page, ids.popover)).toBeHidden();
      await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
    });
    await media.step('15-reopen', '重开浮层核对仍为Manual / Reopen and verify Manual remains', async () => {
      await getByAutomationId(page, ids.trigger).click();
      await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
    });
    await media.step('16-pac-again', '重新选择PAC / Select PAC again', async () => { await getByAutomationId(page, ids.mode.pac).check(); });
    await media.step('17-pac-url-again', '再次填写本轮PAC / Enter this run’s PAC again', async () => { await getByAutomationId(page, ids.pacUrl).fill(pacUrl); });
    await media.step('18-open-settings', '把同一草稿带到Settings / Carry the same draft into Settings', async () => {
      await getByAutomationId(page, ids.openSettings).click();
      await expect(getByAutomationId(page, ids.pacUrl)).toHaveValue(pacUrl);
      await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
    });
    await media.step('19-apply-pac', 'Apply PAC / Apply PAC', async () => { await apply('pac'); });
    await media.step('20-pac-proxy', '核对PAC选择PROXY / Verify PAC selects PROXY', async () => {
      const count = proxiedTargets.length;
      await request('pac-proxy');
      expect(proxiedTargets.length).toBeGreaterThan(count);
      expect(httpTrafficRunner.observation(pacPath)).toBeDefined();
    });
    await media.step('21-pac-direct', '核对同一PAC选择DIRECT / Verify the same PAC selects DIRECT', async () => {
      const count = proxiedTargets.length;
      await request('pac-direct', true);
      expect(proxiedTargets.length).toBe(count);
    });
    await media.step('22-direct', '显式选择Direct / Select Direct explicitly', async () => { await getByAutomationId(page, ids.mode.direct).check(); });
    await media.step('23-apply-direct', 'Apply Direct / Apply Direct', async () => { await apply('direct'); });
    await media.step('24-direct-request', '核对Direct不经过上游 / Verify Direct bypasses the upstream', async () => {
      const count = proxiedTargets.length;
      await request('direct');
      expect(proxiedTargets.length).toBe(count);
    });
    await media.step('25-system', '恢复System选择 / Restore the System selection', async () => { await getByAutomationId(page, ids.mode.system).check(); });
    await media.step('26-apply-system', 'Apply System / Apply System', async () => { await apply('system'); });
    // 证据：真实origin与上游计数验证路线，按钮选中或草稿不代替网络结果。
    // Evidence: actual origin/upstream observations establish routing, not a selected button or draft.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
      if (await getByAutomationId(page, ids.currentRoute).getAttribute('data-upstream-mode') !== 'system') {
        await getByAutomationId(page, ids.mode.system).check();
        await apply('system');
      }
      if (media) await media.stop({
        origin: httpTrafficRunner.url(prefix), proxyHost: '127.0.0.1', proxyPort: String(proxyPort), pacUrl,
        pacChoice: '127.0.0.1 uses the owned PROXY; localhost uses DIRECT',
        draftBoundary: 'Cancel/Discard do not Apply; Open in Settings retains the same draft',
        finalMode: 'system', scope: 'Owned HTTP routes only; no WPAD, external credentials or system proxy preference writes',
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
    }
  }
  // 清理：只关闭自有上游；Main正常Close恢复宿主代理、CA、全部进程与8888。
  // Cleanup: close only the owned upstream; normal Main Close restores host proxy/CA, all processes and port 8888.
});
