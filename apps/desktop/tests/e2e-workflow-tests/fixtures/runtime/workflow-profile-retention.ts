import type { TestInfo } from '@playwright/test';

export interface WorkflowProfileOutcome {
  readonly testStatus: TestInfo['status'];
  readonly preserveOnFailure: boolean;
  readonly workflowError: unknown;
  readonly cleanupError: unknown;
  readonly hostSafetyError: unknown;
}

export function shouldPreserveWorkflowProfile(outcome: WorkflowProfileOutcome): boolean {
  const testFailed = outcome.testStatus === 'failed'
    || outcome.testStatus === 'timedOut'
    || outcome.testStatus === 'interrupted';
  return outcome.cleanupError !== undefined
    || outcome.hostSafetyError !== undefined
    || ((outcome.workflowError !== undefined || testFailed) && outcome.preserveOnFailure);
}