import { execFile } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { cleanHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';
import { cancelMacosCertificateTrust, installMacosCertificateThroughHelper } from '../../fixtures/ui/macos-certificate-authorization';

const execute = promisify(execFile);
const helperPath = '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities';

test.skip(process.platform !== 'darwin', 'macOS native certificate helper only');

test('settings.certificates.cancel-trust rolls back the new CA when helper authorization is cancelled', async ({ desktopApp }, testInfo) => {
  test.setTimeout(90_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.cancel-trust' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;

  // 准备：保存系统证书集合，通过真实UI生成本轮CA。
  // Arrange: retain the system certificate set and generate this run's CA through real UI.
  const rootsBefore = await rootCertificateThumbprints();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
  const certificate = new X509Certificate(await readFile(path.join(desktopApp.userDataDirectory, 'certificates/root-cert.pem')));
  const thumbprint = certificate.fingerprint.replaceAll(':', '');
  expect(rootsBefore).not.toContain(thumbprint);

  // 用户操作：Install后仅取消本轮Main启动的helper所发起的系统窗口。
  // User actions: install and cancel only the system window requested by this Main generation's helper child.
  const requester = await cancelMacosCertificateTrust(page, desktopApp.nativeFileDialogOwner());
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');

  // 业务断言与证据：产品撤回新增CA，记录真实前台helper身份和完整集合恢复。
  // Business assertions and evidence: the product rolls back its new CA; retain the real foreground helper identity and exact set restoration.
  const rootsAfter = await rootCertificateThumbprints();
  await writeFile(testInfo.outputPath('certificate-helper-cancel.json'), JSON.stringify({
    thumbprint, authorizationRequester: requester, nativeAuthorizationCancelled: true,
    beforeSha256: createHash('sha256').update(JSON.stringify(rootsBefore)).digest('hex'),
    afterSha256: createHash('sha256').update(JSON.stringify(rootsAfter)).digest('hex'),
  }, null, 2), 'utf8');
  expect(rootsAfter).toEqual(rootsBefore);

  // 清理：经产品Delete删除本地材料，fixture正常Close并验证宿主恢复。
  // Cleanup: delete local material through the product; the fixture verifies normal Close and host restoration.
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete)).toBeHidden();
  desktopApp.releasePreservedUserData();
});

test('settings.certificates.helper-trust installs and removes distinct CAs through the same native helper', async ({ desktopApp }, testInfo) => {
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.helper-trust' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;

  // 准备：记录系统证书和已就绪helper，只经产品UI生成本轮CA。
  // Arrange: record the system certificate set and ready helper; generate each CA only through product UI.
  const rootsBefore = await rootCertificateThumbprints();
  const helperBefore = await lstat(helperPath);
  expect(helperBefore.uid).toBe(0);
  const processRows = await execute('/bin/ps', ['-axww', '-o', 'pid=,comm=']);
  const helperProcessId = processRows.stdout.split('\n').find((line) => line.trim().endsWith(helperPath))?.trim().split(/\s+/)[0];
  expect(helperProcessId).toMatch(/^\d+$/);
  const certificates: Array<{ thumbprint: string; systemTrustVerified: boolean; removed: boolean }> = [];
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    for (let certificateIndex = 0; certificateIndex < 2; certificateIndex += 1) {
      // 用户操作：Generate/Install由产品执行，禁止Main另起security授信命令。
      // User actions: generate and install through the product; Main must not launch a separate security trust command.
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
      const certificatePath = path.join(desktopApp.userDataDirectory, 'certificates/root-cert.pem');
      const certificate = new X509Certificate(await readFile(certificatePath));
      const thumbprint = certificate.fingerprint.replaceAll(':', '');
      expect(rootsBefore).not.toContain(thumbprint);
      expect(certificates.map((entry) => entry.thumbprint)).not.toContain(thumbprint);
      const evidence = { thumbprint, systemTrustVerified: false, removed: false };
      certificates.push(evidence);
      await installMacosCertificateThroughHelper(page, desktopApp.nativeFileDialogOwner(), certificatePath);

      // 业务断言：系统真实信任本轮CA，复用原helper，MITM不被安装动作开启。
      // Business assertions: the system trusts this CA, the original helper is reused, and installation does not enable MITM.
      await expect.poll(rootCertificateThumbprints).toContain(thumbprint);
      await execute('/usr/bin/security', ['verify-cert', '-c', certificatePath, '-p', 'basic', '-L', '-q', '-k', '/Library/Keychains/System.keychain']);
      evidence.systemTrustVerified = true;
      expect((await lstat(helperPath)).ino).toBe(helperBefore.ino);
      expect((await execute('/bin/ps', ['-ww', '-p', helperProcessId!, '-o', 'comm='])).stdout.trim()).toBe(helperPath);
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
      expect(await rootCertificateThumbprints()).toEqual(rootsBefore);
      evidence.removed = true;
      await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete)).toBeHidden();
    }
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理与证据：只经产品撤销本轮CA，保存真实结果；fixture复核退出与完整宿主恢复。
    // Cleanup and evidence: remove only this run's CA through the product and retain actual outcomes; the fixture verifies exit and full host restoration.
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    const rootsAfter = await rootCertificateThumbprints();
    await writeFile(testInfo.outputPath('certificate-helper-trust.json'), JSON.stringify({
      helperProcessId: Number(helperProcessId), certificates,
      beforeSha256: createHash('sha256').update(JSON.stringify(rootsBefore)).digest('hex'),
      afterSha256: createHash('sha256').update(JSON.stringify(rootsAfter)).digest('hex'),
    }, null, 2), 'utf8');
    try { expect(rootsAfter).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Certificate helper workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Certificate helper cleanup failed.');
  desktopApp.releasePreservedUserData();
});