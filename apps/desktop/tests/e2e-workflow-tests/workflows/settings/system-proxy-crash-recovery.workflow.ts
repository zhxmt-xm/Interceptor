import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TestInfo } from '@playwright/test';

import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import type { WinInetProxySettings } from '../../fixtures/safety/workflow-host-safety-guard';

interface SystemProxyJournalRecord {
  /** Minimal crash journal schema version. */
  readonly version: 1;
  /** Complete WinINet snapshot captured before takeover. */
  readonly original: WinInetProxySettings;
  /** Complete WinINet snapshot written by Interceptor. */
  readonly owned: WinInetProxySettings;
}

interface LocatedJournal {
  /** Absolute shared journal path used by every App profile. */
  readonly filePath: string;
  /** Parsed minimal crash journal. */
  readonly record: SystemProxyJournalRecord;
}

interface CrashRecoveryEvidence {
  /** App A wrote a distinct owned snapshot. */
  firstGenerationOwned: boolean;
  /** App A and its Core were intentionally destroyed. */
  firstGenerationDestroyed: boolean;
  /** App B loaded App A's original snapshot unchanged. */
  secondGenerationLoadedOriginal: boolean;
  /** App B loaded App A's owned snapshot unchanged. */
  secondGenerationLoadedOwned: boolean;
  /** Both generations used the one user-level journal path. */
  sharedJournalPathUsed: boolean;
  /** App B restored the host and exited normally. */
  secondGenerationDestroyed: boolean;
}

/** Read the one user-level crash journal. */
async function readSharedJournal(): Promise<LocatedJournal | null> {
  const localAppDataDirectory = process.env.LOCALAPPDATA;
  if (!localAppDataDirectory) {
    throw new Error('LOCALAPPDATA is required for system proxy recovery evidence.');
  }
  const filePath = path.join(
    localAppDataDirectory,
    'Interceptor',
    'system-proxy',
    'journal.json',
  );
  try {
    return {
      filePath,
      record: JSON.parse(await readFile(filePath, 'utf8')) as SystemProxyJournalRecord,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Wait for one App generation to persist its minimal crash journal. */
async function waitForCrashJournal(): Promise<LocatedJournal> {
  let locatedJournal: LocatedJournal | null = null;
  await expect.poll(async () => {
    locatedJournal = await readSharedJournal();
    return locatedJournal?.record.version ?? null;
  }, {
    message: 'System proxy crash journal was not persisted.',
    timeout: 20_000,
  }).toBe(1);
  return locatedJournal!;
}

/** Close one App generation and retain trace, logs and destroy evidence. */
async function closeGeneration(
  driver: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await driver.captureFinalScreenshot(testInfo);
  await driver.stopTrace(testInfo);
  await driver.closeGracefully();
  await driver.writeEvidence(testInfo);
  await driver.forceCleanup();
}

test('loads a crashed system proxy journal across isolated profiles', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(150_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.system-proxy.crash-recovery',
  });
  if (process.platform !== 'win32') {
    throw new Error('settings.system-proxy.crash-recovery requires Windows WinINet.');
  }

  desktopApp.preserveUserDataOnFailure();
  let secondGeneration: LocalElectronApplicationDriver | null = null;
  let secondGenerationClosed = false;
  let workflowError: unknown;
  let cleanupError: unknown;
  const evidence: Partial<CrashRecoveryEvidence> = {};

  try {
    // 准备：App A自动接管并持久化唯一的original/owned快照。
    // Arrange: App A takes over and persists the only original/owned snapshots.
    const firstJournal = await waitForCrashJournal();
    evidence.firstGenerationOwned = JSON.stringify(firstJournal.record.original)
      !== JSON.stringify(firstJournal.record.owned);
    expect(evidence.firstGenerationOwned).toBe(true);
    expect(Object.keys(firstJournal.record).sort()).toEqual([
      'original',
      'owned',
      'version',
    ]);

    // 异常退出：终止A后再顺序启动B，不存在两个App并发。
    // Abrupt exit: terminate A before B starts; two Apps never run concurrently.
    await desktopApp.captureFinalScreenshot(testInfo);
    await desktopApp.crashAbruptly(testInfo);
    evidence.firstGenerationDestroyed = true;

    // 用户流程：不同profile的B加载同一共享journal，不重写当前8888。
    // User flow: B uses another profile and loads the same shared journal without rewriting 8888.
    secondGeneration = await LocalElectronApplicationDriver.launch(testInfo, {
      evidencePrefix: 'relaunch',
    });
    await secondGeneration.waitUntilReady();
    const secondJournal = await waitForCrashJournal();

    // 业务断言：两份快照逐字段保持，profile隔离不影响共享journal。
    // Business assertions: both snapshots remain exact across isolated profiles.
    evidence.secondGenerationLoadedOriginal = JSON.stringify(
      secondJournal.record.original,
    ) === JSON.stringify(firstJournal.record.original);
    evidence.secondGenerationLoadedOwned = JSON.stringify(
      secondJournal.record.owned,
    ) === JSON.stringify(firstJournal.record.owned);
    evidence.sharedJournalPathUsed = secondJournal.filePath === firstJournal.filePath;
    expect(evidence.secondGenerationLoadedOriginal).toBe(true);
    expect(evidence.secondGenerationLoadedOwned).toBe(true);
    expect(evidence.sharedJournalPathUsed).toBe(true);
    expect(secondGeneration.rendererPageErrors()).toEqual([]);

    // Evidence/teardown：B正常关闭，外层guard复核完整宿主状态。
    // Evidence/teardown: B closes normally and the outer guard verifies all host state.
    await closeGeneration(secondGeneration, testInfo);
    secondGenerationClosed = true;
    evidence.secondGenerationDestroyed = true;
    const evidencePath = testInfo.outputPath('system-proxy-crash-recovery.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('system-proxy-crash-recovery.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    desktopApp.releasePreservedUserData();
  } catch (error) {
    workflowError = error;
  } finally {
    if (secondGeneration) {
      try {
        if (!secondGenerationClosed) {
          await closeGeneration(secondGeneration, testInfo);
        }
      } catch (error) {
        cleanupError = error;
        await secondGeneration.forceCleanup().catch(() => undefined);
      }
      if (!workflowError && !cleanupError) {
        await secondGeneration.removeUserData();
      } else {
        testInfo.annotations.push({
          type: 'preserved-user-data',
          description: secondGeneration.userDataDirectory,
        });
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Workflow and cleanup failed.');
  }
  if (workflowError) {
    throw workflowError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
});
