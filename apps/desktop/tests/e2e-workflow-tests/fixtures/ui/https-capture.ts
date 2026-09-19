import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, type LocalElectronApplicationDriver } from '../runtime/local-electron-driver';
import { getByAutomationId } from './automation';

const execFileAsync = promisify(execFile);
const ORIGIN_HOST = 'localhost';
const certificateWaitOptions = getCertificateWaitOptions();

export async function rootCertificateThumbprints(): Promise<string[]> {
  switch (process.platform) {
    case 'darwin':
      return readMacosRootCertificateThumbprints();
    case 'win32':
      return readWindowsRootCertificateThumbprints();
    default:
      throw new Error(`Certificate workflows are not supported on ${process.platform}.`);
  }
}

async function readMacosRootCertificateThumbprints(): Promise<string[]> {
  const { stdout } = await execFileAsync('security', [
    'find-certificate', '-a', '-p', '/Library/Keychains/System.keychain',
  ], { encoding: 'utf8' });
  return [...stdout.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)]
    .map(([pem]) => new X509Certificate(pem).fingerprint.replaceAll(':', ''))
    .sort();
}

async function readWindowsRootCertificateThumbprints(): Promise<string[]> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command',
    'ConvertTo-Json -InputObject @(Get-ChildItem Cert:\\LocalMachine\\Root | Select-Object -ExpandProperty Thumbprint | Sort-Object) -Compress',
  ], { encoding: 'utf8', windowsHide: true });
  return JSON.parse(stdout.trim()) as string[];
}

function getCertificateWaitOptions(): {
  visibility: { timeout: number };
  removal?: { timeout: number };
} {
  switch (process.platform) {
    case 'darwin':
      return { visibility: { timeout: 120_000 }, removal: { timeout: 120_000 } };
    default:
      return { visibility: { timeout: 30_000 } };
  }
}

async function profileCertificateThumbprint(desktopApp: LocalElectronApplicationDriver): Promise<string | null> {
  try {
    const certificate = new X509Certificate(await readFile(path.join(
      desktopApp.userDataDirectory, 'certificates', 'root-cert.pem',
    )));
    return certificate.fingerprint.replaceAll(':', '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function prepareHttpsCapture(desktopApp: LocalElectronApplicationDriver): Promise<void> {
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall))
    .toBeVisible(certificateWaitOptions.visibility);
  const thumbprint = await profileCertificateThumbprint(desktopApp);
  expect(thumbprint).not.toBeNull();
  await expect.poll(rootCertificateThumbprints).toContain(thumbprint);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostInput).fill(ORIGIN_HOST);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.insecureHostAdd).click();
  await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(ORIGIN_HOST))).toBeVisible();
  const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
  await mitmToggle.click();
  await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
}

export async function cleanHttpsCapture(desktopApp: LocalElectronApplicationDriver): Promise<void> {
  const { page } = desktopApp;
  const errors: unknown[] = [];
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try { await operation(); } catch (error) { errors.push(error); }
  };
  await attempt(async () => {
    const dismiss = getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.dismiss);
    if (await dismiss.isVisible()) await dismiss.click();
  });
  await attempt(async () => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate)).toBeVisible();
  });
  await attempt(async () => {
    const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
    if (await mitmToggle.getAttribute('aria-checked') === 'true') {
      await mitmToggle.click();
      await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
    }
  });
  await attempt(async () => {
    const host = getByAutomationId(page, AutomationIdFactory.insecureHost(ORIGIN_HOST));
    if (await host.isVisible()) {
      await getByAutomationId(page, AutomationIdFactory.insecureHostRemove(ORIGIN_HOST)).click();
      await expect(host).toBeHidden();
    }
  });
  await attempt(async () => {
    const thumbprint = await profileCertificateThumbprint(desktopApp);
    if (!thumbprint) return;
    if ((await rootCertificateThumbprints()).includes(thumbprint)) {
      const uninstall = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall);
      await expect(uninstall).toBeVisible(certificateWaitOptions.visibility);
      await uninstall.click();
      await expect.poll(rootCertificateThumbprints, certificateWaitOptions.removal).not.toContain(thumbprint);
    }
    const remove = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete);
    await expect(remove).toBeVisible();
    await remove.click();
    await expect.poll(() => profileCertificateThumbprint(desktopApp)).toBeNull();
    await expect(remove).toBeHidden();
  });
  await attempt(() => getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click());
  if (errors.length > 0) throw new AggregateError(errors, 'HTTPS Capture UI cleanup failed.');
}