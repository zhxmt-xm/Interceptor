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
  const mitmToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.mitmToggle,
  );
  await mitmToggle.click();
  await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');

  await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsPassthrough.hostInput,
  ).fill(PASSTHROUGH_HOST);
  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsPassthrough.addHost,
  ).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST),
  )).toBeVisible();
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
  await attempt(async () => {
    const row = getByAutomationId(
      page,
      AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST),
    );
    if (await row.isVisible().catch(() => false)) {
      await getByAutomationId(
        page,
        AutomationIdFactory.tlsPassthroughRemoveHost(PASSTHROUGH_HOST),
      ).click();
      await expect(row).toHaveCount(0);
    }
  });
  await attempt(() => getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.certificates,
  ).click());
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
  desktopApp,
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
    tunnel = await tunnelLab.openThroughProxy(desktopApp.capturePort());

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
    await navigate.click();

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

    // 中文：重复导航必须重新产生高亮，而不是持久保存旧状态。
    // English: Repeating navigation must restart the highlight instead of persisting stale state.
    await getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.shell.workspace.capture,
    ).click();
    await expect(navigate).toBeVisible();
    await navigate.click();
    await expectInsideViewport(target, desktopApp.page);
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