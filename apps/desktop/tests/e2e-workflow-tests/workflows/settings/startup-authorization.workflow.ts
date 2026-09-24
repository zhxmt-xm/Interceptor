import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver } from '../../fixtures/runtime/local-electron-driver';
import { certificateLifecycleTest as test } from '../../fixtures/runtime/certificate-lifecycle-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { removeCreatedSharedCertificate, rootCertificateThumbprints, sharedCertificateDirectory, sharedCertificateThumbprint } from '../../fixtures/ui/https-capture';
import { cancelMacosCertificateTrustRequest, dismissMacosStartupFailure, waitForMacosCertificateTrustRequest } from '../../fixtures/ui/macos-certificate-authorization';

const execute = promisify(execFile);

test.skip(process.platform !== 'darwin', 'macOS native startup authorization only');
test.use({ waitForStartupReady: false });
test.setTimeout(300_000);

test('settings.certificates.startup-cancel keeps the first window visible and rejects Quit until authorization settles', async ({
  desktopApp, certificateRootsBeforeStartup,
}, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.startup-cancel' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  let restartedApp: LocalElectronApplicationDriver | null = null;
  let startupCancellationCompleted = false;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：直接观察真实首次授权中的首窗和业务门禁，不注入状态或预造CA。
    // Arrange: observe the real first window and startup gate during native authorization, without state injection or seeded CA material.
    const owner = desktopApp.nativeFileDialogOwner();
    const authorization = await waitForMacosCertificateTrustRequest(owner);
    await expect(getByAutomationId(page, AUTOMATION_IDS.shell.boot.screen)).toHaveAttribute('data-phase', 'certificate');
    await expect(getByAutomationId(page, AUTOMATION_IDS.shell.boot.screen)).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toHaveCount(0);
    const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
ObjC.import("CoreGraphics");
const value = $.CGWindowListCopyWindowInfo(1, 0);
if (!value) throw new Error("WindowServer did not return on-screen windows");
const windows = ObjC.deepUnwrap(ObjC.castRefToObject(value));
JSON.stringify(windows.filter(window => window.kCGWindowOwnerPID === ${owner.processId}
  && window.kCGWindowLayer === 0 && window.kCGWindowAlpha > 0)
  .map(window => ({ width: window.kCGWindowBounds.Width, height: window.kCGWindowBounds.Height })));
`], { encoding: 'utf8' });
    expect(JSON.parse(stdout)).toContainEqual({ width: 1600, height: 900 });
    const certificatePath = path.join(sharedCertificateDirectory(), 'root-cert.pem');
    const certificateBefore = await readFile(certificatePath, 'utf8');
    const thumbprint = new X509Certificate(certificateBefore).fingerprint.replaceAll(':', '');
    expect(certificateRootsBeforeStartup).not.toContain(thumbprint);

    // 用户操作：准备期间真实点击Close，核对立即拒绝，再取消精确归属的原生授权。
    // User actions: click Close during preparation, verify immediate refusal, then cancel only this App's native authorization.
    const closeAttempt = desktopApp.closeFromWindowButton();
    void closeAttempt.catch(() => undefined);
    const conflict = getByAutomationId(page, AUTOMATION_IDS.platform.operationConflict);
    await expect(conflict).toHaveAttribute('data-operation', 'certificate.prepare');
    expect(page.isClosed()).toBe(false);
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.stopTrace(testInfo);
    await cancelMacosCertificateTrustRequest(owner, authorization);
    startupCancellationCompleted = true;
    await dismissMacosStartupFailure(owner);
    await closeAttempt;
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);

    // 业务断言：取消只撤回新增系统证书；重启后继续使用同一份本地CA并正常授信。
    // Business assertions: cancellation rolls back only the new system certificate; restart reuses the same local CA and requests normal trust.
    expect(await rootCertificateThumbprints()).toEqual(certificateRootsBeforeStartup);
    expect(await readFile(certificatePath, 'utf8')).toBe(certificateBefore);
    restartedApp = await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix: 'retry' });
    restartedApp.preserveUserDataOnFailure();
    await restartedApp.waitUntilReady();
    await expect(getByAutomationId(restartedApp.page, AUTOMATION_IDS.platform.operationConflict)).toHaveCount(0);
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(restartedApp.page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    await expect(getByAutomationId(restartedApp.page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
    expect(await readFile(certificatePath, 'utf8')).toBe(certificateBefore);
    expect(restartedApp.page.isClosed()).toBe(false);

    // 证据：保存公开指纹、授权归属与拒绝结果，不采集密码或私钥。
    // Evidence: retain only the public fingerprint, authorization identity and rejected operation, never credentials or private key bytes.
    await writeFile(testInfo.outputPath('startup-authorization.json'), JSON.stringify({
      thumbprint, firstWindowVisibleDuringAuthorization: true,
      quitRejectedOperation: 'certificate.prepare', authorizationRequester: authorization.requester,
      cancelledStartupExited: true, retriedSameMaterial: true,
      profiles: [desktopApp.userDataDirectory, restartedApp.userDataDirectory],
    }, null, 2), 'utf8');
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：只经产品清理本轮CA并正常退出，宿主guard验证全部代际及系统恢复。
    // Cleanup: remove only this workflow's CA through the product and quit normally; the host guard verifies every generation and system baseline.
    let cleanupApp = restartedApp;
    if (!cleanupApp && workflowError && await sharedCertificateThumbprint() !== null) {
      try {
        console.info('Startup assertion failed; complete native authorization so the product can remove only this workflow CA.');
        if (startupCancellationCompleted && !page.isClosed()) {
          const closed = page.waitForEvent('close', { timeout: 30_000 });
          await dismissMacosStartupFailure(desktopApp.nativeFileDialogOwner());
          await closed;
        }
        cleanupApp = page.isClosed()
          ? await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix: 'cleanup' })
          : desktopApp;
        await cleanupApp.waitUntilReady();
      } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupApp) {
      try {
        await removeCreatedSharedCertificate(cleanupApp, certificateRootsBeforeStartup);
        await cleanupApp.captureFinalScreenshot(testInfo);
        await cleanupApp.stopTrace(testInfo);
        await cleanupApp.closeGracefully();
        await cleanupApp.writeEvidence(testInfo);
        await cleanupApp.forceCleanup();
        if (!workflowError && cleanupApp !== desktopApp) await cleanupApp.removeUserData();
      } catch (error) { cleanupErrors.push(error); }
    }
  }
  if (workflowError || cleanupErrors.length > 0) {
    throw new AggregateError([workflowError, ...cleanupErrors].filter((error) => error !== undefined), 'Startup authorization or cleanup failed.');
  }
  desktopApp.releasePreservedUserData();
});
