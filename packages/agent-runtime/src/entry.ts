import { randomUUID } from 'node:crypto';

import type {
  AgentExecutionMode,
  AgentModelsSnapshot,
  AgentProviderVerification,
  AgentRuntimeEventListener,
  AgentRuntimeRunInput,
  AgentRuntimeRunResult,
  AgentRuntimeSuspendedRunResult,
  AgentSecureStore,
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  AgentTurnSnapshot,
  AgentTool,
  AgentToolAuthorizer,
  AgentToolSource,
  AgentRunEvent,
} from './interfaces';
import { AgentRunLoop } from './agent/entry';
import type { ModelRetryPolicy } from './models/retry';
import { AgentProviderRegistry } from './providers/entry';
import { AgentSessionService } from './sessions/entry';

/** Configures the long-lived Agent composition root and its platform capabilities. */
export interface AgentRuntimeOptions {
  readonly dataDirectory: string;
  readonly secureStore: AgentSecureStore;
  readonly toolSource: AgentToolSource;
  readonly fetcher?: typeof fetch;
  readonly createId?: () => string;
  readonly providerConnectionTestTimeoutMs?: number;
  readonly executionMode?: AgentExecutionMode;
  readonly modelRetryPolicy?: ModelRetryPolicy;
  readonly now?: () => number;
}

/** Owns Provider configuration and creates Provider-selected Agent run loops. */
export class AgentRuntime {
  readonly #providerRegistry: AgentProviderRegistry;
  readonly #sessionService: AgentSessionService;
  readonly #toolSource: AgentToolSource;
  readonly #executionMode: AgentExecutionMode | undefined;
  readonly #modelRetryPolicy: ModelRetryPolicy | undefined;
  #lifecycleTail: Promise<void> = Promise.resolve();
  #providerMutationTail: Promise<void> = Promise.resolve();
  #running = false;

  constructor(options: AgentRuntimeOptions) {
    const createId = options.createId ?? randomUUID;
    this.#providerRegistry = new AgentProviderRegistry({
      dataDirectory: options.dataDirectory,
      secureStore: options.secureStore,
      ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
      createId,
      ...(options.providerConnectionTestTimeoutMs === undefined
        ? {}
        : { connectionTestTimeoutMs: options.providerConnectionTestTimeoutMs }),
    });
    this.#toolSource = options.toolSource;
    this.#executionMode = options.executionMode;
    this.#modelRetryPolicy = options.modelRetryPolicy;
    this.#sessionService = new AgentSessionService({
      dataDirectory: options.dataDirectory,
      secureStore: options.secureStore,
      createId,
      now: options.now ?? Date.now,
      getModels: () => this.#providerRegistry.snapshot(),
      createRunLoop: (providerId, onModelStreamEvent, authorizeToolCall) =>
        this.#createRunLoop(providerId, onModelStreamEvent, authorizeToolCall),
    });
  }

  /** Restores encrypted Provider state before serving Main intents. */
  start(): Promise<void> {
    return this.#enqueueLifecycle(() => this.#start());
  }

  /** Clears in-memory one-time Provider verification state. */
  stop(): Promise<void> {
    return this.#enqueueLifecycle(() => this.#stop());
  }

  /** Settle active Turns while outer platform shutdown can still fail. */
  beginShutdown(): Promise<void> {
    return this.#sessionService.beginShutdown();
  }

  /** Resume Session commands after outer platform shutdown fails. */
  resumeAfterShutdownFailure(): void {
    this.#sessionService.resumeAfterShutdownFailure();
  }

  /** Returns the stable redacted Provider snapshot. */
  getModels(): AgentModelsSnapshot {
    return this.#providerRegistry.snapshot();
  }

  /** Tests one complete Provider draft without persisting it. */
  testProviderConnection(draft: unknown): Promise<AgentProviderVerification> {
    return this.#providerRegistry.testConnection(draft);
  }

  /** Persists exactly one previously tested Provider draft. */
  saveVerifiedProvider(verificationId: string): Promise<AgentModelsSnapshot> {
    this.#requireRunning();
    return this.#enqueueProviderMutation(() => this.#saveVerifiedProvider(verificationId));
  }

  /** Selects the default model for future Chats without reordering Providers. */
  setDefaultModel(providerId: string): Promise<AgentModelsSnapshot> {
    this.#requireRunning();
    return this.#enqueueProviderMutation(() => this.#providerRegistry.setDefault(providerId));
  }

  /** Removes one Provider and deterministically repairs the default. */
  removeProvider(providerId: string): Promise<AgentModelsSnapshot> {
    this.#requireRunning();
    return this.#enqueueProviderMutation(() => this.#removeProvider(providerId));
  }

  /** Subscribe to durable ordered Session snapshots. */
  subscribe(listener: AgentRuntimeEventListener): () => void {
    return this.#sessionService.subscribe(listener);
  }

  /** Return newest-first Chats and the current selection. */
  async listSessions(): Promise<AgentSessionsSnapshot> {
    return this.#sessionService.listSessions();
  }

  /** Create an empty Chat using the current default Provider. */
  async createSession(): Promise<AgentSessionSnapshot> {
    return this.#sessionService.createSession();
  }

  /** Persist the explicitly selected Chat. */
  async selectSession(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.selectSession(sessionId);
  }

  /** Read one complete Chat snapshot. */
  async getSession(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.getSession(sessionId);
  }

  /** Rename one Chat without changing selector order. */
  async renameSession(sessionId: string, title: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.renameSession(sessionId, title);
  }

  /** Delete one complete Chat and its encrypted history. */
  deleteSession(sessionId: string): Promise<AgentSessionsSnapshot> {
    return this.#sessionService.deleteSession(sessionId);
  }

  /** Select a configured model for future Turns in one Chat. */
  async setSessionModel(
    sessionId: string,
    providerId: string,
  ): Promise<AgentSessionSnapshot> {
    return this.#sessionService.setSessionModel(sessionId, providerId);
  }

  /** Require approval for future change Tool calls in one Chat. */
  async requireToolApproval(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.requireToolApproval(sessionId);
  }

  /** Automatically execute future enabled change Tools in one Chat. */
  async automaticallyExecuteTools(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.automaticallyExecuteTools(sessionId);
  }

  /** Append one user message and start a background Streaming Turn. */
  async sendMessage(sessionId: string, content: string): Promise<AgentTurnSnapshot> {
    return this.#sessionService.sendMessage(sessionId, content);
  }

  /** Stop one active Turn after its Provider cleanup completes. */
  cancelTurn(turnId: string): Promise<AgentTurnSnapshot> {
    return this.#sessionService.cancelTurn(turnId);
  }

  /** Retry one cancelled/failed Turn without duplicating its user Item. */
  async retryTurn(turnId: string): Promise<AgentTurnSnapshot> {
    return this.#sessionService.retryTurn(turnId);
  }

  /** Allow one pending change Tool call. */
  async allowToolCall(approvalId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.allowToolCall(approvalId);
  }

  /** Deny one pending change Tool call. */
  async denyToolCall(approvalId: string): Promise<AgentSessionSnapshot> {
    return this.#sessionService.denyToolCall(approvalId);
  }

  /** Runs one in-memory Agent segment through the requested configured Provider. */
  async run(input: AgentRuntimeRunInput): Promise<AgentRuntimeRunResult> {
    const agentRunLoop = this.#createRunLoop(input.providerId);
    const result = await agentRunLoop.run(input);
    return { ...result, providerId: input.providerId };
  }

  /** Resumes one suspended segment through its original configured Provider. */
  async resume(
    suspendedRun: AgentRuntimeSuspendedRunResult,
    options: { readonly abortSignal?: AbortSignal } = {},
  ): Promise<AgentRuntimeRunResult> {
    const agentRunLoop = this.#createRunLoop(suspendedRun.providerId);
    const result = await agentRunLoop.resume(suspendedRun, options);
    return { ...result, providerId: suspendedRun.providerId };
  }

  #createRunLoop(
    providerId: string,
    onRunEvent?: (event: AgentRunEvent) => void | Promise<void>,
    authorizeToolCall?: AgentToolAuthorizer,
  ): AgentRunLoop {
    return new AgentRunLoop({
      model: this.#providerRegistry.modelAdapter(providerId),
      toolSource: this.#toolSource,
      ...(this.#executionMode === undefined ? {} : { executionMode: this.#executionMode }),
      ...(this.#modelRetryPolicy === undefined ? {} : { modelRetryPolicy: this.#modelRetryPolicy }),
      ...(onRunEvent === undefined ? {} : { onRunEvent }),
      ...(authorizeToolCall === undefined ? {} : { authorizeToolCall }),
    });
  }

  async #start(): Promise<void> {
    if (this.#running) {
      await this.#stop();
    }
    await this.#providerMutationTail;
    await this.#providerRegistry.start();
    try {
      this.#sessionService.start();
      await this.#sessionService.reconcileModels(this.#providerRegistry.snapshot());
      this.#running = true;
    } catch (startError) {
      this.#running = false;
      const cleanupErrors: unknown[] = [];
      await this.#sessionService.stop().catch((error: unknown) => cleanupErrors.push(error));
      await this.#providerRegistry.stop().catch((error: unknown) => cleanupErrors.push(error));
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [startError, ...cleanupErrors],
          'Agent Runtime start and cleanup failed.',
        );
      }
      throw startError;
    }
  }

  async #stop(): Promise<void> {
    if (!this.#running) return;
    this.#running = false;
    await this.#providerMutationTail;
    const errors: unknown[] = [];
    await this.#sessionService.stop().catch((error: unknown) => errors.push(error));
    await this.#providerRegistry.stop().catch((error: unknown) => errors.push(error));
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Agent Runtime stop failed.');
    }
  }

  #enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const result = this.#lifecycleTail.then(operation);
    this.#lifecycleTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #requireRunning(): void {
    if (!this.#running) {
      throw new Error('Agent Runtime is not running.');
    }
  }

  /** Save one Provider and update all Session references to its current model metadata. */
  async #saveVerifiedProvider(verificationId: string): Promise<AgentModelsSnapshot> {
    const save = await this.#providerRegistry.saveVerified(verificationId);
    try {
      await this.#sessionService.reconcileModels(save.models);
      return save.models;
    } catch (error) {
      try {
        await save.rollback();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Agent Provider save and rollback both failed.',
        );
      }
      throw error;
    }
  }

  /** Remove one Provider, cancel affected Turns and migrate Sessions to the fallback. */
  async #removeProvider(providerId: string): Promise<AgentModelsSnapshot> {
    const previousModels = this.#providerRegistry.snapshot();
    if (!previousModels.models.some((model) => model.providerId === providerId)) {
      throw new Error('Agent Provider does not exist.');
    }
    const remainingModels = previousModels.models.filter(
      (model) => model.providerId !== providerId,
    );
    const defaultProviderId = previousModels.defaultProviderId === providerId
      ? remainingModels[0]?.providerId ?? null
      : previousModels.defaultProviderId;
    const preview: AgentModelsSnapshot = {
      defaultProviderId,
      models: remainingModels.map((model) => ({
        ...model,
        isDefault: model.providerId === defaultProviderId,
      })),
    };
    const reconciliation = await this.#sessionService.reconcileModels(preview);
    try {
      return await this.#providerRegistry.remove(providerId);
    } catch (error) {
      try {
        this.#sessionService.restoreModelBindings(reconciliation);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Agent Provider removal and Session rollback both failed.',
        );
      }
      throw error;
    }
  }

  /** Serialize Provider mutations with their Session side effects. */
  #enqueueProviderMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#providerMutationTail.then(async () => {
      this.#sessionService.beginModelConfigurationChange();
      try {
        return await operation();
      } finally {
        this.#sessionService.endModelConfigurationChange();
      }
    });
    this.#providerMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
