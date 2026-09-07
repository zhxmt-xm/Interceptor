import { execFile } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';

const execFileAsync = promisify(execFile);
const INSECURE_HOST = 'localhost';
const PASSTHROUGH_HOST = '127.0.0.2';

interface WinInetProxySettings {
  readonly flags: number;
  readonly proxyEnabled: boolean;
  readonly autoDetect: boolean;
  readonly proxyServer: string | null;
  readonly bypassList: string | null;
  readonly pacUrl: string | null;
}

interface SystemProxyJournalRecord {
  /** Minimal crash journal schema version. */
  readonly version: 1;
  /** Complete WinINet snapshot captured before takeover. */
  readonly original: WinInetProxySettings;
  /** Complete WinINet snapshot written by Interceptor. */
  readonly owned: WinInetProxySettings;
}

interface PersistenceEvidence {
  initialOwnedSettingsObserved: boolean;
  ownedSnapshotDiffered: boolean;
  journalPreservedAfterCrash: boolean;
  ownedSettingsPreservedAfterCrash: boolean;
  relaunchLoadedJournal: boolean;
  relaunchPreservedOriginal: boolean;
  relaunchOwnedSettingsObserved: boolean;
  certificateFilePreserved: boolean;
  certificateWithinValidity: boolean;
  certificateTrustPreserved: boolean;
  mitmIntentRestored: boolean;
  insecureHostRestored: boolean;
  passthroughHostRestored: boolean;
  testCaRemoved: boolean;
  finalSystemProxyRestored: boolean;
  finalJournalAbsent: boolean;
}

/** Read WinINet through the production helper without exposing snapshot values. */
async function readWinInetSettings(
  desktopDirectory: string,
): Promise<WinInetProxySettings> {
  const helperPath = path.join(
    desktopDirectory,
    'dist',
    'system-proxy',
    'wininet-proxy-helper.exe',
  );
  try {
    const { stdout } = await execFileAsync(helperPath, ['get'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return JSON.parse(stdout) as WinInetProxySettings;
  } catch {
    throw new Error('WinINet helper could not read the current settings.');
  }
}

/** Read one crash journal for in-memory equality checks only. */
async function readJournal(): Promise<SystemProxyJournalRecord | null> {
  const localAppDataDirectory = process.env.LOCALAPPDATA;
  if (!localAppDataDirectory) {
    throw new Error('LOCALAPPDATA is required for system proxy ownership evidence.');
  }
  try {
    return JSON.parse(await readFile(path.join(
      localAppDataDirectory,
      'Interceptor',
      'system-proxy',
      'journal.json',
    ), 'utf8')) as SystemProxyJournalRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Compute the SHA-1 thumbprint used by the Windows local-machine Root store. */
async function certificateSha1(certificatePath: string): Promise<string> {
  const certificate = new X509Certificate(await readFile(certificatePath));
  return createHash('sha1').update(certificate.raw).digest('hex').toUpperCase();
}

/** Check the exact test CA without changing the trust store. */
async function isCertificateTrusted(sha1Thumbprint: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'certutil.exe',
      ['-verifystore', 'Root', sha1Thumbprint],
      { encoding: 'utf8', windowsHide: true },
    );
    return stdout.toUpperCase().includes(sha1Thumbprint);
  } catch {
    return false;
  }
}

/** Save every persistent TLS value through public Settings controls. */
async function configurePersistenceThroughUi(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();

  const generate = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.generate,
  );
  const install = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.install,
  );
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(install).toBeEnabled();
  await install.click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.uninstall,
  )).toBeVisible({ timeout: 30_000 });

  const mitmToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.mitmToggle,
  );
  await mitmToggle.click();
  await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');

  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.insecureHostInput,
  ).fill(INSECURE_HOST);
  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.certificates.insecureHostAdd,
  ).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.insecureHost(INSECURE_HOST),
  )).toBeVisible();

  await getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.tlsPassthrough,
  ).click();
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

/** Remove every test value through the same public Settings controls. */
async function cleanPersistenceThroughUi(
  page: Page,
  certificateSha1Thumbprint: string,
): Promise<void> {
  const errors: unknown[] = [];
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  };

  const enterAnyway = getByAutomationId(page, AUTOMATION_IDS.shell.boot.enterAnyway);
  if (await enterAnyway.isVisible().catch(() => false)) {
    await attempt(() => enterAnyway.click());
  }
  await attempt(() => getByAutomationId(
    page,
    AUTOMATION_IDS.shell.workspace.settings,
  ).click());
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
      await expect(row).not.toBeVisible();
    }
  });

  await attempt(() => getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.certificates,
  ).click());
  await attempt(async () => {
    const host = getByAutomationId(
      page,
      AutomationIdFactory.insecureHost(INSECURE_HOST),
    );
    if (await host.isVisible().catch(() => false)) {
      await getByAutomationId(
        page,
        AutomationIdFactory.insecureHostRemove(INSECURE_HOST),
      ).click();
      await expect(host).not.toBeVisible();
    }
  });
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
  await attempt(async () => {
    const uninstall = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.uninstall,
    );
    if (await uninstall.isVisible().catch(() => false)) {
      await uninstall.click();
      await expect(getByAutomationId(
        page,
        AUTOMATION_IDS.settings.certificates.delete,
      )).toBeVisible({ timeout: 30_000 });
    }
  });
  await attempt(async () => {
    const remove = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.delete,
    );
    if (await remove.isVisible().catch(() => false)) {
      await remove.click();
      await expect(remove).not.toBeVisible();
    }
  });
  if (await isCertificateTrusted(certificateSha1Thumbprint)) {
    errors.push(new Error('The workflow CA remains in the local-machine Root store.'));
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Persistence UI cleanup failed.');
  }
}

/** Close one generation and retain its trace, logs and destroy metadata. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

test('restores proxy ownership and persists MITM settings across processes', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.proxy-mitm.persistence',
  });
  if (process.platform !== 'win32') {
    throw new Error('settings.proxy-mitm.persistence requires Windows WinINet.');
  }

  desktopApp.preserveUserDataOnFailure();
  const certificatePath = path.join(
    desktopApp.userDataDirectory,
    'certificates',
    'root-cert.pem',
  );
  const evidence: Partial<PersistenceEvidence> = {};
  let originalSettings: WinInetProxySettings | null = null;
  let certificateSha1Thumbprint: string | null = null;
  let initialCrashCompleted = false;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;

  try {
    // 准备：第一代冷启动已接管系统代理；快照只在内存比较。
    // Arrange: the first generation owns the system proxy; snapshots stay in memory only.
    const firstJournal = await readJournal();
    expect(firstJournal?.version).toBe(1);
    expect(Object.keys(firstJournal ?? {}).sort()).toEqual([
      'original',
      'owned',
      'version',
    ]);
    originalSettings = firstJournal!.original;
    evidence.initialOwnedSettingsObserved = JSON.stringify(
      await readWinInetSettings(desktopApp.desktopDirectory),
    ) === JSON.stringify(firstJournal!.owned);
    evidence.ownedSnapshotDiffered = JSON.stringify(firstJournal!.original)
      !== JSON.stringify(firstJournal!.owned);
    expect(evidence.initialOwnedSettingsObserved).toBe(true);
    expect(evidence.ownedSnapshotDiffered).toBe(true);

    // 用户操作：通过Settings UI保存MITM意图和两份host配置。
    // User actions: save MITM intent and both host settings through Settings UI.
    await configurePersistenceThroughUi(desktopApp.page);
    certificateSha1Thumbprint = await certificateSha1(certificatePath);
    expect(await isCertificateTrusted(certificateSha1Thumbprint)).toBe(true);

    // 异常边界：终止第一代进程树，journal与owned WinINet必须原样保留。
    // Crash boundary: terminate the first process tree; journal and owned WinINet must remain unchanged.
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.crashAbruptly(testInfo);
    initialCrashCompleted = true;
    evidence.journalPreservedAfterCrash = JSON.stringify(
      await readJournal(),
    ) === JSON.stringify(firstJournal);
    evidence.ownedSettingsPreservedAfterCrash = JSON.stringify(
      await readWinInetSettings(desktopApp.desktopDirectory),
    ) === JSON.stringify(firstJournal!.owned);
    expect(evidence.journalPreservedAfterCrash).toBe(true);
    expect(evidence.ownedSettingsPreservedAfterCrash).toBe(true);

    // 恢复：第一代完全退出后，第二代加载相同journal并保持owned WinINet。
    // Recovery: after the first generation exits, the second loads the same journal and keeps owned WinINet.
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    await relaunchedApp.waitUntilReady();
    const secondJournal = await readJournal();
    evidence.relaunchLoadedJournal = JSON.stringify(secondJournal)
      === JSON.stringify(firstJournal);
    evidence.relaunchPreservedOriginal = JSON.stringify(secondJournal?.original)
      === JSON.stringify(firstJournal?.original);
    evidence.relaunchOwnedSettingsObserved = JSON.stringify(
      await readWinInetSettings(desktopApp.desktopDirectory),
    ) === JSON.stringify(secondJournal?.owned);
    expect(evidence.relaunchLoadedJournal).toBe(true);
    expect(evidence.relaunchPreservedOriginal).toBe(true);
    expect(evidence.relaunchOwnedSettingsObserved).toBe(true);

    const restoredCertificate = new X509Certificate(await readFile(certificatePath));
    const restoredCertificateSha1 = createHash('sha1')
      .update(restoredCertificate.raw)
      .digest('hex')
      .toUpperCase();
    const now = Date.now();
    evidence.certificateFilePreserved = restoredCertificateSha1
      === certificateSha1Thumbprint;
    evidence.certificateWithinValidity = Date.parse(restoredCertificate.validFrom) <= now
      && Date.parse(restoredCertificate.validTo) > now;
    evidence.certificateTrustPreserved = await isCertificateTrusted(
      restoredCertificateSha1,
    );
    expect(evidence.certificateFilePreserved).toBe(true);
    expect(evidence.certificateWithinValidity).toBe(true);
    expect(evidence.certificateTrustPreserved).toBe(true);

    // 业务断言：第二代Settings必须恢复MITM意图、源站例外和passthrough pattern。
    // Business assertions: the second Settings view restores MITM intent, insecure host and passthrough pattern.
    await getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.shell.workspace.settings,
    ).click();
    await getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.settings.section.certificates,
    ).click();
    const mitmToggle = getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.settings.certificates.mitmToggle,
    );
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
    evidence.mitmIntentRestored = true;
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.insecureHost(INSECURE_HOST),
    )).toBeVisible();
    evidence.insecureHostRestored = true;
    await getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.settings.section.tlsPassthrough,
    ).click();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST),
    )).toBeVisible();
    evidence.passthroughHostRestored = true;
    expect(relaunchedApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    const attempt = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };

    // 恢复副作用：始终由可用App经UI清除配置和测试CA。
    // Restore side effects: a usable App always clears settings and the test CA through UI.
    await attempt(async () => {
      if (initialCrashCompleted && !relaunchedApp) {
        relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
          userDataDirectory: desktopApp.userDataDirectory,
          evidencePrefix: 'recovery',
        });
        await relaunchedApp.waitUntilReady();
      }
    });
    const cleanupApp = relaunchedApp ?? desktopApp;
    if (!certificateSha1Thumbprint) {
      certificateSha1Thumbprint = await certificateSha1(certificatePath).catch(() => null);
    }
    if (certificateSha1Thumbprint) {
      await attempt(() => cleanPersistenceThroughUi(
        cleanupApp.page,
        certificateSha1Thumbprint!,
      ));
      evidence.testCaRemoved = !await isCertificateTrusted(certificateSha1Thumbprint);
    }
    await attempt(() => closeGeneration(cleanupApp, testInfo));

    // 销毁断言：产品Close恢复第一代original并清journal。
    // Teardown assertions: product Close restores the first original and clears the journal.
    await attempt(async () => {
      evidence.finalSystemProxyRestored = originalSettings !== null
        && JSON.stringify(await readWinInetSettings(desktopApp.desktopDirectory))
          === JSON.stringify(originalSettings);
      evidence.finalJournalAbsent = await readJournal() === null;
      expect(evidence.finalSystemProxyRestored).toBe(true);
      expect(evidence.finalJournalAbsent).toBe(true);
      const evidencePath = testInfo.outputPath('proxy-mitm-persistence.json');
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
      await testInfo.attach('proxy-mitm-persistence.json', {
        path: evidencePath,
        contentType: 'application/json',
      });
    });

    if (cleanupErrors.length > 0) {
      cleanupError = new AggregateError(cleanupErrors, 'Workflow cleanup failed.');
      await relaunchedApp?.forceCleanup().catch(() => undefined);
    } else {
      desktopApp.releasePreservedUserData();
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});