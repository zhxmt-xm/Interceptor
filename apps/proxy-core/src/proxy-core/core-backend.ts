import type {
  CoreCommand,
  CoreError,
  CoreResult,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from './core-diagnostics';

export interface CoreCommandExecutor {
  execute(command: CoreCommand, signal: AbortSignal): Promise<CoreResult>;
}

export class CoreCommandError extends Error {
  constructor(readonly detail: CoreError) {
    super(detail.message);
    this.name = 'CoreCommandError';
  }
}

interface CoreBackendOptions {
  now?: () => number;
}

/**
 * Core 的业务入口。RPC 层只负责收发消息，所有 command 的实际行为都在这里。
 * M2/M3 增加存储或代理能力时，应注入对应 Service，再在 execute 中做明确路由。
 */
export class CoreBackend implements CoreCommandExecutor {
  private readonly now: () => number;

  constructor(
    private readonly diagnostics: CoreDiagnostics,
    options: CoreBackendOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  async execute(command: CoreCommand, signal: AbortSignal): Promise<CoreResult> {
    if (signal.aborted) {
      throw cancelledCommand();
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
        throw new CoreCommandError({
          code: 'unsupported-command',
          message: `${command.type} is not implemented yet.`,
          retryable: false,
        });
    }
  }
}

function cancelledCommand(): CoreCommandError {
  return new CoreCommandError({
    code: 'cancelled',
    message: 'The command was cancelled.',
    retryable: false,
  });
}