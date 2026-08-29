interface ApplicationShutdownTask {
  readonly name: string;
  readonly stop: () => void | Promise<void>;
}

interface ApplicationShutdownOptions {
  readonly tasks: readonly ApplicationShutdownTask[];
  readonly reportStopFailure: (name: string, error: unknown) => void;
  readonly complete: () => void;
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