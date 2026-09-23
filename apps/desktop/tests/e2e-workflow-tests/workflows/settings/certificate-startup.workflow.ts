import { X509Certificate } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { isCertificateTrusted, rootCertificateThumbprints, sharedCertificateDirectory } from '../../fixtures/ui/https-capture';

interface SharedCertificateSnapshot {
  thumbprint: string;
  files: Array<{ name: string; size: number; modifiedAt: number }>;
}

async function readSharedCertificate(): Promise<SharedCertificateSnapshot | null> {
  const directory = sharedCertificateDirectory();
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(await readFile(path.join(directory, 'root-cert.pem')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const files = [];
  for (const name of ['root-cert.pem', 'root-key.enc', 'ca-meta.json']) {
    const metadata = await stat(path.join(directory, name));
    files.push({ name, size: metadata.size, modifiedAt: metadata.mtimeMs });
  }
  return { thumbprint: certificate.fingerprint.replaceAll(':', ''), files };
}

const startupTest = test.extend<{
  certificateBaseline: { certificate: SharedCertificateSnapshot | null; roots: string[] };
}>({
  certificateBaseline: [async ({}, use) => {
    const certificate = await readSharedCertificate();
    if (certificate && !await isCertificateTrusted(certificate.thumbprint)) {
      throw new Error('The existing shared CA is not trusted; complete its product startup before running the non-destructive reuse workflow.');
    }
    await use({ certificate, roots: await rootCertificateThumbprints() });
  }, { auto: true }],
});

startupTest.use({ allowSharedCertificateInitialization: true });
startupTest.setTimeout(300_000);

startupTest('settings.certificates.shared-startup reuses a trusted CA across fresh profiles without rewriting material', async ({ desktopApp, certificateBaseline }, testInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.shared-startup' });
  desktopApp.preserveUserDataOnFailure();
  let secondGeneration: LocalElectronApplicationDriver | null = null;
  let activeGeneration = desktopApp;
  let firstCertificate: SharedCertificateSnapshot | null = null;
  const cleanupErrors: unknown[] = [];
  let workflowError: unknown;

  try {
    // 准备：首代App正常启动，经公开文件与Settings UI核验产品已生成/授信CA。
    // Arrange: verify the startup-created and trusted CA through its public file and Settings UI.
    firstCertificate = await readSharedCertificate();
    expect(firstCertificate, 'Startup must create shared CA material before reporting ready').not.toBeNull();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    expect(await isCertificateTrusted(firstCertificate!.thumbprint)).toBe(true);
    await expect(stat(path.join(desktopApp.userDataDirectory, 'certificates', 'root-cert.pem'))).rejects.toMatchObject({ code: 'ENOENT' });
    if (certificateBaseline.certificate) expect(firstCertificate).toEqual(certificateBaseline.certificate);

    // 用户操作：正常退出后使用全新profile重启，不点击Generate或Install。
    // User actions: quit normally and relaunch with a fresh profile without Generate or Install.
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
    expect(await readSharedCertificate()).toEqual(firstCertificate);
    expect(await isCertificateTrusted(firstCertificate!.thumbprint)).toBe(true);
    secondGeneration = await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix: 'reuse' });
    activeGeneration = secondGeneration;
    await secondGeneration.waitUntilReady();
    expect(secondGeneration.userDataDirectory).not.toBe(desktopApp.userDataDirectory);

    // 业务断言：第二代保持同一指纹和文件mtime，MITM意图仍属于新profile。
    // Business assertions: the second generation keeps the fingerprint and file mtimes while MITM preference remains profile-local.
    await getByAutomationId(secondGeneration.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(secondGeneration.page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(secondGeneration.page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    await expect(getByAutomationId(secondGeneration.page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    expect(await readSharedCertificate()).toEqual(firstCertificate);
    expect(await isCertificateTrusted(firstCertificate!.thumbprint)).toBe(true);
    await expect(stat(path.join(secondGeneration.userDataDirectory, 'certificates', 'root-cert.pem'))).rejects.toMatchObject({ code: 'ENOENT' });

    // 证据：只记录公开指纹、文件元数据与两代profile，不读取或导出私钥。
    // Evidence: retain only the public fingerprint, file metadata and profile paths, never private key bytes.
    await writeFile(testInfo.outputPath('shared-certificate-startup.json'), JSON.stringify({
      certificate: firstCertificate, reusedExistingCa: certificateBaseline.certificate !== null,
      profiles: [desktopApp.userDataDirectory, secondGeneration.userDataDirectory],
    }, null, 2), 'utf8');
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：仅经产品删除本轮首次创建的CA；已有共享CA保持，宿主guard复核恢复。
    // Cleanup: delete only a CA first created by this workflow through the product; preserve pre-existing shared CAs for the host guard.
    if (!certificateBaseline.certificate && firstCertificate) {
      try {
        expect((await readSharedCertificate())?.thumbprint).toBe(firstCertificate.thumbprint);
        await getByAutomationId(activeGeneration.page, AUTOMATION_IDS.shell.workspace.settings).click();
        await getByAutomationId(activeGeneration.page, AUTOMATION_IDS.settings.section.certificates).click();
        const uninstall = getByAutomationId(activeGeneration.page, AUTOMATION_IDS.settings.certificates.uninstall);
        if (await uninstall.isVisible()) {
          await uninstall.click();
          await expect(getByAutomationId(activeGeneration.page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled({ timeout: 120_000 });
        }
        await getByAutomationId(activeGeneration.page, AUTOMATION_IDS.settings.certificates.delete).click();
        await expect.poll(readSharedCertificate).toBeNull();
      } catch (error) { cleanupErrors.push(error); }
    }
    try { expect(await rootCertificateThumbprints()).toEqual(certificateBaseline.roots); }
    catch (error) { cleanupErrors.push(error); }
    if (secondGeneration) {
      try {
        await secondGeneration.captureFinalScreenshot(testInfo);
        await secondGeneration.stopTrace(testInfo);
        await secondGeneration.closeGracefully();
        await secondGeneration.writeEvidence(testInfo);
        await secondGeneration.forceCleanup();
        if (!workflowError && cleanupErrors.length === 0) await secondGeneration.removeUserData();
      } catch (error) { cleanupErrors.push(error); }
    }
  }
  if (workflowError || cleanupErrors.length > 0) {
    throw new AggregateError([workflowError, ...cleanupErrors].filter((error) => error !== undefined), 'Shared certificate startup or cleanup failed.');
  }
  desktopApp.releasePreservedUserData();
});