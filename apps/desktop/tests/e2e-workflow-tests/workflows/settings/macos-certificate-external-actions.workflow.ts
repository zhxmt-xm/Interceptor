import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { rootCertificateThumbprints } from '../../fixtures/ui/https-capture';
import {
  closeCertificateWindow, listCertificateWindows, verifyAndCloseCertificateWindow,
  type CertificateWindow,
} from '../../fixtures/ui/certificate-windows';

test.skip(process.platform !== 'darwin', 'macOS certificate external actions only');

test('settings.certificates.external-actions reveals the exact public CA in Finder without installing trust', async ({ desktopApp }, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.external-actions' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  const certificateDirectory = path.join(desktopApp.userDataDirectory, 'certificates');
  const windowsBefore = await listCertificateWindows(certificateDirectory);
  const ownedWindows: CertificateWindow[] = [];
  const rootsBefore = await rootCertificateThumbprints();
  let client: Client | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  const completedActions: string[] = [];
  let publicCertificateVerified = false;

  try {
    // 准备：经产品UI生成未安装CA，创建临时MCP Client；不直接调用Preload或写配置。
    // Arrange: generate an uninstalled CA and create a temporary MCP Client through product UI, without Preload calls or configuration writes.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
    const certificate = new X509Certificate(await readFile(path.join(certificateDirectory, 'root-cert.pem')));
    expect(rootsBefore).not.toContain(certificate.fingerprint.replaceAll(':', ''));
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

    // 用户操作：Reveal通过MCP请求及产品Ask审批执行，只核对Finder选中的精确公开证书。
    // User actions: invoke Reveal through MCP and product Ask approval; verify the exact public certificate selected in Finder.
    for (const [name, kind] of [['settings_reveal_certificate', 'reveal']] as const) {
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

    // 业务断言：Reveal未修改公开CA，系统证书集和MITM保持不变。
    // Business assertions: Reveal preserves the public CA, the system certificate set and MITM state.
    expect(new X509Certificate(await readFile(path.join(certificateDirectory, 'root-cert.pem'))).raw.equals(certificate.raw)).toBe(true);
    publicCertificateVerified = true;
    expect(await rootCertificateThumbprints()).toEqual(rootsBefore);
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    // 证据与清理：仅关闭本轮证书窗口、经UI删除本地材料；fixture负责App退出和完整宿主恢复。
    // Evidence and cleanup: close only this run's certificate windows and delete local material through UI; the fixture verifies App exit and full host restoration.
    if (client) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    try {
      const previousHandles = new Set(windowsBefore.map((window) => window.handle));
      for (const window of await listCertificateWindows(certificateDirectory)) {
        if (!previousHandles.has(window.handle)) await closeCertificateWindow(window);
      }
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      const remove = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete);
      if (await remove.isVisible()) await remove.click();
      expect(await rootCertificateThumbprints()).toEqual(rootsBefore);
    } catch (error) { cleanupErrors.push(error); }
    await writeFile(testInfo.outputPath('certificate-external-actions.json'), JSON.stringify({
      completedActions, publicCertificateVerified, nativeWindowCount: ownedWindows.length,
      cleanupSucceeded: cleanupErrors.length === 0,
    }, null, 2), 'utf8');
  }
  if (workflowError && cleanupErrors.length) throw new AggregateError([workflowError, ...cleanupErrors], 'Certificate external actions and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Certificate external actions cleanup failed.');
  desktopApp.releasePreservedUserData();
});