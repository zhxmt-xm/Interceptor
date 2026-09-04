/** Complete current-user WinINet settings protected around every real Electron workflow. */
export interface WinInetProxySettings {
  readonly flags: number;
  readonly proxyEnabled: boolean;
  readonly autoDetect: boolean;
  readonly proxyServer: string | null;
  readonly bypassList: string | null;
  readonly pacUrl: string | null;
}

/** One immutable operating-system process generation owned by a workflow. */
export interface WorkflowProcessIdentity {
  readonly processId: number;
  readonly processStartedAt: string;
}

/** Operating-system actions used by the workflow host safety boundary. */
export interface WorkflowHostSafetyOperations {
  registerUserDataDirectory(userDataDirectory: string): void;
  registerProcessIdentity(processIdentity: WorkflowProcessIdentity): void;
  registerCaptureListenerProcess(): Promise<void>;
  readWinInetSettings(): Promise<WinInetProxySettings>;
  hasCrashJournal(): Promise<boolean>;
  listLiveProcessIds(rootProcessIds: readonly number[]): Promise<readonly number[]>;
  canBindCapturePort(): Promise<boolean>;
  dismissOwnedDialogs(rootProcessIds: readonly number[]): Promise<void>;
  terminateProcessGeneration(processIdentity: WorkflowProcessIdentity): Promise<void>;
  terminateProcessTrees(rootProcessIds: readonly number[]): Promise<void>;
  restoreCrashJournal(baseline: WinInetProxySettings): Promise<void>;
}

/** Protects host WinINet, process, crash-journal and listener state around one workflow. */
export class WorkflowHostSafetyGuard {
  /** Host WinINet snapshot captured before the first Electron process starts. */
  private baseline: WinInetProxySettings | null = null;
  /** Every Electron Main PID launched by this workflow, including later generations. */
  private readonly rootProcessIds = new Set<number>();

  constructor(private readonly operations: WorkflowHostSafetyOperations) {}

  /** Capture the exact host settings before any workflow-owned application starts. */
  async captureBaseline(): Promise<void> {
    if (this.baseline) {
      throw new Error('Workflow host baseline was already captured.');
    }
    const baseline = await this.operations.readWinInetSettings();
    const errors: Error[] = [];
    if (await this.operations.hasCrashJournal()) {
      errors.push(new Error('System proxy crash journal exists before workflow launch.'));
    }
    if (!await this.operations.canBindCapturePort()) {
      errors.push(new Error('Capture port 8888 is in use before workflow launch.'));
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Workflow host is not clean enough to launch Electron.');
    }
    this.baseline = baseline;
  }

  /** Register one Electron generation and its profile as workflow-owned resources. */
  registerApplication(processId: number, userDataDirectory: string): void {
    if (!Number.isInteger(processId) || processId <= 0) {
      throw new Error('Workflow Electron Main PID is invalid.');
    }
    this.rootProcessIds.add(processId);
    this.operations.registerUserDataDirectory(userDataDirectory);
  }

  /** Register a Main/Core process generation from a trusted native identity read. */
  registerProcessIdentity(processIdentity: WorkflowProcessIdentity): void {
    if (
      !Number.isInteger(processIdentity.processId)
      || processIdentity.processId <= 0
      || processIdentity.processStartedAt.length === 0
    ) {
      throw new Error('Workflow process identity is invalid.');
    }
    this.operations.registerProcessIdentity(processIdentity);
  }

  /** Register the exact process generation that currently owns port 8888. */
  registerCaptureListenerProcess(): Promise<void> {
    return this.operations.registerCaptureListenerProcess();
  }

  /** Capture descendants while their original Electron Main parent is still alive. */
  async captureProcessTrees(): Promise<void> {
    await this.operations.listLiveProcessIds(this.registeredProcessIds());
  }

  /** Terminate every registered process generation for an intentional crash boundary. */
  terminateRegisteredApplications(): Promise<void> {
    return this.operations.terminateProcessTrees(this.registeredProcessIds());
  }

  /** Terminate one registered Core generation without stopping its Main root. */
  terminateProcessGeneration(
    processIdentity: WorkflowProcessIdentity,
  ): Promise<void> {
    return this.operations.terminateProcessGeneration(processIdentity);
  }

  /** List exact registered process generations that remain alive. */
  listLiveRegisteredProcessIds(): Promise<readonly number[]> {
    return this.operations.listLiveProcessIds(this.registeredProcessIds());
  }

  /** Assert clean teardown, attempting guarded emergency recovery before returning failure. */
  async verifyRestored(): Promise<void> {
    if (!this.baseline) {
      throw new Error('Workflow host baseline was not captured.');
    }
    const initialErrors = await this.inspectProtectedState();
    if (initialErrors.length === 0) {
      return;
    }

    const recoveryErrors: Error[] = [];
    await this.captureRecoveryError(
      () => this.operations.dismissOwnedDialogs(this.registeredProcessIds()),
      recoveryErrors,
    );
    await this.captureRecoveryError(
      () => this.operations.terminateProcessTrees(this.registeredProcessIds()),
      recoveryErrors,
    );
    await this.captureRecoveryError(
      () => this.operations.restoreCrashJournal(this.baseline!),
      recoveryErrors,
    );
    recoveryErrors.push(...await this.inspectProtectedState());

    const errors = [...initialErrors, ...recoveryErrors];
    throw new AggregateError(errors, 'Workflow changed protected host state.');
  }

  /** Inspect every protected host dimension in deterministic evidence order. */
  private async inspectProtectedState(): Promise<Error[]> {
    const errors: Error[] = [];
    const rootProcessIds = this.registeredProcessIds();

    try {
      const liveProcessIds = await this.operations.listLiveProcessIds(rootProcessIds);
      if (liveProcessIds.length > 0) {
        errors.push(new Error(
          `Tracked Electron processes remain alive: ${liveProcessIds.join(', ')}.`,
        ));
      }
    } catch (error) {
      errors.push(WorkflowHostSafetyGuard.toError(error));
    }

    try {
      if (!await this.operations.canBindCapturePort()) {
        errors.push(new Error('Capture port 8888 remains in use.'));
      }
    } catch (error) {
      errors.push(WorkflowHostSafetyGuard.toError(error));
    }

    try {
      if (await this.operations.hasCrashJournal()) {
        errors.push(new Error('System proxy crash journal remains after workflow teardown.'));
      }
    } catch (error) {
      errors.push(WorkflowHostSafetyGuard.toError(error));
    }

    try {
      const current = await this.operations.readWinInetSettings();
      if (!WorkflowHostSafetyGuard.equalSettings(current, this.baseline!)) {
        errors.push(new Error('WinINet settings differ from the workflow baseline.'));
      }
    } catch (error) {
      errors.push(WorkflowHostSafetyGuard.toError(error));
    }

    return errors;
  }

  /** Run one recovery step without preventing the remaining cleanup steps. */
  private async captureRecoveryError(
    operation: () => Promise<void>,
    errors: Error[],
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      errors.push(WorkflowHostSafetyGuard.toError(error));
    }
  }

  /** Return registered roots in stable launch order. */
  private registeredProcessIds(): readonly number[] {
    return [...this.rootProcessIds];
  }

  /** Compare every WinINet field preserved by the native helper. */
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

  /** Normalize unknown cleanup failures without discarding their original message. */
  private static toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}