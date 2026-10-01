import { chmod, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CommandResult, CommandRunner } from '../../../interfaces';
import type { MacosApplicationIdentity, MacosHelperDeploymentOptions } from '../../interfaces';
import { commandRunner } from '../../../internal/command-runners';
import { MacosHelperServiceError } from '../internal/errors';

export class MacosHelperDeploymentService {
  private readonly runner: CommandRunner;

  constructor(private readonly options: MacosHelperDeploymentOptions) {
    if (!path.posix.isAbsolute(options.helperPath)
      || !['development', 'production'].includes(options.environment)
      || !Number.isSafeInteger(options.userId) || options.userId < 501 || options.userId >= 4_294_967_295) {
      throw new MacosHelperServiceError('invalid-request');
    }
    if (options.environment === 'production'
      && (!path.posix.isAbsolute(options.applicationPath) || !options.applicationPath.endsWith('.app')
        || options.helperPath !== `${options.applicationPath}/Contents/Resources/system-proxy/macos-proxy-helper`)) {
      throw new MacosHelperServiceError('invalid-request');
    }
    this.runner = options.runner ?? commandRunner;
  }

  async ensureInstalled(): Promise<void> {
    const state = await this.readDeploymentState();
    if (state === 'ready') return;
    if (state !== 'missing' && state !== 'outdated') throw new MacosHelperServiceError('unavailable', 'completed');
    const result = await this.requestInstallation();
    if (result.code !== 0) {
      const reason = [
        'installation requires administrator privileges',
        'installation paths must be root-owned and protected',
        'application signature is invalid',
        'the bundled helper does not match the approved application',
        'installation requires a logged-in local user',
        'system service registration failed',
        'helper deployment and previous service recovery failed',
        'another helper deployment is in progress',
        'helper installation authorization failed',
        'helper installation authorization cancelled',
        'unable to focus the helper installation authorization',
      ].find((message) => result.stderr.includes(message)) ?? 'authorization or native command failed';
      process.stderr.write(`[helper-deployment] ${reason}\n`);
      throw new MacosHelperServiceError('authorization-required');
    }
    if (await this.readDeploymentState() !== 'ready') throw new MacosHelperServiceError('unavailable', 'completed');
  }

  private async requestInstallation(): Promise<CommandResult> {
    const argumentsList = await this.createInstallationArguments();
    if (this.options.environment === 'production') return this.runner.run(this.options.helperPath, argumentsList);
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-helper-authorization-'));
    try {
      const stagedHelperPath = path.join(directory, 'macos-proxy-helper');
      await copyFile(this.options.helperPath, stagedHelperPath);
      await chmod(stagedHelperPath, 0o500);
      return await this.runner.run(stagedHelperPath, argumentsList);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async createInstallationArguments(): Promise<string[]> {
    if (this.options.environment === 'development') {
      return ['request-development-installation', String(this.options.userId), await this.readHelperRequirement()];
    }
    const identity = await this.readApplicationIdentity(this.options.applicationPath);
    return [
      'request-installation', this.options.applicationPath, String(this.options.userId),
      identity.clientRequirement, identity.helperRequirement,
    ];
  }

  private async readHelperRequirement(): Promise<string> {
    const result = await this.runner.run(this.options.helperPath, ['inspect-helper']);
    if (result.code !== 0) throw new MacosHelperServiceError('unauthorized-client', 'completed');
    try {
      const value: unknown = JSON.parse(result.stdout);
      if (value !== null && typeof value === 'object' && Object.keys(value).length === 1
        && 'helperRequirement' in value && typeof value.helperRequirement === 'string'
        && /^cdhash H"[a-fA-F0-9]{40,64}"$/.test(value.helperRequirement)) return value.helperRequirement;
    } catch {}
    throw new MacosHelperServiceError('invalid-response', 'completed');
  }

  private async readApplicationIdentity(applicationPath: string): Promise<MacosApplicationIdentity> {
    const result = await this.runner.run(this.options.helperPath, ['inspect-application', applicationPath]);
    if (result.code !== 0) throw new MacosHelperServiceError('unauthorized-client', 'completed');
    try {
      const value = JSON.parse(result.stdout) as Partial<MacosApplicationIdentity>;
      const requirement = /^cdhash H"[a-fA-F0-9]{40,64}"$/;
      if (value !== null && typeof value === 'object' && Object.keys(value).length === 4
        && value.bundleIdentifier === 'com.zhxmt.interceptor'
        && typeof value.bundleVersion === 'string' && value.bundleVersion.length > 0
        && typeof value.clientRequirement === 'string' && requirement.test(value.clientRequirement)
        && typeof value.helperRequirement === 'string' && requirement.test(value.helperRequirement)) {
        return value as MacosApplicationIdentity;
      }
    } catch {}
    throw new MacosHelperServiceError('invalid-response', 'completed');
  }

  private async readDeploymentState(): Promise<string> {
    const result = await this.runner.run(this.options.helperPath, this.options.environment === 'development'
      ? ['development-deployment-status', String(this.options.userId)]
      : ['deployment-status', this.options.applicationPath, String(this.options.userId)]);
    if (result.code !== 0) throw new MacosHelperServiceError('unavailable', 'completed');
    try {
      const value: unknown = JSON.parse(result.stdout);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.keys(value).length === 1 && 'state' in value && typeof value.state === 'string') return value.state;
    } catch {}
    throw new MacosHelperServiceError('unavailable', 'completed');
  }
}