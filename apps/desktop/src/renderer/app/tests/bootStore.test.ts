import { beforeEach, describe, expect, it } from 'vitest';

import { bootStepState, useBootStore } from '../bootStore';

describe('boot store', () => {
  beforeEach(() => {
    useBootStore.setState({
      phase: 'core',
      failedStep: null,
      detail: null,
      dismissed: false,
    });
  });

  it('marks earlier steps done and the current one active', () => {
    expect(bootStepState('core', 'core', null)).toBe('active');
    expect(bootStepState('listener', 'core', null)).toBe('pending');

    expect(bootStepState('core', 'proxy', null)).toBe('done');
    expect(bootStepState('listener', 'proxy', null)).toBe('done');
    expect(bootStepState('proxy', 'proxy', null)).toBe('active');
  });

  it('marks every step done once startup is ready', () => {
    for (const step of ['core', 'listener', 'proxy'] as const) {
      expect(bootStepState(step, 'ready', null)).toBe('done');
    }
  });

  it('keeps steps after the failure pending', () => {
    expect(bootStepState('core', 'error', 'listener')).toBe('done');
    expect(bootStepState('listener', 'error', 'listener')).toBe('failed');
    expect(bootStepState('proxy', 'error', 'listener')).toBe('pending');
  });

  it('remembers which step failed', () => {
    useBootStore.getState().advance('listener');
    useBootStore.getState().fail('Port 8888 is already in use');

    expect(useBootStore.getState().phase).toBe('error');
    expect(useBootStore.getState().failedStep).toBe('listener');
    expect(useBootStore.getState().detail).toBe('Port 8888 is already in use');
  });

  it('keeps the first failure when a later step also fails', () => {
    useBootStore.getState().advance('core');
    useBootStore.getState().fail('Core exited');
    useBootStore.getState().fail('Still down');

    expect(useBootStore.getState().failedStep).toBe('core');
    expect(useBootStore.getState().detail).toBe('Still down');
  });

  it('clears the failure on restart', () => {
    useBootStore.getState().advance('proxy');
    useBootStore.getState().fail('System proxy takeover failed');
    useBootStore.getState().restart();

    expect(useBootStore.getState().phase).toBe('core');
    expect(useBootStore.getState().failedStep).toBeNull();
    expect(useBootStore.getState().detail).toBeNull();
  });

  // Later Core restarts use the readiness dialog, so the full-screen cover never returns.
  it('stays dismissed once the app has taken over', () => {
    useBootStore.getState().dismiss();
    useBootStore.getState().advance('listener');
    useBootStore.getState().fail('Core exited');

    expect(useBootStore.getState().dismissed).toBe(true);
    expect(useBootStore.getState().phase).toBe('core');
  });
});
