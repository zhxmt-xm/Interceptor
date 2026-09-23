interface ApplicationShutdownTask {
  readonly name: string;
  readonly stop: () => void | Promise<void>;
}

interface ApplicationShutdownOptions {
  readonly tasks: readonly ApplicationShutdownTask[];
  readonly reportStopFailure: (name: string, error: unknown) => void;
  readonly complete: () => void;
}

interface ApplicationStartupFailureOptions extends ApplicationShutdownOptions {
  readonly restoreSystemProxy: () => void | Promise<void>;
}

/** Restore host networking before tearing down a partially started application. */
export function completeApplicationStartupFailure(
  options: ApplicationStartupFailureOptions,
): Promise<void> {
  return completeApplicationShutdown({
    tasks: [
      { name: 'system-proxy', stop: options.restoreSystemProxy },
      ...options.tasks,
    ],
    reportStopFailure: options.reportStopFailure,
    complete: options.complete,
  });
}

/** Stop every application service and finish the irreversible quit phase. */
export async function completeApplicationShutdown(
  options: ApplicationShutdownOptions,
): Promise<void> {
  const failures: Array<{ readonly name: string; readonly error: unknown }> = [];
  for (const task of options.tasks) {
    try {
      await task.stop();
    } catch (error) {
      failures.push({ name: task.name, error });
    }
  }
  try {
    for (const failure of failures) {
      options.reportStopFailure(failure.name, failure.error);
    }
  } finally {
    options.complete();
  }
}

interface ResumeApplicationAfterShutdownFailureOptions {
  readonly resumeCommands: () => void;
  readonly resumeAgent: () => void;
  readonly ensureWindow: () => void;
  readonly reportFailure: (error: unknown) => void;
  readonly error: unknown;
}

/** Reject new Main actions and drain operations that started before shutdown. */
export class ApplicationActionGate {
  private accepting = true;
  private activeActions = 0;
  private drainPromise: Promise<void> | null = null;
  private resolveDrain: (() => void) | null = null;
  /** Execute one accepted action and include it in the current drain boundary. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) {
      throw new Error('Application shutdown is in progress.');
    }
    this.activeActions += 1;
    try {
      return await operation();
    } finally {
      this.activeActions -= 1;
      if (this.activeActions === 0) {
        this.resolveDrain?.();
        this.resolveDrain = null;
        this.drainPromise = null;
      }
    }
  }

  /** Stop accepting new actions and wait for every accepted action to settle. */
  stopAcceptingAndDrain(): Promise<void> {
    this.accepting = false;
    if (this.activeActions === 0) {
      return Promise.resolve();
    }
    if (this.drainPromise === null) {
      this.drainPromise = new Promise<void>((resolve) => {
        this.resolveDrain = resolve;
      });
    }
    return this.drainPromise;
  }

  /** Accept actions again after a reversible shutdown phase fails. */
  resume(): void {
    this.accepting = true;
  }
}

/** Restore a usable application before displaying a reversible shutdown failure. */
export function resumeApplicationAfterShutdownFailure(
  options: ResumeApplicationAfterShutdownFailureOptions,
): void {
  options.resumeCommands();
  options.resumeAgent();
  options.ensureWindow();
  options.reportFailure(options.error);
}