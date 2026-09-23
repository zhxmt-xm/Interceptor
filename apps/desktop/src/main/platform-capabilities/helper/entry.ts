import path from 'node:path';
import { PlatformOperationInProgressError, type PlatformOperation } from '@interceptor/tools';

import type { HelperServiceOptions } from './interfaces';
import { MacosHelperServiceClient } from './macos/helper-client';
import { MacosHelperDeploymentService } from './macos/installation/helper-deployment';
import { MacosHelperServiceError } from './macos/internal/errors';

export class HelperService {
  readonly macosHelperServiceClient: MacosHelperServiceClient | null;
  private readonly platform: NodeJS.Platform;
  private activeOperation: { operation: 'helper.prepare'; state: 'running' | 'uncertain' } | null = null;
  private authorizationOperation: { operation: PlatformOperation; state: 'running' | 'uncertain' } | null = null;

  constructor(private readonly options: HelperServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.macosHelperServiceClient = this.platform === 'darwin' ? new MacosHelperServiceClient(
      options.applicationEnvironment === 'development'
        ? '/Library/Application Support/Interceptor/PlatformHelper/development.sock' : undefined,
    ) : null;
  }

  async prepare(): Promise<void> {
    const activeOperation = this.getActiveOperation();
    if (activeOperation) throw new PlatformOperationInProgressError(activeOperation.operation);
    this.activeOperation = { operation: 'helper.prepare', state: 'running' };
    try {
      if (this.platform === 'darwin') await this.prepareMacosComponents();
    } catch (error) {
      const code = error instanceof MacosHelperServiceError ? error.code : 'operation-failed';
      if (HelperService.hasUnconfirmedExecution(error)) {
        this.activeOperation = { operation: 'helper.prepare', state: 'uncertain' };
      }
      process.stderr.write(`[platform-capabilities] native preparation failed: ${code}\n`);
      throw error;
    } finally {
      if (this.activeOperation.state === 'running') this.activeOperation = null;
    }
  }

  getActiveOperation(): { operation: PlatformOperation; state: 'running' | 'uncertain' } | null {
    const activeOperation = this.activeOperation ?? this.authorizationOperation;
    return activeOperation ? { ...activeOperation } : null;
  }

  assertNotPreparing(): void {
    if (this.activeOperation) throw new PlatformOperationInProgressError(this.activeOperation.operation);
  }

  async runAuthorization<Result>(operation: PlatformOperation, perform: () => Promise<Result>): Promise<Result> {
    this.assertNotPreparing();
    if (this.authorizationOperation) throw new PlatformOperationInProgressError(this.authorizationOperation.operation);
    this.authorizationOperation = { operation, state: 'running' };
    try {
      return await perform();
    } catch (error) {
      if (HelperService.hasUnconfirmedExecution(error)) this.authorizationOperation = { operation, state: 'uncertain' };
      throw error;
    } finally {
      if (this.authorizationOperation.state === 'running') this.authorizationOperation = null;
    }
  }

  private static hasUnconfirmedExecution(error: unknown): boolean {
    if (error instanceof AggregateError) return error.errors.some((cause) => HelperService.hasUnconfirmedExecution(cause));
    return error instanceof MacosHelperServiceError && error.hasUnconfirmedMutation();
  }

  private async prepareMacosComponents(): Promise<void> {
    const deploymentOptions = {
      helperPath: path.join(this.options.nativeDirectory, 'system-proxy/macos-proxy-helper'),
      userId: this.options.userId ?? process.getuid!(),
    };
    let macosHelperDeploymentService: MacosHelperDeploymentService;
    if (this.options.applicationEnvironment === 'development') {
      macosHelperDeploymentService = new MacosHelperDeploymentService({ ...deploymentOptions, environment: 'development' });
    } else {
      if (!this.options.applicationPath) throw new MacosHelperServiceError('unauthorized-client');
      macosHelperDeploymentService = new MacosHelperDeploymentService({
        ...deploymentOptions, environment: 'production', applicationPath: this.options.applicationPath,
      });
    }
    await macosHelperDeploymentService.ensureInstalled();
    process.stderr.write('[platform-capabilities] bundled helper deployment verified\n');
    const status = await this.macosHelperServiceClient!.getStatus();
    process.stderr.write(`[platform-capabilities] helper privileged=${status.privileged} client-authorized=${status.clientAuthorizedForWrites}\n`);
    if (!status.privileged || !status.clientAuthorizedForWrites) throw new MacosHelperServiceError('unauthorized-client');
  }
}