import { readFile, stat, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/ui/capture-workflow';
import { expect, type LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';

interface SystemProxyJournalRecord {
  /** Minimal crash journal schema version. */
  readonly version: 1;
  /** Complete WinINet snapshot captured before takeover. */
  readonly original: unknown;
  /** Complete WinINet snapshot written by Interceptor. */
  readonly owned: unknown;
}

interface LocatedJournal {
  /** Parsed minimal crash journal. */
  readonly record: SystemProxyJournalRecord;
  /** NTFS modification token used to prove restore followed by a new takeover. */
  readonly modifiedAtNanoseconds: bigint;
}

interface CoreRestartEvidence {
  /** Core A served a real proxied request before the fault. */
  firstRequestCaptured: boolean;
  /** The test terminated the live Core A generation owned by this workflow. */
  firstCoreTerminated: boolean;
  /** Core recovery removed the first journal before another takeover. */
  firstJournalRemoved: boolean;
  /** Core recovery restored original WinINet before another takeover. */
  originalRestoredBeforeRestart: boolean;
  /** Core A exited and Core B used a different PID. */
  restartedWithNewProcess: boolean;
  /** Core A's temporary Capture row did not leak into Core B. */
  firstGenerationCaptureCleared: boolean;
  /** Core B's bootstrap created a new crash journal. */
  journalRecreatedAfterRestart: boolean;
  /** The new takeover retained the workflow's original WinINet snapshot. */
  originalSnapshotPreserved: boolean;
  /** The new takeover retained the same loopback target. */
  ownedSnapshotPreserved: boolean;
  /** Core B served a real proxied request. */
  restartedRequestCaptured: boolean;
  /** A Rules view load proved Core B's RPC request/response path. */
  restartedCoreRpcUsable: boolean;
  /** Core B fault followed by normal Close left no workflow process alive. */
  closeAfterFaultLeftNoProcesses: boolean;
  /** Normal Close restored WinINet and removed the crash journal. */
  finalHostRestored: boolean;
}

/** Read the shared Windows crash journal and its current file generation. */
async function readJournal(desktopApp: LocalElectronApplicationDriver): Promise<LocatedJournal | null> {
  try {
    const [serialized, metadata] = await Promise.all([
      readFile(desktopApp.systemProxyJournalPath(), 'utf8'),
      stat(desktopApp.systemProxyJournalPath(), { bigint: true }),
    ]);
    return {
      record: JSON.parse(serialized) as SystemProxyJournalRecord,
      modifiedAtNanoseconds: metadata.mtimeNs,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Wait for the initial journal or a later atomic replacement. */
async function waitForJournal(
  desktopApp: LocalElectronApplicationDriver,
  previousGeneration?: bigint,
): Promise<LocatedJournal> {
  let locatedJournal: LocatedJournal | null = null;
  await expect.poll(async () => {
    locatedJournal = await readJournal(desktopApp);
    return locatedJournal !== null
      && locatedJournal.record.version === 1
      && locatedJournal.modifiedAtNanoseconds !== previousGeneration;
  }, {
    message: previousGeneration === undefined
      ? 'Initial system proxy journal was not created.'
      : 'Core recovery did not create a new system proxy journal generation.',
    timeout: 20_000,
  }).toBe(true);
  return locatedJournal!;
}

test('application.lifecycle.core-restart restores Core and system proxy ordering', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 150_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'application.lifecycle.core-restart',
  });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  const evidence: Partial<CoreRestartEvidence> = {};
  const recording = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.recordingToggle,
  );

  // 准备：通过真实产品流程接管系统代理，记录Core A和首次三字段journal。
  // Arrange: take over the system proxy through the real product flow and record Core A plus the first three-field journal.
  await startRecording(desktopApp);
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
  const firstJournal = await waitForJournal(desktopApp);
  expect(Object.keys(firstJournal.record).sort()).toEqual([
    'original',
    'owned',
    'version',
  ]);
  expect(isDeepStrictEqual(await desktopApp.readSystemProxySettings(), firstJournal.record.owned)).toBe(true);
  const firstCore = await desktopApp.currentCoreProcessIdentity();

  // 用户流：Core A先处理一条真实代理请求，Renderer通过row和Inspector展示结果。
  // User flow: Core A serves one real proxied request and Renderer exposes it through the row and Inspector.
  const firstRequestPath = '/e2e/application/core-restart/first';
  await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: firstRequestPath,
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.tab.response,
  ).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyPane,
  )).toContainText(firstRequestPath);
  evidence.firstRequestCaptured = true;

  // 故障：测试环境只终止已登记的Core A代际，Main保持运行并创建Core B。
  // Fault: the test environment terminates only registered Core A while Main stays alive and creates Core B.
  await desktopApp.terminateCoreAndVerifyProxyRestoration(
    firstCore, firstJournal.record.original, firstJournal.modifiedAtNanoseconds,
  );
  evidence.firstCoreTerminated = true;
  evidence.firstJournalRemoved = true;
  evidence.originalRestoredBeforeRestart = true;
  const secondCore = await desktopApp.waitForRestartedCoreProcess(firstCore.processId);
  evidence.restartedWithNewProcess = secondCore.processId !== firstCore.processId;
  expect(evidence.restartedWithNewProcess).toBe(true);

  // 业务断言：旧Capture消失；自动Restore后新Core重新接管，但original绝不变成8888。
  // Business assertions: old Capture disappears; the new Core retakes the proxy after automatic Restore without replacing original with 8888.
  const firstGenerationRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: firstRequestPath });
  await expect(firstGenerationRow).toHaveCount(0);
  evidence.firstGenerationCaptureCleared = true;
  await expect(recording).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  const secondJournal = await waitForJournal(desktopApp, firstJournal.modifiedAtNanoseconds);
  evidence.journalRecreatedAfterRestart = true;
  evidence.originalSnapshotPreserved = desktopApp.matchesSystemProxyEvidence(secondJournal.record.original, firstJournal.record.original);
  evidence.ownedSnapshotPreserved = desktopApp.matchesSystemProxyEvidence(secondJournal.record.owned, firstJournal.record.owned);
  expect(evidence.originalSnapshotPreserved).toBe(true);
  expect(evidence.ownedSnapshotPreserved).toBe(true);
  expect(isDeepStrictEqual(await desktopApp.readSystemProxySettings(), secondJournal.record.owned)).toBe(true);

  // 恢复：Core B处理第二条请求，并通过公开导航证明Renderer与RPC仍可用。
  // Recovery: Core B serves a second request and public navigation proves Renderer and RPC remain usable.
  const secondRequestPath = '/e2e/application/core-restart/second';
  await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: secondRequestPath,
  });
  evidence.restartedRequestCaptured = true;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision))
    .toHaveAttribute('data-revision', /^\d+$/);
  evidence.restartedCoreRpcUsable = true;
  for (const workspaceId of [
    AUTOMATION_IDS.shell.workspace.composer,
    AUTOMATION_IDS.shell.workspace.capture,
  ] as const) {
    await getByAutomationId(page, workspaceId).click();
    await expect(getByAutomationId(page, workspaceId)).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  // Evidence/teardown：精确终止Core B后立即真实Close，不得留下任何进程代际或宿主副作用。
  // Evidence/teardown: close immediately after terminating exact Core B; no process generation or host side effect may remain.
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.terminateCoreProcessGeneration(secondCore);
  await desktopApp.closeGracefully();
  evidence.closeAfterFaultLeftNoProcesses = (
    await desktopApp.listLiveRegisteredProcessIds()
  ).length === 0;
  expect(evidence.closeAfterFaultLeftNoProcesses).toBe(true);
  evidence.finalHostRestored = await readJournal(desktopApp) === null
    && desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), firstJournal.record.original);
  expect(evidence.finalHostRestored).toBe(true);

  const evidencePath = testInfo.outputPath('core-restart.json');
  await writeFile(evidencePath, JSON.stringify({
    ...evidence,
    firstCorePid: firstCore.processId,
    secondCorePid: secondCore.processId,
  }, null, 2), 'utf8');
  await testInfo.attach('core-restart.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
  desktopApp.releasePreservedUserData();
});