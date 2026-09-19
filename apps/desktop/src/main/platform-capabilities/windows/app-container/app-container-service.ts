import { execFile } from 'node:child_process';

import type { CommandResult, CommandRunner, ElevatedRunner, SudoExec } from '../../interfaces';
import { AppContainerError } from '../../internal/errors';
import type {
  AppContainerInfo,
  AppContainerServiceOptions,
  AppContainerSnapshot,
} from '../../interfaces';

interface RawAppContainer {
  readonly appContainerSid: string;
  readonly userSid: string | null;
  readonly packageFamilyName: string | null;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly packageFullName: string | null;
  readonly workingDirectory: string | null;
  readonly binaries: readonly string[];
  readonly capabilities: readonly string[];
}

/** Owner of Windows AppContainer enumeration and explicit loopback exemption changes. */
export class AppContainerService {
  /** Production helper runner; stdout is bounded above the observed Windows inventory size. */
  private static readonly EXEC_FILE_RUNNER: CommandRunner = {
    run(command, args) {
      return new Promise((resolve) => {
        execFile(
          command,
          args,
          { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true },
          (error, stdout, stderr) => {
            const rawCode = (error as { code?: number | string } | null)?.code;
            const code = typeof rawCode === 'number' ? rawCode : error ? 1 : 0;
            resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
          },
        );
      });
    },
  };
  /** Lazily loaded sudo-prompt API so read-only enumeration has no elevation dependency. */
  private static sudoExecPromise: Promise<SudoExec> | null = null;
  /** Production mutation runner; Windows displays its native administrator prompt. */
  private static readonly SUDO_PROMPT_RUNNER: ElevatedRunner = {
    async run(command) {
      const sudoExec = await AppContainerService.loadSudoExec();
      return new Promise((resolve) => {
        sudoExec(command, { name: 'Interceptor' }, (error, stdout, stderr) => {
          resolve({
            code: error ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? error?.message ?? ''),
          });
        });
      });
    },
  };

  /** Runtime platform used to expose Windows-only availability explicitly. */
  private readonly platform: NodeJS.Platform;
  /** Native helper executable resolved by DesktopApplication. */
  private readonly helperPath: string;
  /** Injectable process boundary used by unit tests. */
  private readonly commandRunner: CommandRunner;
  /** Injectable elevated process boundary used only for explicit mutations. */
  private readonly elevatedRunner: ElevatedRunner;

  constructor(options: AppContainerServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperPath = options.helperPath;
    this.commandRunner = options.commandRunner ?? AppContainerService.EXEC_FILE_RUNNER;
    this.elevatedRunner = options.elevatedRunner ?? AppContainerService.SUDO_PROMPT_RUNNER;
  }

  /** Whether Network Isolation AppContainer management is available. */
  supported(): boolean {
    return this.platform === 'win32';
  }

  /** Enumerate current containers and derive each exemption from the complete SID set. */
  async list(): Promise<AppContainerSnapshot> {
    if (!this.supported()) {
      return { supported: false, containers: [], exemptSids: [] };
    }

    return AppContainerService.parseResult(
      await this.commandRunner.run(this.helperPath, ['list']),
    );
  }

  /** Add or remove one SID through the elevated helper's verified read-modify-write path. */
  async setLoopbackExemption(
    appContainerSid: string,
    enabled: boolean,
  ): Promise<AppContainerSnapshot> {
    if (!this.supported()) {
      throw new AppContainerError(
        `AppContainer access is not supported on ${this.platform}.`,
      );
    }
    const sid = AppContainerService.sid(appContainerSid, 'appContainerSid');
    if (!/^S-1-15-2-/i.test(sid)) {
      throw new AppContainerError('Target SID is not an AppContainer SID.');
    }
    if (this.helperPath.includes('"')) {
      throw new AppContainerError('AppContainer helper path is invalid.');
    }
    const state = enabled ? 'enabled' : 'disabled';
    return AppContainerService.parseResult(
      await this.elevatedRunner.run(
        `"${this.helperPath}" set ${sid} ${state}`,
      ),
    );
  }

  /** Enable every AppContainer through one elevated verified helper mutation. */
  async enableAllLoopbackExemptions(): Promise<AppContainerSnapshot> {
    if (!this.supported()) {
      throw new AppContainerError(
        `AppContainer access is not supported on ${this.platform}.`,
      );
    }
    if (this.helperPath.includes('"')) {
      throw new AppContainerError('AppContainer helper path is invalid.');
    }
    return AppContainerService.parseResult(
      await this.elevatedRunner.run(`"${this.helperPath}" enable-all`),
    );
  }

  /** Disable every current AppContainer through one elevated verified helper mutation. */
  async disableAllLoopbackExemptions(): Promise<AppContainerSnapshot> {
    if (!this.supported()) {
      throw new AppContainerError(
        `AppContainer access is not supported on ${this.platform}.`,
      );
    }
    if (this.helperPath.includes('"')) {
      throw new AppContainerError('AppContainer helper path is invalid.');
    }
    return AppContainerService.parseResult(
      await this.elevatedRunner.run(`"${this.helperPath}" disable-all`),
    );
  }

  /** Validate and parse one helper command result. */
  private static parseResult(result: CommandResult): AppContainerSnapshot {
    AppContainerService.assertSuccess(result);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new AppContainerError('AppContainer helper returned invalid JSON.');
    }
    return AppContainerService.parseSnapshot(parsed);
  }

  /** Load sudo-prompt only when a user-approved mutation needs elevation. */
  private static loadSudoExec(): Promise<SudoExec> {
    AppContainerService.sudoExecPromise ??= import('@vscode/sudo-prompt').then(
      (module) => module.exec,
    );
    return AppContainerService.sudoExecPromise;
  }

  /** Convert one successful helper payload into the trusted Main-process snapshot. */
  private static parseSnapshot(value: unknown): AppContainerSnapshot {
    if (!AppContainerService.isRecord(value)) {
      throw new AppContainerError('AppContainer helper result must be an object.');
    }
    if (!Array.isArray(value.containers) || !Array.isArray(value.exemptSids)) {
      throw new AppContainerError('AppContainer helper result has invalid collections.');
    }

    const exemptSids = AppContainerService.sidArray(value.exemptSids, 'exemptSids');
    const exemptSidSet = new Set(exemptSids);
    const containerSids = new Set<string>();
    const containers = value.containers.map((container, index) => {
      const rawAppContainer = AppContainerService.parseContainer(container, index);
      if (containerSids.has(rawAppContainer.appContainerSid)) {
        throw new AppContainerError('AppContainer helper returned a duplicate SID.');
      }
      containerSids.add(rawAppContainer.appContainerSid);
      return {
        ...rawAppContainer,
        exempt: exemptSidSet.has(rawAppContainer.appContainerSid),
      } satisfies AppContainerInfo;
    });

    return { supported: true, containers, exemptSids };
  }

  /** Validate one raw container while preserving Windows-provided text. */
  private static parseContainer(value: unknown, index: number): RawAppContainer {
    if (!AppContainerService.isRecord(value)) {
      throw new AppContainerError(`AppContainer helper container ${index} is invalid.`);
    }
    return {
      appContainerSid: AppContainerService.sid(value.appContainerSid, 'appContainerSid'),
      userSid: AppContainerService.nullableSid(value.userSid, 'userSid'),
      packageFamilyName: AppContainerService.nullableString(
        value.packageFamilyName,
        'packageFamilyName',
      ),
      displayName: AppContainerService.nullableString(value.displayName, 'displayName'),
      description: AppContainerService.nullableString(value.description, 'description'),
      packageFullName: AppContainerService.nullableString(
        value.packageFullName,
        'packageFullName',
      ),
      workingDirectory: AppContainerService.nullableString(
        value.workingDirectory,
        'workingDirectory',
      ),
      binaries: AppContainerService.stringArray(value.binaries, 'binaries'),
      capabilities: AppContainerService.sidArray(value.capabilities, 'capabilities'),
    };
  }

  /** Reject helper process failures without leaking unbounded output. */
  private static assertSuccess(result: CommandResult): void {
    if (result.code === 0) {
      return;
    }
    const detail = (result.stderr || result.stdout || 'unknown error').slice(0, 500);
    throw new AppContainerError(
      `AppContainer helper failed (exit ${result.code}): ${detail}`,
    );
  }

  /** Validate a Windows SID string. */
  private static sid(value: unknown, name: string): string {
    if (typeof value !== 'string' || !/^S-\d(?:-\d+)+$/i.test(value)) {
      throw new AppContainerError(`AppContainer helper result ${name} is invalid.`);
    }
    return value;
  }

  /** Validate a nullable Windows SID string. */
  private static nullableSid(value: unknown, name: string): string | null {
    return value === null ? null : AppContainerService.sid(value, name);
  }

  /** Validate a nullable helper string without rewriting system text. */
  private static nullableString(value: unknown, name: string): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new AppContainerError(`AppContainer helper result ${name} is invalid.`);
    }
    return value;
  }

  /** Validate a string array from the process boundary. */
  private static stringArray(value: unknown, name: string): readonly string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new AppContainerError(`AppContainer helper result ${name} is invalid.`);
    }
    return value;
  }

  /** Validate a SID array from the process boundary. */
  private static sidArray(value: unknown, name: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new AppContainerError(`AppContainer helper result ${name} is invalid.`);
    }
    return value.map((item) => AppContainerService.sid(item, name));
  }

  /** Narrow unknown JSON values to plain object records. */
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}