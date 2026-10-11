import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, type Page } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { LocalElectronApplicationDriver } from '../runtime/local-electron-driver';
import { getByAutomationId } from './automation';

const execFileAsync = promisify(execFile);
const ORIGIN_HOST = 'localhost';
export const certificateWaitOptions = getCertificateWaitOptions();
export const sharedCertificateFileNames = [
  'root-cert.pem', process.platform === 'win32' ? 'root-key.pem' : 'root-key.enc', 'ca-meta.json',
];
const certificateThumbprintsByApplication = new WeakMap<LocalElectronApplicationDriver, string>();

export async function registerTlsCompatibilityDismissal(page: Page): Promise<void> {
  const dismiss = getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.dismiss);
  const trigger = process.platform === 'darwin'
    ? getByAutomationId(page, AUTOMATION_IDS.settings.tlsCompatibility.hostList)
      .locator(':scope > [data-automation-id]').first()
    : dismiss;
  await page.addLocatorHandler(trigger, async () => {
    if (process.platform === 'darwin') {
      const [button] = await dismiss.elementHandles();
      if (!button) return;
      try {
        // Keep this prompt's button; a locator would wait for a replacement after it closes.
        await button.press('Enter', { timeout: 5_000 });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Element is not attached to the DOM')) throw error;
      } finally {
        await button.dispose();
      }
    } else {
      await dismiss.click();
    }
  }, process.platform === 'darwin' ? { noWaitAfter: true } : undefined);
}

export function sharedCertificateDirectory(): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Interceptor Platform', 'certificates');
    case 'win32': {
      const localAppDataDirectory = process.env.LOCALAPPDATA;
      if (!localAppDataDirectory) throw new Error('LOCALAPPDATA is required for shared certificate evidence.');
      return path.join(localAppDataDirectory, 'Interceptor', 'certificates');
    }
    default: throw new Error(`Shared certificates are not supported on ${process.platform}.`);
  }
}

export async function requireSharedCertificateReady(): Promise<void> {
  for (const name of sharedCertificateFileNames) {
    const metadata = await lstat(path.join(sharedCertificateDirectory(), name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!metadata?.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Initialize the shared CA through normal Interceptor startup before running ordinary workflows or packaged smoke.');
    }
  }
  const thumbprint = await sharedCertificateThumbprint();
  if (!thumbprint || !await isCertificateTrusted(thumbprint)) {
    throw new Error('Complete the shared CA system authorization through normal Interceptor startup before running ordinary workflows or packaged smoke.');
  }
}

export async function requireEmptySharedCertificateStore(): Promise<void> {
  for (const name of sharedCertificateFileNames) {
    const metadata = await lstat(path.join(sharedCertificateDirectory(), name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (metadata) throw new Error('Certificate lifecycle workflows require an empty shared CA store; existing material must not be used as test cleanup input.');
  }
}

export async function removeCreatedSharedCertificate(
  desktopApp: LocalElectronApplicationDriver, originalRootThumbprints: readonly string[],
): Promise<void> {
  const thumbprint = await sharedCertificateThumbprint();
  if (!thumbprint) return;
  expect(originalRootThumbprints, 'Never remove a CA from the original system root set').not.toContain(thumbprint);
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click({ timeout: 15_000 });
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click({ timeout: 15_000 });
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate)).toBeVisible({ timeout: 15_000 });
  const uninstall = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall);
  if (await uninstall.isVisible()) {
    await uninstall.click({ timeout: 15_000 });
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled(certificateWaitOptions.visibility);
  }
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete).click({ timeout: 15_000 });
  await expect.poll(sharedCertificateThumbprint).toBeNull();
  await expect.poll(rootCertificateThumbprints).toEqual(originalRootThumbprints);
}

export async function waitForCertificateInstallation(page: LocalElectronApplicationDriver['page']): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall))
    .toBeVisible(certificateWaitOptions.visibility);
}

export async function isCertificateTrusted(thumbprint: string): Promise<boolean> {
  switch (process.platform) {
    case 'darwin': return isMacosCertificateTrusted(thumbprint);
    case 'win32': return isWindowsCertificateTrusted(thumbprint);
    default: throw new Error(`Certificate trust evidence is not supported on ${process.platform}.`);
  }
}

async function isWindowsCertificateTrusted(thumbprint: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('certutil.exe', ['-verifystore', 'Root', thumbprint], {
      encoding: 'utf8', windowsHide: true,
    });
    return stdout.toUpperCase().includes(thumbprint.toUpperCase());
  } catch {
    return false;
  }
}

async function isMacosCertificateTrusted(thumbprint: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', [
      'find-certificate', '-a', '-p', '/Library/Keychains/System.keychain',
    ], { encoding: 'utf8' });
    const certificate = [...stdout.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)]
      .map(([pem]) => new X509Certificate(pem))
      .find((candidate) => candidate.fingerprint.replaceAll(':', '') === thumbprint.toUpperCase());
    if (!certificate) return false;
    const verification = execFileAsync('/usr/bin/security', [
      'verify-cert', '-c', '/dev/stdin', '-p', 'basic', '-L', '-q', '-k', '/Library/Keychains/System.keychain',
    ], { encoding: 'utf8' });
    verification.child.stdin?.end(certificate.toString());
    await verification;
    return true;
  } catch {
    return false;
  }
}

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
} {
  switch (process.platform) {
    case 'darwin':
      return { visibility: { timeout: 120_000 } };
    default:
      return { visibility: { timeout: 30_000 } };
  }
}

export async function sharedCertificateThumbprint(): Promise<string | null> {
  try {
    const certificate = new X509Certificate(await readFile(path.join(
      sharedCertificateDirectory(), 'root-cert.pem',
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
  await waitForCertificateInstallation(page);
  const thumbprint = await sharedCertificateThumbprint();
  expect(thumbprint).not.toBeNull();
  await expect.poll(rootCertificateThumbprints).toContain(thumbprint);
  expect(await isCertificateTrusted(thumbprint!)).toBe(true);
  certificateThumbprintsByApplication.set(desktopApp, thumbprint!);
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
    const cancelSetup = getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel);
    if (await cancelSetup.isVisible()) {
      await cancelSetup.click();
      await expect(cancelSetup).toBeHidden();
    }
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
    const thumbprint = certificateThumbprintsByApplication.get(desktopApp);
    if (!thumbprint) return;
    expect(await sharedCertificateThumbprint()).toBe(thumbprint);
    expect(await isCertificateTrusted(thumbprint)).toBe(true);
    certificateThumbprintsByApplication.delete(desktopApp);
  });
  await attempt(() => getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click());
  if (errors.length > 0) throw new AggregateError(errors, 'HTTPS Capture UI cleanup failed.');
}