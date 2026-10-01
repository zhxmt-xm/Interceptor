import { PlatformOperationInProgressError, type PlatformOperation } from '@interceptor/tools';
import type { CommandResult, CommandRunner, ElevatedRunner } from '../interfaces';
import { commandRunner } from '../internal/command-runners';
import { AppContainerError } from './internal/errors';
import type { AppContainerInfo, AppContainerServiceOptions, AppContainerSnapshot } from './interfaces';
import type { HelperService } from '../helper/entry';

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
  /** Runtime platform used to expose Windows-only availability explicitly. */
  private readonly platform: NodeJS.Platform;
  /** Native helper executable resolved by DesktopApplication. */
  private readonly helperPath: string;
  /** Injectable process boundary used by unit tests. */
  private readonly commandRunner: CommandRunner;
  /** Injectable elevated process boundary used only for explicit mutations. */
  private readonly elevatedRunner: ElevatedRunner;
  private activeOperation: Extract<PlatformOperation, `app-container.${string}`> | null = null;
  private readonly onChanged: (() => void) | undefined;
  private readonly helperService: HelperService;

  constructor(options: AppContainerServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperPath = options.helperPath;
    this.commandRunner = options.commandRunner ?? commandRunner;
    this.elevatedRunner = options.elevatedRunner ?? commandRunner;
    this.onChanged = options.onChanged;
    this.helperService = options.helperService;
  }

  getActiveOperation(): { operation: PlatformOperation; state: 'running' } | null {
    return this.activeOperation ? { operation: this.activeOperation, state: 'running' } : null;
  }

  private async runOperation(
    operation: Extract<PlatformOperation, `app-container.${string}`>,
    command: string,
  ): Promise<AppContainerSnapshot> {
    if (this.activeOperation) throw new PlatformOperationInProgressError(this.activeOperation);
    this.helperService.assertNotPreparing();
    this.activeOperation = operation;
    try {
      const snapshot = await this.helperService.runAuthorization(operation, async () =>
        AppContainerService.parseResult(await this.elevatedRunner.runElevated(command)));
      this.onChanged?.();
      return snapshot;
    } finally {
      this.activeOperation = null;
    }
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
      await this.commandRunner.run(this.helperPath, ['list'], undefined, { maxBuffer: 8 * 1024 * 1024 }),
    );
  }

  /** Enable one SID through the elevated helper's verified read-modify-write path. */
  async enableLoopbackExemption(appContainerSid: string): Promise<AppContainerSnapshot> {
    const sid = this.validateExemptionTarget(appContainerSid);
    return this.runOperation('app-container.enable', `"${this.helperPath}" set ${sid} enabled`);
  }

  /** Disable one SID while preserving every other exemption. */
  async disableLoopbackExemption(appContainerSid: string): Promise<AppContainerSnapshot> {
    const sid = this.validateExemptionTarget(appContainerSid);
    return this.runOperation('app-container.disable', `"${this.helperPath}" set ${sid} disabled`);
  }

  private validateExemptionTarget(appContainerSid: string): string {
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
    return sid;
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
    return this.runOperation('app-container.enable-all', `"${this.helperPath}" enable-all`);
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
    return this.runOperation('app-container.disable-all', `"${this.helperPath}" disable-all`);
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