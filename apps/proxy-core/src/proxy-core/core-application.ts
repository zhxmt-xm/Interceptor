import type {
  CoreCommand,
  CoreError,
  CoreResult,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from './core-diagnostics';
import {
  CoreCommandError,
  CoreRpcServer,
  type CoreCommandExecutor,
  type RpcMessagePort,
} from './core-rpc-server';

interface CoreApplicationOptions {
  diagnostics?: CoreDiagnostics;
  now?: () => number;
  onFatalError?: (reason: string) => void;
}

/** Core 业务总入口：集中拥有 RPC、Diagnostics 和后续业务 Service。 */
export class CoreApplication implements CoreCommandExecutor {
  readonly diagnostics: CoreDiagnostics;
  private readonly now: () => number;
  private readonly rpcServer: CoreRpcServer;

  constructor(options: CoreApplicationOptions = {}) {
    this.now = options.now ?? Date.now;
    this.diagnostics =
      options.diagnostics ?? new CoreDiagnostics({ now: this.now });
    this.rpcServer = new CoreRpcServer(
      this,
      this.diagnostics,
      {
        now: this.now,
        onFatalError: options.onFatalError,
      },
    );
  }

  attach(port: RpcMessagePort): void {
    this.rpcServer.attach(port);
  }

  close(reason = 'closed'): void {
    this.rpcServer.close(reason);
  }

  async execute(command: CoreCommand, signal: AbortSignal): Promise<CoreResult> {
    if (signal.aborted) {
      throw commandError({
        code: 'cancelled',
        message: 'The command was cancelled.',
        retryable: false,
      });
    }

    switch (command.type) {
      case 'echo':
        return this.diagnostics.action('echo.copy', () => ({
          type: 'echo',
          payload: {
            value: command.payload.value,
            handledAt: new Date(this.now()).toISOString(),
          },
        }));
      case 'diagnostics.recent':
        return {
          type: 'diagnostics.records',
          payload: this.diagnostics.recent(
            command.payload.limit,
            command.payload.traceId,
          ),
        };
      default:
        throw commandError({
          code: 'unsupported-command',
          message: `${command.type} is not implemented yet.`,
          retryable: false,
        });
    }
  }
}

function commandError(detail: CoreError): CoreCommandError {
  return new CoreCommandError(detail);
}