import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  WinInetProxySettings,
  WorkflowHostSafetyOperations,
  WorkflowProcessIdentity,
} from './workflow-host-safety-guard';

const CAPTURE_PORT = 8888;
const execFileAsync = promisify(execFile);

/** Result from one fixed executable invocation owned by the workflow runner. */
export interface WorkflowHostCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

/** Injectable command boundary for production helper and bounded PowerShell host operations. */
export interface WorkflowHostCommandRunner {
  run(command: string, args: readonly string[]): Promise<WorkflowHostCommandResult>;
}

/** Minimal optional-file boundary used for the crash journal. */
export interface WorkflowHostFileStore {
  readOptional(filePath: string): Promise<string | null>;
  remove(filePath: string): Promise<void>;
}

interface WindowsProcessEntry {
  readonly processId: number;
  readonly parentProcessId: number;
  readonly creationDate: string;
  readonly commandLine: string;
}

/** Minimal production crash journal parsed by the workflow safety boundary. */
interface CrashJournalRecord {
  readonly original: WinInetProxySettings;
  readonly owned: WinInetProxySettings;
}

interface WindowsWorkflowHostSafetyOperationsOptions {
  readonly desktopDirectory: string;
  readonly helperPath?: string;
  readonly localAppDataDirectory: string;
  readonly commandRunner?: WorkflowHostCommandRunner;
  readonly fileStore?: WorkflowHostFileStore;
  readonly dismissDialogs: (
    processes: readonly WorkflowProcessIdentity[],
  ) => Promise<void>;
  readonly capturePortProbe?: () => Promise<boolean>;
}

/** Real Windows host operations behind the testable workflow safety guard. */
export class WindowsWorkflowHostSafetyOperations implements WorkflowHostSafetyOperations {
  /** Production WinINet helper built beside the unpackaged desktop bundle. */
  private readonly helperPath: string;
  /** User-level crash journal path shared by production, development and E2E profiles. */
  private readonly sharedJournalPath: string;
  /** External command boundary. */
  private readonly commandRunner: WorkflowHostCommandRunner;
  /** Crash journal file boundary. */
  private readonly fileStore: WorkflowHostFileStore;
  /** Owner-scoped native dialog cleanup. */
  private readonly dismissDialogs: (
    processes: readonly WorkflowProcessIdentity[],
  ) => Promise<void>;
  /** Loopback bind probe. */
  private readonly capturePortProbe: () => Promise<boolean>;
  /** Isolated profiles whose Main/Core process generations belong to this workflow. */
  private readonly userDataDirectories = new Set<string>();
  /** PIDs and creation tokens discovered while their Electron parent is still alive. */
  private readonly knownProcessCreationById = new Map<number, string>();
  /** Process generations proven by a profile argument or registered Main ancestry. */
  private readonly workflowProcessCreationById = new Map<number, string>();
  /** Core generations proven to own the workflow's exclusive capture listener. */
  private readonly captureListenerProcessCreationById = new Map<number, string>();

  constructor(options: WindowsWorkflowHostSafetyOperationsOptions) {
    this.helperPath = options.helperPath ?? path.join(
      options.desktopDirectory,
      'dist',
      'system-proxy',
      'wininet-proxy-helper.exe',
    );
    this.sharedJournalPath = path.join(
      options.localAppDataDirectory,
      'Interceptor',
      'system-proxy',
      'journal.json',
    );
    this.commandRunner = options.commandRunner ?? WindowsWorkflowHostSafetyOperations.commandRunner();
    this.fileStore = options.fileStore ?? WindowsWorkflowHostSafetyOperations.fileStore();
    this.dismissDialogs = options.dismissDialogs;
    this.capturePortProbe = options.capturePortProbe
      ?? (() => WindowsWorkflowHostSafetyOperations.canBindPort(CAPTURE_PORT));
  }

  /** Track one isolated profile only for test-process ownership. */
  registerUserDataDirectory(userDataDirectory: string): void {
    const normalizedDirectory = path.resolve(userDataDirectory);
    this.userDataDirectories.add(normalizedDirectory);
  }

  /** Retain one Main/Core generation even after Windows reparents it. */
  registerProcessIdentity(processIdentity: WorkflowProcessIdentity): void {
    const knownProcessStartedAt = this.knownProcessCreationById.get(processIdentity.processId);
    if (
      knownProcessStartedAt !== undefined
      && knownProcessStartedAt !== processIdentity.processStartedAt
    ) {
      throw new Error('Workflow process PID was already registered with another start token.');
    }
    this.knownProcessCreationById.set(
      processIdentity.processId,
      processIdentity.processStartedAt,
    );
  }

  /** Resolve and retain the exact process generation that owns port 8888. */
  async registerCaptureListenerProcess(): Promise<void> {
    const script = String.raw`
$ErrorActionPreference = 'Stop'
$processIds = @(
  Get-NetTCPConnection -LocalPort ${CAPTURE_PORT} -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique
)
if ($processIds.Count -ne 1) {
  throw "Expected one capture listener owner, found $($processIds.Count)."
}
$process = Get-Process -Id ([int]$processIds[0]) -ErrorAction Stop
[pscustomobject]@{
  processId = [int]$process.Id
  processStartedAt = $process.StartTime.ToUniversalTime().ToString(
    'O',
    [Globalization.CultureInfo]::InvariantCulture
  )
} | ConvertTo-Json -Compress
`;
    const result = await this.commandRunner.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Capture listener owner query returned invalid JSON.');
    }
    const processIdentity = WindowsWorkflowHostSafetyOperations.parseProcessIdentity(value);
    if (
      this.knownProcessCreationById.get(processIdentity.processId)
      !== processIdentity.processStartedAt
    ) {
      throw new Error('Capture listener is not owned by this workflow.');
    }
    this.registerProcessIdentity(processIdentity);
    this.captureListenerProcessCreationById.set(
      processIdentity.processId,
      processIdentity.processStartedAt,
    );
  }

  /** Read the complete current WinINet snapshot through the production helper. */
  async readWinInetSettings(): Promise<WinInetProxySettings> {
    const result = await this.commandRunner.run(this.helperPath, ['get']);
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('WinINet helper returned invalid JSON to the workflow guard.');
    }
    return WindowsWorkflowHostSafetyOperations.parseSettings(value);
  }

  /** Report whether the user-level crash journal exists. */
  async hasCrashJournal(): Promise<boolean> {
    return await this.fileStore.readOptional(this.sharedJournalPath) !== null;
  }

  /** Refresh descendants and return every tracked process whose creation token still matches. */
  async listLiveProcessIds(rootProcessIds: readonly number[]): Promise<readonly number[]> {
    return (await this.listLiveProcesses(rootProcessIds))
      .map((processEntry) => processEntry.processId);
  }

  /** Refresh descendants and retain exact process generations rather than reusable PIDs. */
  private async listLiveProcesses(
    rootProcessIds: readonly number[],
  ): Promise<readonly WindowsProcessEntry[]> {
    const processEntries = await this.readProcessTable();
    const processById = new Map(processEntries.map((entry) => [entry.processId, entry]));
    const trackedProcessIds = new Set<number>();
    const workflowProcessIds = new Set<number>();

    for (const processEntry of processEntries) {
      if (this.belongsToRegisteredProfile(processEntry.commandLine)) {
        this.rememberProcess(processEntry);
        trackedProcessIds.add(processEntry.processId);
        workflowProcessIds.add(processEntry.processId);
      }
    }

    for (const rootProcessId of rootProcessIds) {
      const root = processById.get(rootProcessId);
      if (root && !this.knownProcessCreationById.has(rootProcessId)) {
        this.rememberProcess(root);
      }
      if (
        root
        && this.knownProcessCreationById.get(rootProcessId) === root.creationDate
      ) {
        trackedProcessIds.add(rootProcessId);
        workflowProcessIds.add(rootProcessId);
      }
    }
    for (const [processId, creationDate] of this.knownProcessCreationById) {
      const current = processById.get(processId);
      if (current && current.creationDate === creationDate) {
        trackedProcessIds.add(processId);
      }
    }

    let discovered = true;
    while (discovered) {
      discovered = false;
      for (const processEntry of processEntries) {
        if (
          !trackedProcessIds.has(processEntry.processId)
          && trackedProcessIds.has(processEntry.parentProcessId)
        ) {
          this.rememberProcess(processEntry);
          trackedProcessIds.add(processEntry.processId);
          discovered = true;
        }
        if (
          !workflowProcessIds.has(processEntry.processId)
          && workflowProcessIds.has(processEntry.parentProcessId)
        ) {
          workflowProcessIds.add(processEntry.processId);
          discovered = true;
        }
      }
    }
    for (const processId of workflowProcessIds) {
      const processEntry = processById.get(processId);
      if (processEntry) {
        this.workflowProcessCreationById.set(processId, processEntry.creationDate);
      }
    }
    return [...trackedProcessIds]
      .sort((left, right) => left - right)
      .map((processId) => processById.get(processId)!);
  }

  /** Report whether the capture listener can be rebound by the next workflow. */
  canBindCapturePort(): Promise<boolean> {
    return this.capturePortProbe();
  }

  /** Close only native dialogs owned by tracked Electron process trees. */
  async dismissOwnedDialogs(rootProcessIds: readonly number[]): Promise<void> {
    const liveProcesses = await this.listLiveProcesses(rootProcessIds);
    await this.dismissDialogs(liveProcesses.map((processEntry) => ({
      processId: processEntry.processId,
      processStartedAt: processEntry.creationDate,
    })));
  }

  /** Terminate one exact Core generation only after it was registered by the workflow. */
  async terminateProcessGeneration(
    processIdentity: WorkflowProcessIdentity,
  ): Promise<void> {
    const registered = this.registeredProcessIdentity(processIdentity.processId);
    if (registered?.processStartedAt !== processIdentity.processStartedAt) {
      throw new Error('Workflow process generation was not registered for termination.');
    }
    const processStartedAt = this.workflowProcessCreationById.get(
      processIdentity.processId,
    ) ?? this.captureListenerProcessCreationById.get(processIdentity.processId);
    if (processStartedAt !== processIdentity.processStartedAt) {
      throw new Error('Workflow process generation does not belong to this workflow process tree.');
    }
    await this.terminateProcessGenerations([processIdentity], true);
  }

  /** Force tracked roots and remembered descendants to exit without touching unrelated apps. */
  async terminateProcessTrees(rootProcessIds: readonly number[]): Promise<void> {
    const rootProcessIdSet = new Set(rootProcessIds);
    await this.listLiveProcesses(rootProcessIds);
    const attemptedProcessIds = new Set<number>();
    const failures: unknown[] = [];
    const registeredRoots = rootProcessIds
      .filter((processId, index) => rootProcessIds.indexOf(processId) === index)
      .map((processId) => this.registeredProcessIdentity(processId))
      .filter((processIdentity): processIdentity is WorkflowProcessIdentity =>
        processIdentity !== null);
    try {
      await this.terminateProcessGenerations(registeredRoots);
    } catch (error) {
      failures.push(error);
    }
    registeredRoots.forEach((processIdentity) =>
      attemptedProcessIds.add(processIdentity.processId));

    const registeredDescendants = [...this.knownProcessCreationById]
      .filter(([processId]) => !rootProcessIdSet.has(processId))
      .map(([processId, processStartedAt]) => ({ processId, processStartedAt }));
    try {
      await this.terminateProcessGenerations(registeredDescendants);
    } catch (error) {
      failures.push(error);
    }
    registeredDescendants.forEach((processIdentity) =>
      attemptedProcessIds.add(processIdentity.processId));

    try {
      const remainingProcesses = await this.listLiveProcesses(rootProcessIds);
      await this.terminateProcessGenerations(
        remainingProcesses
          .filter((processEntry) => !attemptedProcessIds.has(processEntry.processId))
          .map((processEntry) => ({
            processId: processEntry.processId,
            processStartedAt: processEntry.creationDate,
          })),
      );
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Workflow process cleanup failed.');
    }
  }

  /** Terminate exact process objects after rechecking their immutable start tokens. */
  private async terminateProcessGenerations(
    processIdentities: readonly WorkflowProcessIdentity[],
    requireAlive = false,
  ): Promise<void> {
    const failures: unknown[] = [];
    for (const processIdentity of processIdentities) {
      const encodedIdentity = Buffer.from(
        JSON.stringify(processIdentity),
        'utf8',
      ).toString('base64');
      const script = String.raw`
$identity = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedIdentity}')
) | ConvertFrom-Json
$process = Get-Process -Id ([int]$identity.processId) -ErrorAction SilentlyContinue
if ($null -eq $process -or $process.HasExited) {
  ${requireAlive
    ? "throw 'Workflow process exited before required termination.'"
    : 'exit 0'}
}
$processStartedAt = $process.StartTime.ToUniversalTime().ToString(
  'O',
  [Globalization.CultureInfo]::InvariantCulture
)
if ($processStartedAt -ne [string]$identity.processStartedAt) {
  throw 'Process generation no longer matches the workflow-owned process.'
}
$process.Kill()
if (-not $process.WaitForExit(5000)) {
  throw 'Timed out terminating the workflow-owned process.'
}
`;
      try {
        await this.commandRunner.run('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          script,
        ]);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Workflow process termination failed.');
    }
  }

  /** Return one explicitly or ancestrally registered process generation. */
  private registeredProcessIdentity(processId: number): WorkflowProcessIdentity | null {
    const processStartedAt = this.knownProcessCreationById.get(processId);
    return processStartedAt === undefined
      ? null
      : { processId, processStartedAt };
  }

  /** Restore only a tracked crash journal's exact owned snapshot to the outer baseline. */
  async restoreCrashJournal(baseline: WinInetProxySettings): Promise<void> {
    const record = await this.readCrashJournal();
    if (!record) {
      throw new Error(
        'No workflow system proxy crash journal is available for recovery.',
      );
    }
    const current = await this.readWinInetSettings();
    if (!WindowsWorkflowHostSafetyOperations.equalSettings(record.original, baseline)) {
      throw new Error('Tracked crash journal does not match the workflow baseline.');
    }

    if (WindowsWorkflowHostSafetyOperations.equalSettings(current, baseline)) {
      await this.fileStore.remove(this.sharedJournalPath);
      return;
    }
    if (!WindowsWorkflowHostSafetyOperations.equalSettings(record.owned, current)) {
      throw new Error('Current WinINet settings do not match the tracked crash journal.');
    }

    await this.writeWinInetSettings(baseline);
    const restored = await this.readWinInetSettings();
    if (!WindowsWorkflowHostSafetyOperations.equalSettings(restored, baseline)) {
      throw new Error('WinINet settings did not match the workflow baseline after recovery.');
    }
    await this.fileStore.remove(this.sharedJournalPath);
  }

  /** Read and retain one process-table snapshot without shell interpolation. */
  private async readProcessTable(): Promise<readonly WindowsProcessEntry[]> {
    const script = [
      'Get-CimInstance Win32_Process |',
      'ForEach-Object {',
      '$process = Get-Process -Id ([int]$_.ProcessId) -ErrorAction SilentlyContinue',
      '$processStartedAt = $null',
      'if ($null -ne $process -and -not $process.HasExited) {',
      'try {',
      "$processStartedAt = $process.StartTime.ToUniversalTime().ToString('O', [Globalization.CultureInfo]::InvariantCulture)",
      '} catch {',
      '$processStartedAt = $null',
      '}',
      '}',
      'if ($null -eq $processStartedAt -and $null -ne $_.CreationDate) {',
      "$processStartedAt = $_.CreationDate.ToUniversalTime().ToString('O', [Globalization.CultureInfo]::InvariantCulture)",
      '}',
      'if ($null -ne $processStartedAt) {',
      '[pscustomobject]@{',
      'processId = [int]$_.ProcessId;',
      'parentProcessId = [int]$_.ParentProcessId;',
      'creationDate = $processStartedAt;',
      'commandLine = [string]$_.CommandLine',
      '}',
      '}',
      '} |',
      'ConvertTo-Json -Compress',
    ].join(' ');
    const result = await this.commandRunner.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);
    if (result.stdout.trim() === '') {
      return [];
    }
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Windows process table returned invalid JSON.');
    }
    const entries = Array.isArray(value) ? value : [value];
    return entries.map((entry) => WindowsWorkflowHostSafetyOperations.parseProcessEntry(entry));
  }

  /** Keep one PID tied to its immutable Windows process creation token. */
  private rememberProcess(processEntry: WindowsProcessEntry): void {
    this.knownProcessCreationById.set(
      processEntry.processId,
      processEntry.creationDate,
    );
  }

  /** Read the one current user-level crash journal. */
  private async readCrashJournal(): Promise<CrashJournalRecord | null> {
    const serialized = await this.fileStore.readOptional(this.sharedJournalPath);
    if (serialized === null) {
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new Error(
        `System proxy crash journal is invalid: ${this.sharedJournalPath}`,
      );
    }
    if (typeof value !== 'object' || value === null) {
      throw new Error(
        `System proxy crash journal is invalid: ${this.sharedJournalPath}`,
      );
    }
    const record = value as Record<string, unknown>;
    if (
      record.version !== 1
      || Object.keys(record).sort().join(',') !== 'original,owned,version'
    ) {
      throw new Error(
        `System proxy crash journal is invalid: ${this.sharedJournalPath}`,
      );
    }
    return {
      original: WindowsWorkflowHostSafetyOperations.parseSettings(record.original),
      owned: WindowsWorkflowHostSafetyOperations.parseSettings(record.owned),
    };
  }

  /** Write one complete WinINet snapshot through the production helper. */
  private async writeWinInetSettings(settings: WinInetProxySettings): Promise<void> {
    await this.commandRunner.run(this.helperPath, [
      'set',
      String(settings.flags),
      WindowsWorkflowHostSafetyOperations.encodeNullable(settings.proxyServer),
      WindowsWorkflowHostSafetyOperations.encodeNullable(settings.bypassList),
      WindowsWorkflowHostSafetyOperations.encodeNullable(settings.pacUrl),
    ]);
  }

  /** Parse a complete helper snapshot without accepting partial evidence. */
  private static parseSettings(value: unknown): WinInetProxySettings {
    if (typeof value !== 'object' || value === null) {
      throw new Error('WinINet settings must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      !Number.isInteger(record.flags)
      || typeof record.proxyEnabled !== 'boolean'
      || typeof record.autoDetect !== 'boolean'
    ) {
      throw new Error('WinINet settings flags are invalid.');
    }
    return {
      flags: record.flags as number,
      proxyEnabled: record.proxyEnabled,
      autoDetect: record.autoDetect,
      proxyServer: WindowsWorkflowHostSafetyOperations.parseNullableString(record.proxyServer),
      bypassList: WindowsWorkflowHostSafetyOperations.parseNullableString(record.bypassList),
      pacUrl: WindowsWorkflowHostSafetyOperations.parseNullableString(record.pacUrl),
    };
  }

  /** Parse one bounded Windows process table row. */
  private static parseProcessEntry(value: unknown): WindowsProcessEntry {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Windows process table entry must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.processId) || !Number.isInteger(record.parentProcessId)) {
      throw new Error('Windows process table entry has invalid identifiers.');
    }
    if (typeof record.creationDate !== 'string' || record.creationDate.length === 0) {
      throw new Error('Windows process table entry has an invalid creation token.');
    }
    return {
      processId: record.processId as number,
      parentProcessId: record.parentProcessId as number,
      creationDate: record.creationDate,
      commandLine: record.commandLine === undefined
        ? ''
        : WindowsWorkflowHostSafetyOperations.parseProcessCommandLine(record.commandLine),
    };
  }

  /** Validate one process command line used only for exact workflow-profile ownership. */
  private static parseProcessCommandLine(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Windows process table entry has an invalid command line.');
    }
    return value;
  }

  /** Match only unique userData/storage switches generated for this workflow. */
  private belongsToRegisteredProfile(commandLine: string): boolean {
    for (const userDataDirectory of this.userDataDirectories) {
      const markers = [
        `--user-data-dir=${userDataDirectory}`,
        `--data-dir=${path.join(userDataDirectory, 'storage')}`,
      ];
      if (markers.some((marker) =>
        WindowsWorkflowHostSafetyOperations.hasExactArgument(commandLine, marker))) {
        return true;
      }
    }
    return false;
  }

  /** Match one complete command-line argument without accepting path prefixes. */
  private static hasExactArgument(commandLine: string, argument: string): boolean {
    const separatorIndex = argument.indexOf('=');
    const variants = separatorIndex < 0
      ? [argument, `"${argument}"`]
      : [
          argument,
          `"${argument}"`,
          `${argument.slice(0, separatorIndex + 1)}"${argument.slice(separatorIndex + 1)}"`,
        ];
    const normalizedCommandLine = commandLine.toLowerCase();
    return variants.some((variant) => {
      const escapedVariant = variant
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|\\s)${escapedVariant}(?=\\s|$)`, 'u')
        .test(normalizedCommandLine);
    });
  }

  /** Parse one listener process identity returned by a bounded host query. */
  private static parseProcessIdentity(value: unknown): WorkflowProcessIdentity {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Capture listener owner identity is invalid.');
    }
    const processIdentity = value as Record<string, unknown>;
    if (
      !Number.isInteger(processIdentity.processId)
      || (processIdentity.processId as number) <= 0
      || typeof processIdentity.processStartedAt !== 'string'
      || processIdentity.processStartedAt.length === 0
    ) {
      throw new Error('Capture listener owner identity is invalid.');
    }
    return {
      processId: processIdentity.processId as number,
      processStartedAt: processIdentity.processStartedAt,
    };
  }

  /** Compare all helper fields rather than only the visible proxy server. */
  private static equalSettings(
    left: WinInetProxySettings,
    right: WinInetProxySettings,
  ): boolean {
    return left.flags === right.flags
      && left.proxyEnabled === right.proxyEnabled
      && left.autoDetect === right.autoDetect
      && left.proxyServer === right.proxyServer
      && left.bypassList === right.bypassList
      && left.pacUrl === right.pacUrl;
  }

  /** Parse one nullable helper string. */
  private static parseNullableString(value: unknown): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new Error('WinINet settings contain an invalid string field.');
    }
    return value;
  }

  /** Encode one nullable helper argument without shell interpolation. */
  private static encodeNullable(value: string | null): string {
    return value === null ? '-' : Buffer.from(value, 'utf8').toString('base64');
  }

  /** Create the production execFile command boundary. */
  private static commandRunner(): WorkflowHostCommandRunner {
    return {
      run: async (command, args) => {
        const result = await execFileAsync(command, [...args], {
          encoding: 'utf8',
          windowsHide: true,
        });
        return { stdout: result.stdout, stderr: result.stderr };
      },
    };
  }

  /** Create the production optional-file boundary. */
  private static fileStore(): WorkflowHostFileStore {
    return {
      readOptional: async (filePath) => {
        try {
          return await readFile(filePath, 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      },
      remove: async (filePath) => {
        await rm(filePath, { force: true });
      },
    };
  }

  /** Probe exclusive loopback bind availability without leaving a listener behind. */
  private static async canBindPort(port: number): Promise<boolean> {
    const server = net.createServer();
    server.unref();
    try {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
      return true;
    } catch {
      return false;
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  }
}