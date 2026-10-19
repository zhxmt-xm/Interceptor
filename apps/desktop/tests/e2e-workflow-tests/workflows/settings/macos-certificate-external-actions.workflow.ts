import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { rootCertificateThumbprints, sharedCertificateDirectory } from '../../fixtures/ui/https-capture';
import {
  closeCertificateWindow, listCertificateWindows, verifyAndCloseCertificateWindow,
  type CertificateWindow,
} from '../../fixtures/ui/certificate-windows';

test.skip(process.platform !== 'darwin', 'macOS certificate external actions only');

test('settings.certificates.external-actions reveals and views the shared public CA without changing trust', async ({ desktopApp }, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.external-actions' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  const certificateDirectory = sharedCertificateDirectory();
  const windowsBefore = await listCertificateWindows(certificateDirectory);
  const ownedWindows: CertificateWindow[] = [];
  const rootsBefore = await rootCertificateThumbprints();
  let client: Client | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  const completedActions: string[] = [];
  let publicCertificateVerified = false;

  try {
    // 准备：复用已初始化的共享CA，经产品UI创建临时MCP Client。
    // Arrange: reuse the initialized shared CA and create a temporary MCP Client through product UI.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    const certificate = new X509Certificate(await readFile(path.join(certificateDirectory, 'root-cert.pem')));
    expect(rootsBefore).toContain(certificate.fingerprint.replaceAll(':', ''));
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Certificate external actions');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const row = page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(row).toHaveCount(1);
    const clientId = await row.getAttribute('data-client-id');
    if (!clientId) throw new Error('The product did not expose the created MCP Client identity.');
    await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
      servers: { interceptor: { url: string; headers: { Authorization: string } } };
    };
    const configuration = copied.servers.interceptor;
    desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
    client = new Client({ name: 'certificate-external-actions', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } }));
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await desktopApp.startTrace(testInfo);

    // 用户操作：经MCP请求和产品Ask审批打开Finder及证书详情，核对本轮公开证书。
    // User actions: open Finder and certificate details through MCP and product Ask approval, verifying this run's public certificate.
    for (const [name, kind] of [
      ['settings_reveal_certificate', 'reveal'],
      ['settings_view_certificate', 'view'],
    ] as const) {
      const before = await listCertificateWindows(certificateDirectory);
      const [result] = await Promise.all([
        client.callTool({ name, arguments: {} }),
        (async () => {
          await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', name);
          await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
        })(),
      ]);
      expect(result.isError).not.toBe(true);
      const text = result.content.find((entry) => entry.type === 'text')?.text;
      expect(typeof text).toBe('string');
      expect(JSON.parse(text!)).toEqual({ requested: true });
      await verifyAndCloseCertificateWindow(kind, before, certificateDirectory, ownedWindows);
      completedActions.push(kind);
    }
    await screenshotStep('用户操作：经MCP请求和产品Ask审批打开Finder及证书详情，核对本轮公开证书。 / User actions: open Finder and certificate details through MCP and product Ask approval, verifying this run\'s public certificate.');

    // 业务断言：查看未修改公开CA，系统证书集和MITM保持不变。
    // Business assertions: viewing preserves the public CA, the system certificate set and MITM state.
    expect(new X509Certificate(await readFile(path.join(certificateDirectory, 'root-cert.pem'))).raw.equals(certificate.raw)).toBe(true);
    publicCertificateVerified = true;
    expect(await rootCertificateThumbprints()).toEqual(rootsBefore);
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await screenshotStep('业务断言：查看未修改公开CA，系统证书集和MITM保持不变。 / Business assertions: viewing preserves the public CA, the system certificate set and MITM state.');
  } catch (error) {
    workflowError = error;
  } finally {
    // 证据与清理：仅关闭本轮证书窗口，保留共享CA；fixture负责App退出和完整宿主恢复。
    // Evidence and cleanup: close only this run's certificate windows and preserve the shared CA; the fixture verifies App exit and host restoration.
    if (client) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    try {
      const previousHandles = new Set(windowsBefore.map((window) => window.handle));
      const cleanupWindows = new Map([...ownedWindows, ...await listCertificateWindows(certificateDirectory)]
        .map((window) => [window.handle, window]));
      for (const window of cleanupWindows.values()) {
        if (!previousHandles.has(window.handle)) await closeCertificateWindow(window);
      }
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      expect(await rootCertificateThumbprints()).toEqual(rootsBefore);
    } catch (error) { cleanupErrors.push(error); }
    await writeFile(testInfo.outputPath('certificate-external-actions.json'), JSON.stringify({
      completedActions, publicCertificateVerified, nativeWindowCount: ownedWindows.length,
      preexistingWindowCount: windowsBefore.length,
      cleanupSucceeded: cleanupErrors.length === 0,
    }, null, 2), 'utf8');
    await screenshotStep('证据与清理：仅关闭本轮证书窗口，保留共享CA；fixture负责App退出和完整宿主恢复。 / Evidence and cleanup: close only this run\'s certificate windows and preserve the shared CA; the fixture verifies App exit and host restoration.');
  }
  if (workflowError && cleanupErrors.length) throw new AggregateError([workflowError, ...cleanupErrors], 'Certificate external actions and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Certificate external actions cleanup failed.');
  desktopApp.releasePreservedUserData();
});