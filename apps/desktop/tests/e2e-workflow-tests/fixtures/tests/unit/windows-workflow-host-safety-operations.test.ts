import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WinInetProxySettings } from '../../workflow-host-safety-guard';
import {
  WindowsWorkflowHostSafetyOperations,
  type WorkflowHostCommandResult,
  type WorkflowHostCommandRunner,
  type WorkflowHostFileStore,
} from '../../windows-workflow-host-safety-operations';

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

class FakeWorkflowHostFileStore implements WorkflowHostFileStore {
  /** In-memory crash journal files keyed by absolute path. */
  readonly files = new Map<string, string>();
  /** Paths removed by guarded recovery. */
  readonly removedPaths: string[] = [];
  /** Paths inspected for crash recovery. */
  readonly readPaths: string[] = [];

  /** Read one optional crash journal. */
  readOptional(filePath: string): Promise<string | null> {
    this.readPaths.push(filePath);
    return Promise.resolve(this.files.get(filePath) ?? null);
  }

  /** Remove one crash journal after verified restoration. */
  remove(filePath: string): Promise<void> {
    this.removedPaths.push(filePath);
    this.files.delete(filePath);
    return Promise.resolve();
  }
}

class FakeWorkflowHostCommandRunner implements WorkflowHostCommandRunner {
  /** Current fake WinINet settings returned by the production helper contract. */
  settings = { ...ORIGINAL_SETTINGS };
  /** Process-table snapshots returned by successive PowerShell reads. */
  processTables: unknown[] = [[]];
  /** Exact process generation returned for the current 8888 listener. */
  listenerProcessIdentity: unknown = null;
  /** Every external command invoked by the adapter. */
  readonly calls: { command: string; args: readonly string[] }[] = [];

  /** Execute one fake helper, PowerShell or taskkill command. */
  run(command: string, args: readonly string[]): Promise<WorkflowHostCommandResult> {
    this.calls.push({ command, args: [...args] });
    if (command.endsWith('wininet-proxy-helper.exe')) {
      if (args[0] === 'get') {
        return Promise.resolve({ stdout: JSON.stringify(this.settings), stderr: '' });
      }
      if (args[0] === 'set') {
        const flags = Number(args[1]);
        this.settings = {
          flags,
          proxyEnabled: (flags & 2) !== 0,
          autoDetect: (flags & 8) !== 0,
          proxyServer: decode(args[2]),
          bypassList: decode(args[3]),
          pacUrl: decode(args[4]),
        };
        return Promise.resolve({ stdout: JSON.stringify(this.settings), stderr: '' });
      }
    }
    if (
      command === 'powershell.exe'
      && args.at(-1)?.includes('Get-CimInstance Win32_Process')
    ) {
      return Promise.resolve({
        stdout: JSON.stringify(this.processTables.shift() ?? []),
        stderr: '',
      });
    }
    if (
      command === 'powershell.exe'
      && args.at(-1)?.includes('Get-NetTCPConnection')
    ) {
      return Promise.resolve({
        stdout: JSON.stringify(this.listenerProcessIdentity),
        stderr: '',
      });
    }
    return Promise.resolve({ stdout: '', stderr: '' });
  }
}

describe('WindowsWorkflowHostSafetyOperations', () => {
  it('keeps discovered descendants tracked after their Main parent exits', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [
      [
        { processId: 100, parentProcessId: 50, creationDate: 'root-start' },
        { processId: 101, parentProcessId: 100, creationDate: 'child-start' },
        { processId: 102, parentProcessId: 101, creationDate: 'worker-start' },
      ],
      [{ processId: 102, parentProcessId: 4, creationDate: 'worker-start' }],
    ];
    const operations = createOperations(fileStore, commandRunner);

    expect(await operations.listLiveProcessIds([100])).toEqual([100, 101, 102]);
    const processTableScript = commandRunner.calls[0]?.args.at(-1) ?? '';
    expect(processTableScript).toContain('Get-Process -Id');
    expect(processTableScript).toContain('$process.StartTime');
    expect(processTableScript).toContain('$_.CreationDate.ToUniversalTime()');
    expect(processTableScript).not.toContain('catch {}');
    expect(await operations.listLiveProcessIds([100])).toEqual([102]);
  });

  it('discovers an orphan Core from its registered profile data directory', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const profileDirectory = String.raw`C:\profiles\owner-a`;
    commandRunner.processTables = [[{
      processId: 102,
      parentProcessId: 4,
      creationDate: 'orphan-core-start',
      commandLine: String.raw`utility.exe --data-dir=C:\profiles\owner-a\storage`,
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerUserDataDirectory(profileDirectory);

    expect(await operations.listLiveProcessIds([100])).toEqual([102]);
  });

  it('does not treat a profile path prefix as the registered profile', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[{
      processId: 102,
      parentProcessId: 4,
      creationDate: 'external-core-start',
      commandLine: String.raw`electron.exe --user-data-dir=C:\profiles\owner-a-copy`,
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerUserDataDirectory(String.raw`C:\profiles\owner-a`);

    expect(await operations.listLiveProcessIds([100])).toEqual([]);
  });

  it('keeps an explicitly registered Core generation after it is reparented', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[{
      processId: 102,
      parentProcessId: 4,
      creationDate: 'registered-core-start',
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerProcessIdentity({
      processId: 102,
      processStartedAt: 'registered-core-start',
    });

    expect(await operations.listLiveProcessIds([100])).toEqual([102]);
  });

  it('registers the exact process generation that owns the capture listener', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.listenerProcessIdentity = {
      processId: 103,
      processStartedAt: 'listener-owner-start',
    };
    commandRunner.processTables = [[{
      processId: 103,
      parentProcessId: 4,
      creationDate: 'listener-owner-start',
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerProcessIdentity({
      processId: 103,
      processStartedAt: 'listener-owner-start',
    });

    await operations.registerCaptureListenerProcess();

    expect(await operations.listLiveProcessIds([100])).toEqual([103]);
    await operations.terminateProcessGeneration({
      processId: 103,
      processStartedAt: 'listener-owner-start',
    });
    expectTerminationScripts(commandRunner, [{
      processId: 103,
      processStartedAt: 'listener-owner-start',
    }]);
  });

  it('rejects a capture listener process that was never owned by this workflow', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.listenerProcessIdentity = {
      processId: 999,
      processStartedAt: 'external-listener-start',
    };
    const operations = createOperations(fileStore, commandRunner);

    await expect(operations.registerCaptureListenerProcess()).rejects.toThrow(
      'Capture listener is not owned by this workflow.',
    );

    expect(await operations.listLiveProcessIds([100])).toEqual([]);
  });

  it('checks the user-level crash journal independently of Electron profiles', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const operations = createOperations(fileStore, commandRunner);
    const sharedPath = path.join(
      String.raw`C:\Users\developer\AppData\Local`,
      'Interceptor',
      'system-proxy',
      'journal.json',
    );
    fileStore.files.set(sharedPath, '{}');

    expect(await operations.hasCrashJournal()).toBe(true);
    expect(fileStore.readPaths).toContain(sharedPath);
  });

  it('restores a shared minimal journal when current still equals owned', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const operations = createOperations(fileStore, commandRunner);
    const sharedPath = path.join(
      String.raw`C:\Users\developer\AppData\Local`,
      'Interceptor',
      'system-proxy',
      'journal.json',
    );
    fileStore.files.set(sharedPath, JSON.stringify({
      version: 1,
      original: ORIGINAL_SETTINGS,
      owned: OWNED_SETTINGS,
    }));
    commandRunner.settings = { ...OWNED_SETTINGS };

    await operations.restoreCrashJournal(ORIGINAL_SETTINGS);

    expect(commandRunner.settings).toEqual(ORIGINAL_SETTINGS);
    expect(fileStore.removedPaths).toEqual([sharedPath]);
  });

  it('does not overwrite an external current value from a shared minimal journal', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const operations = createOperations(fileStore, commandRunner);
    const sharedPath = path.join(
      String.raw`C:\Users\developer\AppData\Local`,
      'Interceptor',
      'system-proxy',
      'journal.json',
    );
    fileStore.files.set(sharedPath, JSON.stringify({
      version: 1,
      original: ORIGINAL_SETTINGS,
      owned: OWNED_SETTINGS,
    }));
    commandRunner.settings = {
      ...OWNED_SETTINGS,
      proxyServer: '127.0.0.1:9999',
    };

    await expect(operations.restoreCrashJournal(ORIGINAL_SETTINGS)).rejects.toThrow(
      'Current WinINet settings do not match the tracked crash journal.',
    );

    expect(commandRunner.calls.filter((call) => call.args[0] === 'set')).toEqual([]);
    expect(fileStore.removedPaths).toEqual([]);
  });

  it('rejects a shared journal with fields outside the minimal schema', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const operations = createOperations(fileStore, commandRunner);
    const sharedPath = path.join(
      String.raw`C:\Users\developer\AppData\Local`,
      'Interceptor',
      'system-proxy',
      'journal.json',
    );
    fileStore.files.set(sharedPath, JSON.stringify({
      version: 1,
      original: ORIGINAL_SETTINGS,
      owned: OWNED_SETTINGS,
      owner: { processId: 999 },
    }));

    await expect(operations.restoreCrashJournal(ORIGINAL_SETTINGS)).rejects.toThrow(
      'System proxy crash journal is invalid',
    );

    expect(commandRunner.calls.filter((call) => call.args[0] === 'set')).toEqual([]);
    expect(fileStore.removedPaths).toEqual([]);
  });

  it('excludes a reused root PID from dialog and process cleanup', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [
      [{ processId: 100, parentProcessId: 50, creationDate: 'owner-start' }],
      [{ processId: 100, parentProcessId: 50, creationDate: 'reused-start' }],
      [{ processId: 100, parentProcessId: 50, creationDate: 'reused-start' }],
    ];
    const dismissedProcessIds: number[][] = [];
    const operations = new WindowsWorkflowHostSafetyOperations({
      desktopDirectory: String.raw`C:\desktop`,
      localAppDataDirectory: String.raw`C:\Users\developer\AppData\Local`,
      fileStore,
      commandRunner,
      dismissDialogs: async (processes) => {
        dismissedProcessIds.push(processes.map((processEntry) => processEntry.processId));
      },
      capturePortProbe: async () => true,
    });
    expect(await operations.listLiveProcessIds([100])).toEqual([100]);

    await operations.dismissOwnedDialogs([100]);
    await operations.terminateProcessTrees([100]);

    expect(dismissedProcessIds).toEqual([[]]);
    expect(commandRunner.calls.filter((call) => call.command === 'taskkill.exe')).toEqual([]);
    expectTerminationScripts(commandRunner, [
      { processId: 100, processStartedAt: 'owner-start' },
    ]);
  });

  it('terminates only process objects whose start tokens still match', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[
      { processId: 100, parentProcessId: 50, creationDate: 'root-start' },
      { processId: 101, parentProcessId: 100, creationDate: 'child-start' },
    ], [
      {
        processId: 101,
        parentProcessId: 4,
        creationDate: 'child-start',
      },
      {
        processId: 102,
        parentProcessId: 4,
        creationDate: 'late-core-start',
        commandLine: String.raw`utility.exe --data-dir=C:\profiles\owner-a\storage`,
      },
    ]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerUserDataDirectory(String.raw`C:\profiles\owner-a`);

    await operations.terminateProcessTrees([100]);

    expect(commandRunner.calls.filter((call) => call.command === 'taskkill.exe')).toEqual([]);
    expectTerminationScripts(commandRunner, [
      { processId: 100, processStartedAt: 'root-start' },
      { processId: 101, processStartedAt: 'child-start' },
      { processId: 102, processStartedAt: 'late-core-start' },
    ]);
  });

  it('asks the native helper to terminate an explicitly registered root omitted by CIM', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[], []];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerProcessIdentity({
      processId: 100,
      processStartedAt: 'registered-root-start',
    });

    await operations.terminateProcessTrees([100]);

    expectTerminationScripts(commandRunner, [
      { processId: 100, processStartedAt: 'registered-root-start' },
    ]);
  });

  it('terminates one explicitly registered Core generation without its Main tree', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const profileDirectory = String.raw`C:\profiles\owner-a`;
    commandRunner.processTables = [[{
      processId: 102,
      parentProcessId: 100,
      creationDate: 'registered-core-start',
      commandLine: String.raw`utility.exe --data-dir=C:\profiles\owner-a\storage`,
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerUserDataDirectory(profileDirectory);
    const coreProcessIdentity = {
      processId: 102,
      processStartedAt: 'registered-core-start',
    };
    operations.registerProcessIdentity(coreProcessIdentity);
    await expect(operations.listLiveProcessIds([100])).resolves.toEqual([102]);

    await operations.terminateProcessGeneration(coreProcessIdentity);

    expectTerminationScripts(commandRunner, [coreProcessIdentity]);
    expect(commandRunner.calls.at(-1)?.args.at(-1)).toContain(
      "throw 'Workflow process exited before required termination.'",
    );
  });

  it('terminates a Core with no command line after proving registered Main ancestry', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[
      {
        processId: 100,
        parentProcessId: 50,
        creationDate: 'main-start',
        commandLine: '',
      },
      {
        processId: 102,
        parentProcessId: 100,
        creationDate: 'core-start',
        commandLine: '',
      },
    ]];
    const operations = createOperations(fileStore, commandRunner);
    const coreProcessIdentity = {
      processId: 102,
      processStartedAt: 'core-start',
    };
    operations.registerProcessIdentity(coreProcessIdentity);

    await expect(operations.listLiveProcessIds([100])).resolves.toEqual([100, 102]);
    await operations.terminateProcessGeneration(coreProcessIdentity);

    expectTerminationScripts(commandRunner, [coreProcessIdentity]);
  });

  it('refuses to terminate a registered generation outside the workflow profile', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    commandRunner.processTables = [[{
      processId: 999,
      parentProcessId: 4,
      creationDate: 'external-start',
      commandLine: String.raw`external.exe --data-dir=C:\external\storage`,
    }]];
    const operations = createOperations(fileStore, commandRunner);
    operations.registerUserDataDirectory(String.raw`C:\profiles\owner-a`);
    const externalProcessIdentity = {
      processId: 999,
      processStartedAt: 'external-start',
    };
    operations.registerProcessIdentity(externalProcessIdentity);
    await expect(operations.listLiveProcessIds([100])).resolves.toEqual([999]);

    await expect(operations.terminateProcessGeneration(externalProcessIdentity))
      .rejects.toThrow('does not belong to this workflow process tree');

    expectTerminationScripts(commandRunner, []);
  });

  it('reads WinINet through an explicitly supplied packaged helper path', async () => {
    const fileStore = new FakeWorkflowHostFileStore();
    const commandRunner = new FakeWorkflowHostCommandRunner();
    const helperPath = String.raw`C:\package\resources\system-proxy\wininet-proxy-helper.exe`;
    const operations = new WindowsWorkflowHostSafetyOperations({
      desktopDirectory: String.raw`C:\desktop`,
      helperPath,
      localAppDataDirectory: String.raw`C:\Users\developer\AppData\Local`,
      fileStore,
      commandRunner,
      dismissDialogs: async () => undefined,
      capturePortProbe: async () => true,
    });

    await operations.readWinInetSettings();

    expect(commandRunner.calls[0]?.command).toBe(helperPath);
  });
});

function createOperations(
  fileStore: WorkflowHostFileStore,
  commandRunner: WorkflowHostCommandRunner,
): WindowsWorkflowHostSafetyOperations {
  return new WindowsWorkflowHostSafetyOperations({
    desktopDirectory: String.raw`C:\desktop`,
    localAppDataDirectory: String.raw`C:\Users\developer\AppData\Local`,
    fileStore,
    commandRunner,
    dismissDialogs: async () => undefined,
    capturePortProbe: async () => true,
  });
}

function decode(value: string | undefined): string | null {
  if (value === undefined || value === '-') {
    return null;
  }
  return Buffer.from(value, 'base64').toString('utf8');
}

/** Assert each termination script carries one exact PID and start token. */
function expectTerminationScripts(
  commandRunner: FakeWorkflowHostCommandRunner,
  processIdentities: readonly { processId: number; processStartedAt: string }[],
): void {
  const scripts = commandRunner.calls
    .filter((call) =>
      call.command === 'powershell.exe'
      && call.args.at(-1)?.includes('$process.Kill()'))
    .map((call) => call.args.at(-1) ?? '');
  expect(scripts).toHaveLength(processIdentities.length);
  processIdentities.forEach((processIdentity, index) => {
    expect(scripts[index]).toContain(
      Buffer.from(JSON.stringify(processIdentity), 'utf8').toString('base64'),
    );
  });
}