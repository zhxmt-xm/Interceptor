import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationActionGate,
  completeApplicationShutdown,
  completeApplicationStartupFailure,
  resumeApplicationAfterShutdownFailure,
} from '../../application-shutdown';

describe('completeApplicationShutdown', () => {
  it('restores system proxy before cleaning up a partially started application', async () => {
    const actions: string[] = [];
    const restoreError = new Error('proxy restore failed');
    const reportStopFailure = vi.fn();

    await completeApplicationStartupFailure({
      restoreSystemProxy: async () => {
        actions.push('restore-proxy');
        throw restoreError;
      },
      tasks: [
        {
          name: 'core-runtime',
          stop: () => {
            actions.push('core-runtime');
          },
        },
      ],
      reportStopFailure,
      complete: () => actions.push('quit'),
    });

    expect(actions).toEqual(['restore-proxy', 'core-runtime', 'quit']);
    expect(reportStopFailure).toHaveBeenCalledWith('system-proxy', restoreError);
  });

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

  it('rejects new actions and waits for every started action before shutdown continues', async () => {
    const applicationActionGate = new ApplicationActionGate();
    let finishAction!: () => void;
    const actionGate = new Promise<void>((resolve) => {
      finishAction = resolve;
    });
    const running = applicationActionGate.run(async () => {
      await actionGate;
      return 'done';
    });

    let drained = false;
    const draining = applicationActionGate.stopAcceptingAndDrain().then(() => {
      drained = true;
    });
    await expect(applicationActionGate.run(async () => 'late'))
      .rejects.toThrow('Application shutdown is in progress.');
    expect(drained).toBe(false);

    finishAction();
    await draining;
    await expect(running).resolves.toBe('done');
    expect(drained).toBe(true);
  });

  it('resumes commands and recreates a missing window before reporting shutdown failure', () => {
    const actions: string[] = [];
    const shutdownError = new Error('proxy restore failed');

    resumeApplicationAfterShutdownFailure({
      resumeCommands: () => actions.push('commands'),
      resumeAgent: () => actions.push('agent'),
      ensureWindow: () => actions.push('window'),
      reportFailure: (error) => actions.push(error === shutdownError ? 'report' : 'wrong-error'),
      error: shutdownError,
    });

    expect(actions).toEqual(['commands', 'agent', 'window', 'report']);
  });
});
