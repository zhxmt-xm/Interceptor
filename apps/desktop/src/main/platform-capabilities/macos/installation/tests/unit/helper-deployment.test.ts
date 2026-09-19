import { describe, expect, it, vi } from 'vitest';

import type { CommandResult, CommandRunner } from '../../../../interfaces';
import { MacosHelperDeploymentService } from '../../helper-deployment';

vi.mock('node:fs/promises', () => ({
  chmod: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/private/tmp/interceptor-helper-authorization-test'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

const applicationPath = "/Applications/Interceptor's App.app";
const helperPath = `${applicationPath}/Contents/Resources/system-proxy/macos-proxy-helper`;
const identity = {
  bundleIdentifier: 'com.zhxmt.interceptor',
  bundleVersion: '0.1.0',
  clientRequirement: `cdhash H"${'ab'.repeat(20)}"`,
  helperRequirement: `cdhash H"${'cd'.repeat(20)}"`,
};

function result(value: unknown): CommandResult {
  return { code: 0, stdout: JSON.stringify(value), stderr: '' };
}

function createDeployment(states: string[]) {
  const elevate = vi.fn<CommandRunner['run']>().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  const run = vi.fn<CommandRunner['run']>().mockImplementation(async (_command, args) => {
    if (args[0] === 'inspect-application') return result(identity);
    if (args[0] === 'deployment-status') return result({ state: states.shift() });
    if (args[0] === 'request-installation') return elevate(_command, args);
    throw new Error('Unexpected native command.');
  });
  const macosHelperDeploymentService = new MacosHelperDeploymentService({
    environment: 'production', applicationPath, helperPath, userId: 501,
    runner: { run },
  });
  return { macosHelperDeploymentService, run, elevate };
}

function createDevelopmentDeployment(states: string[]) {
  const developmentHelperPath = '/workspace/Interceptor/apps/desktop/dist/system-proxy/macos-proxy-helper';
  const run = vi.fn<CommandRunner['run']>().mockImplementation(async (_command, args) => {
    if (args[0] === 'development-deployment-status') return result({ state: states.shift() });
    if (args[0] === 'inspect-helper') return result({ helperRequirement: identity.helperRequirement });
    if (args[0] === 'request-development-installation') return result({});
    throw new Error('Unexpected native command.');
  });
  const macosHelperDeploymentService = new MacosHelperDeploymentService({
    environment: 'development', helperPath: developmentHelperPath, userId: 501, runner: { run },
  });
  return { macosHelperDeploymentService, run, developmentHelperPath };
}

describe('macOS first-launch helper deployment', () => {
  it('reuses the development helper without binding an application build or requesting authorization', async () => {
    const { macosHelperDeploymentService, run, developmentHelperPath } = createDevelopmentDeployment(['ready', 'ready']);
    await macosHelperDeploymentService.ensureInstalled();
    await macosHelperDeploymentService.ensureInstalled();
    expect(run.mock.calls).toEqual([
      [developmentHelperPath, ['development-deployment-status', '501']],
      [developmentHelperPath, ['development-deployment-status', '501']],
    ]);
  });

  it('authorizes the development helper once without inspecting or approving the Electron application', async () => {
    const { macosHelperDeploymentService, run, developmentHelperPath } = createDevelopmentDeployment(['missing', 'ready', 'ready']);
    await macosHelperDeploymentService.ensureInstalled();
    await macosHelperDeploymentService.ensureInstalled();
    expect(run).toHaveBeenCalledWith('/private/tmp/interceptor-helper-authorization-test/macos-proxy-helper', [
      'request-development-installation', '501', identity.helperRequirement,
    ]);
    expect(run.mock.calls.filter(([, args]) => args[0] === 'request-development-installation')).toHaveLength(1);
    expect(run.mock.calls.some(([, args]) => args[0] === 'inspect-application')).toBe(false);
  });

  it('still rejects an external helper path for the production application', () => {
    expect(() => new MacosHelperDeploymentService({
      environment: 'production', applicationPath, helperPath: '/workspace/dist/macos-proxy-helper', userId: 501,
    })).toThrow(expect.objectContaining({ code: 'invalid-request' }));
  });

  it('reuses a ready matching component without requesting authorization', async () => {
    const { macosHelperDeploymentService, elevate } = createDeployment(['ready']);
    await macosHelperDeploymentService.ensureInstalled();
    expect(elevate).not.toHaveBeenCalled();
  });

  it.each(['missing', 'outdated'])('deploys only the bundled helper once when %s and verifies readiness', async (state) => {
    const { macosHelperDeploymentService, run, elevate } = createDeployment([state, 'ready', 'ready']);
    await macosHelperDeploymentService.ensureInstalled();
    await macosHelperDeploymentService.ensureInstalled();
    expect(elevate).toHaveBeenCalledTimes(1);
    expect(elevate).toHaveBeenCalledWith(helperPath, [
      'request-installation', applicationPath, '501', identity.clientRequirement, identity.helperRequirement,
    ]);
    expect(run.mock.calls.filter(([, args]) => args[0] === 'deployment-status')).toHaveLength(3);
  });

  it('does not retry a cancelled installation or claim that the service is ready', async () => {
    const { macosHelperDeploymentService, elevate, run } = createDeployment(['missing']);
    elevate.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Authorization cancelled' });
    await expect(macosHelperDeploymentService.ensureInstalled()).rejects.toMatchObject({ code: 'authorization-required' });
    expect(elevate).toHaveBeenCalledTimes(1);
    expect(run.mock.calls.filter(([, args]) => args[0] === 'deployment-status')).toHaveLength(1);
  });

  it('does not reinstall over an invalid component or accept an unknown state', async () => {
    for (const state of ['invalid', 'unexpected']) {
      const { macosHelperDeploymentService, elevate } = createDeployment([state]);
      await expect(macosHelperDeploymentService.ensureInstalled()).rejects.toMatchObject({ code: 'unavailable' });
      expect(elevate).not.toHaveBeenCalled();
    }
  });

  it('fails when the authorized deployment has not made the component ready', async () => {
    const { macosHelperDeploymentService, elevate } = createDeployment(['missing', 'missing']);
    await expect(macosHelperDeploymentService.ensureInstalled()).rejects.toMatchObject({ code: 'unavailable' });
    expect(elevate).toHaveBeenCalledTimes(1);
  });
});