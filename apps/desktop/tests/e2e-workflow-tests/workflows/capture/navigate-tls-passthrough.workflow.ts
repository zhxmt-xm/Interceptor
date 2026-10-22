import { once } from 'node:events';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';

import type { Locator, Page, TestInfo } from '@playwright/test';
import { generateCACertificate } from 'mockttp';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { waitForCertificateInstallation } from '../../fixtures/ui/https-capture';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const PASSTHROUGH_HOST = '127.0.0.1';
const TUNNEL_PROBE = Buffer.from('tls-passthrough-navigation-probe');

/** Test-owned TCP origin and raw CONNECT client; no external DNS or network is involved. */
class ConnectTunnelLab {
  private readonly server: tls.Server;
  private readonly originSockets = new Set<net.Socket>();
  private readonly clients = new Set<net.Socket>();
  readonly port: number;

  private constructor(server: tls.Server, port: number) {
    this.server = server;
    this.port = port;
  }

  static async start(): Promise<ConnectTunnelLab> {
    const certificate = await generateCACertificate();
    const originSockets = new Set<net.Socket>();
    const server = tls.createServer({
      key: certificate.key,
      cert: certificate.cert,
    }, (socket) => {
      originSockets.add(socket);
      socket.on('data', (chunk) => socket.write(chunk));
      socket.once('close', () => originSockets.delete(socket));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const lab = new ConnectTunnelLab(server, (server.address() as AddressInfo).port);
    for (const socket of originSockets) lab.originSockets.add(socket);
    server.on('connection', (socket) => {
      lab.originSockets.add(socket);
      socket.once('close', () => lab.originSockets.delete(socket));
    });
    return lab;
  }

  async openThroughProxy(proxyPort: number): Promise<tls.TLSSocket> {
    const socket = net.connect(proxyPort, '127.0.0.1');
    this.clients.add(socket);
    socket.once('close', () => this.clients.delete(socket));
    await once(socket, 'connect');
    socket.write(
      `CONNECT ${PASSTHROUGH_HOST}:${this.port} HTTP/1.1\r\n`
        + `Host: ${PASSTHROUGH_HOST}:${this.port}\r\n`
        + 'Connection: keep-alive\r\n\r\n',
    );
    const responseHead = await new Promise<string>((resolve, reject) => {
      let response = Buffer.alloc(0);
      const onData = (chunk: Buffer): void => {
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf('\r\n\r\n');
        if (end < 0) return;
        cleanup();
        resolve(response.subarray(0, end).toString('latin1'));
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        socket.off('data', onData);
        socket.off('error', onError);
      };
      socket.on('data', onData);
      socket.on('error', onError);
    });
    if (!responseHead.startsWith('HTTP/1.1 200')) {
      throw new Error(`CONNECT failed: ${responseHead.split('\r\n', 1)[0]}`);
    }
    const secureSocket = tls.connect({ socket, rejectUnauthorized: false });
    this.clients.add(secureSocket);
    secureSocket.once('close', () => this.clients.delete(secureSocket));
    await once(secureSocket, 'secureConnect');
    const echoed = once(secureSocket, 'data') as Promise<[Buffer]>;
    secureSocket.write(TUNNEL_PROBE);
    expect((await echoed)[0]).toEqual(TUNNEL_PROBE);
    return secureSocket;
  }

  async close(): Promise<void> {
    for (const socket of this.clients) socket.destroy();
    for (const socket of this.originSockets) socket.destroy();
    if (this.server.listening) {
      await new Promise<void>((resolve, reject) => {
        this.server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
}

/** Reuse the shared CA, enable MITM, and add one exact passthrough pattern through UI. */
async function configureTlsPassthrough(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await waitForCertificateInstallation(page);
  await screenshotStep('检查已有CA与信任状态 / Inspect the existing CA and trust state');
  const mitmToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.mitmToggle,
  );
  await mitmToggle.click();
  await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
  await screenshotStep('通过Certificates启用HTTPS解密 / Enable HTTPS decryption through Certificates', {
    highlights: [{ target: mitmToggle, label: '1' }],
  });

  await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
  await screenshotStep('打开TLS passthrough名单 / Open the TLS passthrough list');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsPassthrough.hostInput,
  ).fill(PASSTHROUGH_HOST);
  await screenshotStep('填写精确透传主机后Add / Enter an exact passthrough host before Add', {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.addHost), label: '2' },
    ],
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsPassthrough.addHost,
  ).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST),
  )).toBeVisible();
  await screenshotStep('精确透传主机已经保存 / The exact passthrough host is saved', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST)), label: '1' }],
  });
}

/** Remove profile-local settings through product controls while preserving the shared CA. */
async function cleanupTlsConfiguration(page: Page): Promise<void> {
  const errors: unknown[] = [];
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  };

  await attempt(() => getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click());
  await attempt(() => getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.tlsPassthrough,
  ).click());
  for (const host of [PASSTHROUGH_HOST, 'localhost']) {
    await attempt(async () => {
      const row = getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(host));
      if (await row.isVisible()) {
        await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(host)).click();
        await expect(row).toHaveCount(0);
      }
    });
  }
  await attempt(() => getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.certificates,
  ).click());
  await attempt(async () => {
    const host = getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'));
    if (await host.isVisible()) {
      await getByAutomationId(page, AutomationIdFactory.insecureHostRemove('localhost')).click();
      await expect(host).toHaveCount(0);
    }
  });
  await attempt(async () => {
    const toggle = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.mitmToggle,
    );
    if (await toggle.getAttribute('aria-checked') === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
  });
  await attempt(() => waitForCertificateInstallation(page));
  if (errors.length > 0) {
    throw new AggregateError(errors, 'TLS navigation workflow cleanup failed.');
  }
}

/** Assert the highlighted Settings row remains inside the visible application viewport. */
async function expectInsideViewport(row: Locator, page: Page): Promise<void> {
  await expect(row).toHaveAttribute('data-highlighted', 'true');
  const box = await row.boundingBox();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight);
}

test('capture.navigate-tls-passthrough locates the persisted pattern', async ({
  desktopApp, tlsTrafficRunner,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.navigate-tls-passthrough',
  });
  desktopApp.preserveUserDataOnFailure();
  const tunnelLab = await ConnectTunnelLab.start();
  let tunnel: tls.TLSSocket | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;

  try {
    // 中文：全部系统副作用均由产品UI创建，随后建立测试自产CONNECT tunnel。
    // English: Create every system side effect through product UI, then open a test-owned CONNECT tunnel.
    await startRecording(desktopApp);
    await configureTlsPassthrough(desktopApp.page);
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.shell.workspace.capture,
    ).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(PASSTHROUGH_HOST);
    tunnel = await tunnelLab.openThroughProxy(desktopApp.capturePort());
    await screenshotStep('中文：全部系统副作用均由产品UI创建，随后建立测试自产CONNECT tunnel。 / English: Create every system side effect through product UI, then open a test-owned CONNECT tunnel.');

    // 中文：从真实Capture行进入Tunnel Inspector，只通过公开导航命令跳转。
    // English: Open the Tunnel Inspector from the real Capture row and navigate only through the public command.
    const row = getByAutomationIdPrefix(
      desktopApp.page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    ).filter({ hasText: PASSTHROUGH_HOST }).last();
    await expect(row).toBeVisible();
    await row.click();
    const navigate = getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern,
    );
    await expect(navigate).toBeVisible();
    await screenshotStep('从Tunnel定位匹配的透传配置 / Locate the matching passthrough setting from Tunnel', {
      highlights: [{ target: navigate, label: '1' }],
    });
    await navigate.click();
    await screenshotStep('中文：从真实Capture行进入Tunnel Inspector，只通过公开导航命令跳转。 / English: Open the Tunnel Inspector from the real Capture row and navigate only through the public command.');

    // 中文：目标必须是实际持久化row，自动滚入视口并带短暂公开高亮状态。
    // English: The target must be the persisted row, scrolled into view with a short public highlight state.
    const target = getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST),
    );
    await expectInsideViewport(target, desktopApp.page);
    const targetLayout = await target.evaluate((element) => {
      const content = element.children[1]!;
      const hostName = content.querySelector('code')!;
      const hint = content.lastElementChild!;
      return {
        hostLineHeight: getComputedStyle(hostName).lineHeight,
        hintLineHeight: getComputedStyle(hint).lineHeight,
        textGap: getComputedStyle(content).gap,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(targetLayout).toMatchObject({ hostLineHeight: '14px', hintLineHeight: '14px', textGap: '2px' });
    expect(targetLayout.height).toBeGreaterThanOrEqual(66);
    await testInfo.attach('tls-passthrough-target-layout', { body: Buffer.from(JSON.stringify(targetLayout)), contentType: 'application/json' });
    await expect(target).toHaveAttribute('data-highlighted', 'false', { timeout: 4_500 });
    await screenshotStep('中文：目标必须是实际持久化row，自动滚入视口并带短暂公开高亮状态。 / English: The target must be the persisted row, scrolled into view with a short public highlight state.');

    // 中文：重复导航必须重新产生高亮，而不是持久保存旧状态。
    // English: Repeating navigation must restart the highlight instead of persisting stale state.
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.shell.workspace.capture,
    ).click();
    await expect(navigate).toBeVisible();
    await navigate.click();
    await expectInsideViewport(target, desktopApp.page);
    await screenshotStep('中文：重复导航必须重新产生高亮，而不是持久保存旧状态。 / English: Repeating navigation must restart the highlight instead of persisting stale state.');

    // Compare fresh HTTPS connections before, during and after an exact localhost passthrough rule.
    // 对比添加localhost精确透传前、生效后、移除后的三次全新HTTPS连接。
    const { page } = desktopApp;
    tunnel.destroy();
    tunnel = null;
    await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(PASSTHROUGH_HOST)).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput).fill('localhost');
    await screenshotStep('仅为自有localhost源站添加证书例外 / Add a certificate exception only for the owned localhost origin', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput), label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd).click();
    await expect(getByAutomationId(page, AutomationIdFactory.insecureHost('localhost'))).toBeVisible();
    const requestPath = '/e2e/passthrough/http';
    const authority = tlsTrafficRunner.targetHost();
    const expectedBody = JSON.stringify({ mode: 'https-h1', secure: true }, null, 2);
    const sendHttps = async (): Promise<void> => {
      const execution = await tlsTrafficRunner.runTls({
        kind: 'tls', mode: 'https-h1', method: 'GET', path: requestPath,
        targetHost: authority, headers: {}, connectHeaders: {},
      }, desktopApp.capturePort());
      expect(execution).toMatchObject({
        state: 'complete',
        response: { statusCode: 200, body: expectedBody, bodyBytes: Buffer.byteLength(expectedBody) },
      });
    };
    const inspectDecryptedResponse = async (title: string): Promise<void> => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
      await sendHttps();
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: requestPath }).last();
      await expect(row).toBeVisible();
      if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedBody);
      await screenshotStep(title, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
      });
    };
    await inspectDecryptedResponse('透传名单添加前的新连接可以解密 / A new connection decrypts before adding passthrough');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput).fill('localhost');
    await screenshotStep('将localhost加入精确透传名单 / Add localhost to the exact passthrough list', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput), label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.addHost), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.addHost).click();
    await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost('localhost'))).toBeVisible();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('localhost');
    await sendHttps();
    const tunnelRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: 'CONNECT' }).last();
    await expect(tunnelRow).toBeVisible();
    if (await tunnelRow.getAttribute('aria-pressed') !== 'true') await tunnelRow.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern)).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response)).toHaveCount(0);
    await screenshotStep('客户端仍收到响应，Capture只看到透传Tunnel / The client receives its response while Capture sees only the passthrough Tunnel', {
      highlights: [
        { target: tunnelRow, label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.viewTlsPassthroughPattern).click();
    await expectInsideViewport(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost('localhost')), page);
    await screenshotStep('定位localhost条目并准备移除 / Locate the localhost entry before removing it', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost('localhost')), label: '1' }],
    });
    await getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost('localhost')).click();
    await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost('localhost'))).toHaveCount(0);
    await inspectDecryptedResponse('移除透传后新连接恢复HTTP正文 / A new connection exposes its HTTP body after passthrough is removed');
  } catch (error) {
    workflowError = error;
  } finally {
    tunnel?.destroy();
    await tunnelLab.close().catch((error) => {
      cleanupError = error;
    });
    try {
      await cleanupTlsConfiguration(desktopApp.page);
      desktopApp.releasePreservedUserData();
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }

  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});