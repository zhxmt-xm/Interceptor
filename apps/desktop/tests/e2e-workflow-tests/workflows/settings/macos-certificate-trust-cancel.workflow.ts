import { createHash, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { rootCertificateThumbprints } from '../../fixtures/ui/https-capture';
import { installMacosCertificateAndCancelTrust } from '../../fixtures/ui/macos-certificate-authorization';

test.skip(process.platform !== 'darwin', 'macOS two-stage certificate trust cancellation only');

test('settings.certificates.cancel-trust removes only the newly imported CA after native cancellation', async ({ desktopApp }, testInfo) => {
  test.setTimeout(90_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.certificates.cancel-trust' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;

  // 准备：保存系统公开证书基线，经产品UI生成本轮CA。
  // Arrange: retain the public certificate baseline and generate this run's CA through product UI.
  const rootsBefore = await rootCertificateThumbprints();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
  const certificatePath = path.join(desktopApp.userDataDirectory, 'certificates/root-cert.pem');
  const certificate = new X509Certificate(await readFile(certificatePath));
  const thumbprint = certificate.fingerprint.replaceAll(':', '');
  expect(rootsBefore).not.toContain(thumbprint);

  // 用户操作：真实点击Install，再通过所属原生授权窗口发送Cancel。
  // User action: click Install and cancel only its native authorization window with real keyboard input.
  await installMacosCertificateAndCancelTrust(page, desktopApp.nativeFileDialogOwner(), certificatePath);
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'false');

  // 业务断言与证据：新增CA由产品撤回，原有证书集合完全保持。
  // Business assertion and evidence: the product rolls back its new CA and preserves the exact original certificate set.
  const rootsAfter = await rootCertificateThumbprints();
  await writeFile(testInfo.outputPath('certificate-trust-cancel.json'), JSON.stringify({
    thumbprint, nativeAuthorizationCancelled: true,
    currentRunCertificatePresent: rootsAfter.includes(thumbprint),
    beforeSha256: createHash('sha256').update(JSON.stringify(rootsBefore)).digest('hex'),
    afterSha256: createHash('sha256').update(JSON.stringify(rootsAfter)).digest('hex'),
  }, null, 2), 'utf8');
  expect(rootsAfter).toEqual(rootsBefore);

  // 清理：仅成功后经产品Delete删除本轮材料，fixture正常Close并复核宿主恢复。
  // Cleanup: after successful rollback, delete this run's material through UI and let the fixture verify normal Close and host restoration.
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete)).toBeHidden();
  desktopApp.releasePreservedUserData();
});