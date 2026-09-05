import { describe, expect, it } from 'vitest';

import { shouldPreserveWorkflowProfile, type WorkflowProfileOutcome } from '../../workflow-profile-retention';

const successfulOutcome: WorkflowProfileOutcome = {
  testStatus: 'passed',
  preserveOnFailure: true,
  workflowError: undefined,
  cleanupError: undefined,
  hostSafetyError: undefined,
};

describe('Workflow profile retention', () => {
  it.each(['failed', 'timedOut', 'interrupted'] as const)(
    'retains a privileged profile after Playwright reports %s without throwing from fixture use',
    (testStatus) => {
      expect(shouldPreserveWorkflowProfile({ ...successfulOutcome, testStatus })).toBe(true);
    },
  );

  it.each(['passed', 'skipped'] as const)('removes a clean %s profile', (testStatus) => {
    expect(shouldPreserveWorkflowProfile({ ...successfulOutcome, testStatus })).toBe(false);
  });

  it.each(['cleanupError', 'hostSafetyError'] as const)('retains every profile after %s', (field) => {
    expect(shouldPreserveWorkflowProfile({
      ...successfulOutcome, preserveOnFailure: false, [field]: new Error('cleanup incomplete'),
    })).toBe(true);
  });

  it('retains a privileged profile after a fixture operation throws', () => {
    expect(shouldPreserveWorkflowProfile({
      ...successfulOutcome, workflowError: new Error('startup incomplete'),
    })).toBe(true);
  });

  it('removes an ordinary failed profile after successful host recovery', () => {
    expect(shouldPreserveWorkflowProfile({
      ...successfulOutcome, testStatus: 'failed', preserveOnFailure: false,
    })).toBe(false);
  });
});