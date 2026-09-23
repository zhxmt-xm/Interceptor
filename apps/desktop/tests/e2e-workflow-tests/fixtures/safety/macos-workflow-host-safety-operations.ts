import { execFile } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

import type { MacosSystemProxySnapshot } from '../../../../src/main/platform-capabilities/system-proxy/interfaces';
import { MacosSystemProxyJournal, resolveMacosSystemProxyJournalPath } from '../../../../src/main/platform-capabilities/system-proxy/macos/journal';
import type {
  WorkflowHostSafetyOperations,
  WorkflowProcessIdentity,
} from './workflow-host-safety-guard';

const CAPTURE_PORT = 8888;
const execFileAsync = promisify(execFile);

interface MacosProcessEntry extends WorkflowProcessIdentity {
  readonly parentProcessId: number;
}

/** Protects macOS network services and the exact process generations owned by a workflow. */
export class MacosWorkflowHostSafetyOperations
implements WorkflowHostSafetyOperations<MacosSystemProxySnapshot> {
  /** Production SystemConfiguration helper used for complete snapshot reads and recovery. */
  private readonly helperPath: string;
  /** Native start tokens retained after a tracked process is reparented. */
  private readonly processStartedAtById = new Map<number, string>();
  private certificateTrustBaseline: string | null = null;

  /** Bind recovery to the same helper used by the application under test. */
  constructor(
    desktopDirectory: string,
    helperPath = path.join(desktopDirectory, 'dist/system-proxy/macos-proxy-helper'),
  ) {
    this.helperPath = helperPath;
  }

  /** The user-level journal does not depend on workflow profile registration. */
  registerUserDataDirectory(): void {}

  /** Retain a process generation without accepting a reused process identifier. */
  registerProcessIdentity(processIdentity: WorkflowProcessIdentity): void {
    const knownStart = this.processStartedAtById.get(processIdentity.processId);
    if (knownStart !== undefined && knownStart !== processIdentity.processStartedAt) {
      throw new Error('Workflow process PID was already registered with another start token.');
    }
    this.processStartedAtById.set(processIdentity.processId, processIdentity.processStartedAt);
  }

  /** Read one process identity using the same native start token as tree inspection. */
  static async readProcessIdentity(processId: number): Promise<WorkflowProcessIdentity> {
    const processEntry = (await this.readProcessTable())
      .find((entry) => entry.processId === processId);
    if (!processEntry) {
      throw Object.assign(new Error('Workflow process is no longer running.'), { code: 'ESRCH' });
    }
    return { processId, processStartedAt: processEntry.processStartedAt };
  }

  /** Read native process ancestry without collecting command lines or environment values. */
  private static async readProcessTable(): Promise<MacosProcessEntry[]> {
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,lstart='], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
    });
    return stdout.trim().split('\n').map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
      if (!match) throw new Error('macOS process table returned an invalid process identity.');
      return {
        processId: Number(match[1]),
        parentProcessId: Number(match[2]),
        processStartedAt: match[3]!,
      };
    });
  }

  /** Accept the capture listener only when its process generation is already registered. */
  async registerCaptureListenerProcess(): Promise<void> {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', [
      '-nP', '-a', `-iTCP:${CAPTURE_PORT}`, '-sTCP:LISTEN', '-Fp',
    ], { encoding: 'utf8' });
    const processIds = [...new Set(stdout.split('\n')
      .filter((line) => /^p\d+$/.test(line))
      .map((line) => Number(line.slice(1))))];
    if (processIds.length !== 1) {
      throw new Error(`Expected one capture listener owner, found ${processIds.length}.`);
    }
    const processIdentity = await MacosWorkflowHostSafetyOperations
      .readProcessIdentity(processIds[0]!);
    if (this.processStartedAtById.get(processIdentity.processId) !== processIdentity.processStartedAt) {
      throw new Error('Capture listener is not owned by this workflow.');
    }
  }

  /** Read the exact multi-service snapshot through the production Swift helper. */
  async readSystemProxySettings(): Promise<MacosSystemProxySnapshot> {
    const { stdout } = await execFileAsync(this.helperPath, ['get'], { encoding: 'utf8' });
    return JSON.parse(stdout) as MacosSystemProxySnapshot;
  }

  areSystemProxySettingsEqual(left: MacosSystemProxySnapshot, right: MacosSystemProxySnapshot): boolean {
    return isDeepStrictEqual(left, right);
  }

  async captureCertificateTrustBaseline(): Promise<void> {
    this.certificateTrustBaseline = await this.readMacosAdminTrustSettings();
  }

  async verifyCertificateTrustRestored(): Promise<void> {
    if (this.certificateTrustBaseline === null) throw new Error('macOS certificate trust baseline was not captured.');
    if (await this.readMacosAdminTrustSettings() !== this.certificateTrustBaseline) {
      throw new Error('macOS admin trust settings differ from the workflow baseline.');
    }
  }

  private async readMacosAdminTrustSettings(): Promise<string> {
    const { stdout } = await execFileAsync('/usr/bin/security', [
      '-q', 'trust-settings-export', '-d', '/dev/stdout',
    ], { encoding: 'utf8' });
    return stdout;
  }

  /** Inspect the shared journal before launch and after each workflow. */
  async hasCrashJournal(): Promise<boolean> {
    return await this.journal().read() !== null;
  }

  /** Discover descendants while roots are alive and retain them after reparenting. */
  async listLiveProcessIds(rootProcessIds: readonly number[]): Promise<readonly number[]> {
    const processEntries = await MacosWorkflowHostSafetyOperations.readProcessTable();
    const liveProcessIds = new Set<number>();
    for (const processEntry of processEntries) {
      if (this.processStartedAtById.get(processEntry.processId) === processEntry.processStartedAt) {
        liveProcessIds.add(processEntry.processId);
      }
    }
    for (const rootProcessId of rootProcessIds) {
      if (!this.processStartedAtById.has(rootProcessId)) {
        throw new Error('Workflow process root has no registered start token.');
      }
    }
    let discovered = true;
    while (discovered) {
      discovered = false;
      for (const processEntry of processEntries) {
        if (!liveProcessIds.has(processEntry.processId) && liveProcessIds.has(processEntry.parentProcessId)) {
          this.registerProcessIdentity(processEntry);
          liveProcessIds.add(processEntry.processId);
          discovered = true;
        }
      }
    }
    return [...liveProcessIds];
  }

  /** Check that no remaining process owns the product's fixed capture port. */
  async canBindCapturePort(): Promise<boolean> {
    const server = net.createServer();
    server.unref();
    try {
      server.listen(CAPTURE_PORT, '127.0.0.1');
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

  /** Dismiss only a native sheet belonging to an unchanged workflow Main generation. */
  async dismissOwnedDialogs(rootProcessIds: readonly number[]): Promise<void> {
    const liveProcessIds = await this.listLiveProcessIds(rootProcessIds);
    for (const processId of rootProcessIds.filter((root) => liveProcessIds.includes(root))) {
      await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  set ownedProcesses to application processes whose unix id is ${processId}
  if (count of ownedProcesses) is 1 then
    tell item 1 of ownedProcesses
      if exists sheet 1 of window 1 then
        set frontmost to true
        key code 53
      end if
    end tell
  end if
end tell
`], { encoding: 'utf8' });
    }
  }

  /** Preserve the application's listener when host proxy restoration has not completed. */
  async assertSafeToTerminateApplications(baseline: MacosSystemProxySnapshot): Promise<void> {
    if (!isDeepStrictEqual(await this.readSystemProxySettings(), baseline)) {
      throw new Error('macOS proxy restoration is incomplete. Keep the App and profile, and restore through the App before terminating its listener.');
    }
  }

  /** Terminate one known generation without signalling a process that reused its PID. */
  async terminateProcessGeneration(processIdentity: WorkflowProcessIdentity): Promise<void> {
    if (this.processStartedAtById.get(processIdentity.processId) !== processIdentity.processStartedAt) {
      throw new Error('Cannot terminate an unregistered workflow process generation.');
    }
    try {
      const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(processIdentity.processId);
      if (current.processStartedAt === processIdentity.processStartedAt) {
        process.kill(processIdentity.processId, 'SIGKILL');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  /** Stop only roots and descendants proven to belong to this workflow. */
  async terminateProcessTrees(rootProcessIds: readonly number[]): Promise<void> {
    const liveProcessIds = await this.listLiveProcessIds(rootProcessIds);
    for (const processId of liveProcessIds) {
      await this.terminateProcessGeneration({
        processId,
        processStartedAt: this.processStartedAtById.get(processId)!,
      });
    }
  }

  /** Recover the saved baseline only while current settings still equal a test-owned journal. */
  async restoreCrashJournal(baseline: MacosSystemProxySnapshot): Promise<void> {
    const journal = this.journal();
    const record = await journal.read();
    if (!record) return;
    if (!isDeepStrictEqual(record.original, baseline)) {
      throw new Error('macOS proxy recovery refused settings outside the workflow ownership baseline.');
    }
    const current = await this.readSystemProxySettings();
    if (isDeepStrictEqual(current, baseline)) {
      await journal.clear();
      return;
    }
    if (!isDeepStrictEqual(record.owned, current)) {
      throw new Error('macOS proxy recovery refused settings outside the workflow ownership baseline.');
    }
    throw new Error('macOS proxy is still owned by the failed workflow. Recovery must use the App and the shared journal; the test runner will not request another authorization or stop the listener.');
  }

  /** Use the product journal parser and regular-file checks for recovery evidence. */
  private journal(): MacosSystemProxyJournal {
    return new MacosSystemProxyJournal(resolveMacosSystemProxyJournalPath(os.homedir()));
  }
}