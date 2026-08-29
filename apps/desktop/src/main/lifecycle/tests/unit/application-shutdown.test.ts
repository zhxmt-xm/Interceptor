import { describe, expect, it, vi } from 'vitest';

import { completeApplicationShutdown } from '../../application-shutdown';

describe('completeApplicationShutdown', () => {
  it('attempts every stop and completes quitting when one stop fails', async () => {
    const actions: string[] = [];
    const agentStopError = new Error('agent stop failed');
    const reportStopFailure = vi.fn();

    await completeApplicationShutdown({
      tasks: [
        {
          name: 'agent-runtime',
          stop: async () => {
            actions.push('agent-runtime');
            throw agentStopError;
          },
        },
        {
          name: 'core-runtime',
          stop: async () => {
            actions.push('core-runtime');
          },
        },
      ],
      reportStopFailure,
      complete: () => {
        actions.push('quit');
      },
    });

    expect(actions).toEqual(['agent-runtime', 'core-runtime', 'quit']);
    expect(reportStopFailure).toHaveBeenCalledOnce();
    expect(reportStopFailure).toHaveBeenCalledWith('agent-runtime', agentStopError);
  });
});