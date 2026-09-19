import { describe, expect, it } from 'vitest';

import {
  WorkflowHostSafetyGuard,
  type WinInetProxySettings,
  type WorkflowHostSafetyOperations,
} from '../../workflow-host-safety-guard';

const ORIGINAL_SETTINGS: WinInetProxySettings = {
  flags: 13,
  proxyEnabled: false,
  autoDetect: true,
  proxyServer: null,
  bypassList: null,
  pacUrl: 'https://corp.example/proxy.pac',
};

const OWNED_SETTINGS: WinInetProxySettings = {
  flags: 3,
  proxyEnabled: true,
  autoDetect: false,
  proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
  bypassList: 'localhost;127.*;[::1];<local>',
  pacUrl: null,
};

class FakeWorkflowHostSafetyOperations implements WorkflowHostSafetyOperations {
  /** Ordered recovery operations observed by the test. */
  readonly calls: string[] = [];
  /** Current fake WinINet values. */
  settings = { ...ORIGINAL_SETTINGS };
  /** Whether the shared crash journal currently exists. */
  crashJournalExists = false;
  /** Whether capture port 8888 can currently be rebound. */
  capturePortAvailable = true;
  /** Test-owned process identifiers that remain alive. */
  liveProcessIds: number[] = [];
  /** Optional failure returned by the emergency restore operation. */
  restoreError: Error | null = null;

  /** Register one test-owned Electron profile. */
  registerUserDataDirectory(_userDataDirectory: string): void {}

  /** Register one exact test-owned process generation. */
  registerProcessIdentity(processIdentity: { processId: number }): void {
    this.calls.push(`register-process:${processIdentity.processId}`);
  }

  /** Register the current fake capture listener generation. */
  registerCaptureListenerProcess(): Promise<void> {
    this.calls.push('register-listener');
    return Promise.resolve();
  }

  /** Read the complete current WinINet snapshot. */
  readSystemProxySettings(): Promise<WinInetProxySettings> {
    this.calls.push('read-wininet');
    return Promise.resolve({ ...this.settings });
  }

  areSystemProxySettingsEqual(left: WinInetProxySettings, right: WinInetProxySettings): boolean {
    return left.flags === right.flags
      && left.proxyEnabled === right.proxyEnabled
      && left.autoDetect === right.autoDetect
      && left.proxyServer === right.proxyServer
      && left.bypassList === right.bypassList
      && left.pacUrl === right.pacUrl;
  }

  /** Report whether the shared crash journal exists. */
  hasCrashJournal(): Promise<boolean> {
    this.calls.push('read-journal');
    return Promise.resolve(this.crashJournalExists);
  }

  /** Return tracked Main/Core/Worker processes that remain alive. */
  listLiveProcessIds(rootProcessIds: readonly number[]): Promise<readonly number[]> {
    this.calls.push(`list-processes:${rootProcessIds.join(',')}`);
    return Promise.resolve([...this.liveProcessIds]);
  }

  /** Report whether capture port 8888 is free. */
  canBindCapturePort(): Promise<boolean> {
    this.calls.push('probe-port');
    return Promise.resolve(this.capturePortAvailable);
  }

  /** Close native dialogs owned by the tracked Electron process trees. */
  dismissOwnedDialogs(rootProcessIds: readonly number[]): Promise<void> {
    this.calls.push(`dismiss-dialogs:${rootProcessIds.join(',')}`);
    return Promise.resolve();
  }

  /** Terminate every tracked Electron process tree. */
  terminateProcessTrees(rootProcessIds: readonly number[]): Promise<void> {
    this.calls.push(`terminate-test-processes:${rootProcessIds.join(',')}`);
    this.liveProcessIds = [];
    this.capturePortAvailable = true;
    return Promise.resolve();
  }

  /** Terminate one exact test-owned process generation. */
  terminateProcessGeneration(processIdentity: {
    readonly processId: number;
    readonly processStartedAt: string;
  }): Promise<void> {
    this.calls.push(`terminate-generation:${processIdentity.processId}`);
    this.liveProcessIds = this.liveProcessIds.filter(
      (processId) => processId !== processIdentity.processId,
    );
    return Promise.resolve();
  }

  /** Restore the exact workflow baseline from its crash journal. */
  restoreCrashJournal(baseline: WinInetProxySettings): Promise<void> {
    this.calls.push('restore-journal');
    if (this.restoreError) {
      return Promise.reject(this.restoreError);
    }
    this.settings = { ...baseline };
    this.crashJournalExists = false;
    return Promise.resolve();
  }
}

describe('WorkflowHostSafetyGuard', () => {
  it('never recovers host state after the launch preflight rejects an existing journal', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    operations.crashJournalExists = true;

    await expect(workflowHostSafetyGuard.captureBaseline()).rejects.toThrow(
      'Workflow host is not clean enough to launch Electron.',
    );
    operations.calls.length = 0;

    await expect(workflowHostSafetyGuard.verifyRestored()).rejects.toThrow(
      'Workflow host baseline was not captured.',
    );
    expect(operations.calls).toEqual([]);
  });

  it('accepts a workflow that leaves WinINet, journal, processes and port unchanged', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');

    await workflowHostSafetyGuard.verifyRestored();

    expect(operations.calls).not.toContain('restore-journal');
    expect(operations.calls).not.toContain('terminate-test-processes:101');
  });

  it('terminates registered application generations for an intentional crash', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');
    operations.liveProcessIds = [101, 111];
    operations.calls.length = 0;

    await workflowHostSafetyGuard.terminateRegisteredApplications();

    expect(operations.calls).toEqual(['terminate-test-processes:101']);
    expect(operations.liveProcessIds).toEqual([]);
  });

  it('terminates one registered Core generation without stopping its Main root', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');
    const coreProcessIdentity = {
      processId: 111,
      processStartedAt: 'core-start',
    };
    workflowHostSafetyGuard.registerProcessIdentity(coreProcessIdentity);
    operations.liveProcessIds = [101, 111];
    operations.calls.length = 0;

    await workflowHostSafetyGuard.terminateProcessGeneration(coreProcessIdentity);

    expect(operations.calls).toEqual(['terminate-generation:111']);
    expect(operations.liveProcessIds).toEqual([101]);
  });

  it('lists only live registered process generations for destroy verification', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');
    operations.liveProcessIds = [101, 111];

    await expect(workflowHostSafetyGuard.listLiveRegisteredProcessIds())
      .resolves.toEqual([101, 111]);
  });

  it('kills test processes and restores an abandoned journal before reporting pollution', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');
    workflowHostSafetyGuard.registerApplication(202, 'profile-b');
    operations.settings = { ...OWNED_SETTINGS };
    operations.crashJournalExists = true;
    operations.capturePortAvailable = false;
    operations.liveProcessIds = [101, 111, 202, 222];
    operations.calls.length = 0;

    await expect(workflowHostSafetyGuard.verifyRestored()).rejects.toThrow(
      'Workflow changed protected host state.',
    );

    expect(operations.calls).toEqual([
      'list-processes:101,202',
      'probe-port',
      'read-journal',
      'read-wininet',
      'dismiss-dialogs:101,202',
      'terminate-test-processes:101,202',
      'restore-journal',
      'list-processes:101,202',
      'probe-port',
      'read-journal',
      'read-wininet',
    ]);
    expect(operations.settings).toEqual(ORIGINAL_SETTINGS);
    expect(operations.crashJournalExists).toBe(false);
  });

  it('reports both the original pollution and an unsuccessful emergency recovery', async () => {
    const operations = new FakeWorkflowHostSafetyOperations();
    const workflowHostSafetyGuard = new WorkflowHostSafetyGuard(operations);
    await workflowHostSafetyGuard.captureBaseline();
    workflowHostSafetyGuard.registerApplication(101, 'profile-a');
    operations.settings = { ...OWNED_SETTINGS };
    operations.crashJournalExists = true;
    operations.restoreError = new Error('restore failed');

    const error = await workflowHostSafetyGuard.verifyRestored().catch((reason) => reason);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map(String)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('WinINet settings differ from the workflow baseline.'),
        expect.stringContaining('restore failed'),
      ]),
    );
  });
});