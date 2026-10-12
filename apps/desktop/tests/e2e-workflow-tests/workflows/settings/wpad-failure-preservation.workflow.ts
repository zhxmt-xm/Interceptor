import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { promisify } from 'node:util';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

test.skip(process.platform !== 'win32', 'Windows native WPAD discovery');

test('settings.upstream.windows preserves Manual after native WPAD and PAC failures', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.upstream.windows.failure-preservation' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  const ids = AUTOMATION_IDS.upstream;

  // 准备：独立只读调用WinHTTP核对负向前提，仅启动本workflow的回环上游，不调整系统网络。
  // Arrange: verify native WinHTTP absence independently and start only a loopback upstream, without changing network configuration.
  const win32Error = await readNativeWpadError();
  expect(win32Error, 'This negative workflow requires native WPAD autodetection failure.').toBe(12180);
  const sockets = new Set<Duplex>();
  const targets: string[] = [];
  const proxy = http.createServer((_request, response) => response.writeHead(405).end());
  proxy.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  proxy.on('connect', (request, downstream, head) => {
    if (request.url !== `127.0.0.1:${httpTrafficRunner.port}`) {
      downstream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    targets.push(request.url);
    const upstream = net.connect(httpTrafficRunner.port, '127.0.0.1', () => {
      downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      downstream.pipe(upstream);
      upstream.pipe(downstream);
    });
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    upstream.once('error', error => downstream.destroy(error));
    downstream.once('error', () => upstream.destroy());
    downstream.once('close', () => upstream.destroy());
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('The workflow upstream has no TCP port.');
  const unavailablePac = net.createServer();
  unavailablePac.listen(0, '127.0.0.1');
  await once(unavailablePac, 'listening');
  const pacAddress = unavailablePac.address();
  if (!pacAddress || typeof pacAddress === 'string') throw new Error('The workflow PAC reservation has no TCP port.');
  await new Promise<void>((resolve, reject) => unavailablePac.close(error => error ? reject(error) : resolve()));
  const observations: { attemptedMode: string; route: string | null; error: string | null; upstreamConnections: number }[] = [];

  try {
    // 用户操作：通过公共readiness和上游编辑入口应用Manual，先证明原路线实际可用。
    // User actions: enter Recording and apply Manual through public controls, first proving the original route works.
    await startRecording(desktopApp);
    await getByAutomationId(page, ids.trigger).click();
    await getByAutomationId(page, ids.mode.manual).check();
    await getByAutomationId(page, ids.host).fill('127.0.0.1');
    await getByAutomationId(page, ids.port).fill(String(address.port));
    await getByAutomationId(page, ids.apply).click();
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
    await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
    await verifyManualRequest('before-failure');
    const ownedSettings = await desktopApp.readSystemProxySettings();

    for (const mode of ['wpad', 'pac'] as const) {
      await getByAutomationId(page, ids.mode[mode]).check();
      if (mode === 'pac') await getByAutomationId(page, ids.pacUrl).fill(`http://127.0.0.1:${pacAddress.port}/unavailable.pac`);
      await getByAutomationId(page, ids.apply).click();
      const error = getByAutomationId(page, ids.error);
      await expect(error).toBeVisible({ timeout: 35_000 });

      // 业务断言：失败不改变保存模式、实际路线或WinINet，后续请求仍经过本轮Manual上游。
      // Business assertions: failure preserves the mode, route and WinINet, and later requests still traverse the Manual upstream.
      await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
      await expect(getByAutomationId(page, ids.trigger)).toHaveAttribute('data-upstream-mode', 'manual');
      await expect(getByAutomationId(page, ids.progress)).toHaveCount(0);
      expect(await desktopApp.readSystemProxySettings()).toEqual(ownedSettings);
      await verifyManualRequest(`after-${mode}`);
      observations.push({
        attemptedMode: mode, route: await getByAutomationId(page, ids.currentRoute).getAttribute('data-upstream-mode'),
        error: await error.textContent(), upstreamConnections: targets.length,
      });

      // 证据：保留原生前提、真实路线及错误画面；不把负向流程记作DNS/DHCP成功发现。
      // Evidence: retain the native precondition, actual route and error screen, without claiming successful DNS/DHCP discovery.
      await writeFile(testInfo.outputPath('windows-upstream-failures.json'), JSON.stringify({
        nativePrecondition: { win32Error }, scope: 'Windows failure preservation only', observations,
      }, null, 2), 'utf8');
      if (mode === 'wpad') {
        await page.screenshot({ path: testInfo.outputPath('wpad-error.png') });
        await expect(error).not.toContainText('WPAD discovery is not supported on this platform.');
      }
    }

    await getByAutomationId(page, ids.discard).click();
    await getByAutomationId(page, ids.trigger).click();
    await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
    await expect(getByAutomationId(page, ids.error)).toHaveCount(0);
    await getByAutomationId(page, ids.openSettings).click();
    await expect(getByAutomationId(page, ids.mode.manual)).toBeChecked();
    await expect(getByAutomationId(page, ids.currentRoute)).toHaveAttribute('data-upstream-mode', 'manual');
  } finally {
    // 清理：只关闭本轮服务；标准fixture点击产品Close并验证进程、8888及完整WinINet恢复。
    // Cleanup: close only this workflow's servers; the standard fixture uses product Close and verifies processes, port 8888 and WinINet.
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
  }

  async function verifyManualRequest(label: string): Promise<void> {
    const requestPath = `/e2e/windows-wpad/${label}-${randomUUID()}`;
    httpTrafficRunner.respondWith(requestPath, {
      statusCode: 200, headers: { 'content-type': 'text/plain' }, body: requestPath,
    });
    const before = targets.length;
    const response = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(requestPath);
    expect(targets.length).toBe(before + 1);
  }
});

async function readNativeWpadError(): Promise<number> {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowsWpadPrecondition
{
    [DllImport("winhttp.dll", SetLastError = true)]
    private static extern bool WinHttpDetectAutoProxyConfigUrl(uint flags, out IntPtr url);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalFree(IntPtr memory);
    public static int Detect()
    {
        IntPtr url = IntPtr.Zero;
        try
        {
            bool found = WinHttpDetectAutoProxyConfigUrl(3, out url);
            return found ? 0 : Marshal.GetLastWin32Error();
        }
        finally
        {
            if (url != IntPtr.Zero) GlobalFree(url);
        }
    }
}
'@
[WindowsWpadPrecondition]::Detect()
`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 35_000,
  });
  const code = Number(stdout.trim());
  if (!Number.isInteger(code) || code < 0) throw new Error('The native WPAD precondition returned an invalid code.');
  return code;
}
