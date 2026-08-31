import type {
  AgentContextUsage,
  AgentMessage,
  AgentRunEvent,
  AgentModelsSnapshot,
  AgentRuntimeEvent,
  AgentRuntimeEventListener,
  AgentSecureStore,
  AgentSessionSnapshot,
  AgentSessionSummary,
  AgentSessionsSnapshot,
  AgentSessionUsage,
  AgentToolAuthorizationDecision,
  AgentToolAuthorizationRequest,
  AgentToolAuthorizer,
  AgentTranscriptItem,
  AgentTurnSnapshot,
  ModelUsage,
  ToolExecutionContext,
} from '../interfaces';
import type { AgentRunLoop } from '../agent/entry';
import { AgentSessionStore } from './internal/session-store';
import { AgentSessionStoreCorruptionError } from './internal/errors';
import type {
  StoredAgentAssistantItem,
  StoredAgentModelCall,
  StoredAgentSession,
  StoredAgentToolCallItem,
  StoredAgentTurn,
} from './interfaces';

interface ActiveAgentTurn {
  readonly sessionId: string;
  readonly turnId: string;
  readonly abortController: AbortController;
  readonly completion: Promise<void>;
}

interface ActiveAgentToolApproval {
  readonly approvalId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly abortSignal: AbortSignal;
  readonly onAbort: () => void;
  readonly resolve: (decision: AgentToolAuthorizationDecision) => void;
  readonly reject: (reason: unknown) => void;
}

interface AgentTurnStreamBuffer {
  readonly sessionId: string;
  readonly turn: AgentTurnSnapshot;
  readonly abortController: AbortController;
  readonly contextPlan: AgentTurnContextPlan;
  currentAssistantItemId: string | null;
  currentMaxOutputTokens: number;
  text: string;
  reasoning: string;
  usage: ModelUsage | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const STREAM_FLUSH_INTERVAL_MS = 32;

interface ResolvedSessionModel {
  readonly providerId: string;
  readonly modelId: string;
  readonly contextWindowTokens: number;
  readonly maximumOutputTokens: number;
}

interface AgentTurnContextPlan extends ResolvedSessionModel {
  readonly messages: readonly AgentMessage[];
  readonly estimatedInputTokens: number;
  readonly requestedOutputTokens: number;
}

export interface AgentSessionModelBinding {
  readonly sessionId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly contextUsage: AgentContextUsage;
}

export interface AgentSessionModelReconciliation {
  readonly previousBindings: readonly AgentSessionModelBinding[];
}

export interface AgentSessionServiceOptions {
  readonly dataDirectory: string;
  readonly secureStore: AgentSecureStore;
  readonly createId: () => string;
  readonly now: () => number;
  readonly getModels: () => AgentModelsSnapshot;
  readonly createRunLoop: (
    providerId: string,
    onRunEvent: (event: AgentRunEvent) => Promise<void>,
    authorizeToolCall: AgentToolAuthorizer,
  ) => AgentRunLoop;
}

/** Owns encrypted Session history, active Turns, Usage and ordered events. */
export class AgentSessionService {
  readonly #sessionStore: AgentSessionStore;
  readonly #secureStore: AgentSecureStore;
  readonly #createId: () => string;
  readonly #now: () => number;
  readonly #getModels: () => AgentModelsSnapshot;
  readonly #createRunLoop: AgentSessionServiceOptions['createRunLoop'];
  readonly #sessionsById = new Map<string, StoredAgentSession>();
  readonly #activeTurnsById = new Map<string, ActiveAgentTurn>();
  readonly #activeToolApprovalsById = new Map<string, ActiveAgentToolApproval>();
  readonly #listeners = new Set<AgentRuntimeEventListener>();
  #running = false;
  #acceptingCommands = false;
  #storageAvailable = false;
  #modelConfigurationChanging = false;

  constructor(options: AgentSessionServiceOptions) {
    this.#sessionStore = new AgentSessionStore(options.dataDirectory, options.secureStore);
    this.#secureStore = options.secureStore;
    this.#createId = options.createId;
    this.#now = options.now;
    this.#getModels = options.getModels;
    this.#createRunLoop = options.createRunLoop;
  }

  /** Restore and validate encrypted Sessions. */
  start(): void {
    this.#sessionsById.clear();
    this.#activeToolApprovalsById.clear();
    if (!this.#secureStore.isEncryptionAvailable()) {
      this.#storageAvailable = false;
      this.#running = true;
      this.#acceptingCommands = true;
      return;
    }
    try {
      this.#sessionStore.start();
    } catch (error) {
      if (!this.#secureStore.isEncryptionAvailable()) {
        this.#storageAvailable = false;
        this.#running = true;
        this.#acceptingCommands = true;
        return;
      }
      if (!(error instanceof AgentSessionStoreCorruptionError)) {
        throw error;
      }
      this.#sessionStore.quarantineCorruptDatabase(this.#now());
      this.#sessionStore.start();
    }
    this.#storageAvailable = true;
    for (const session of this.#sessionStore.list()) {
      const interrupted = this.#settleInterruptedTurns(session);
      if (interrupted !== session) {
        this.#sessionStore.replace(interrupted);
      }
      this.#sessionsById.set(interrupted.sessionId, interrupted);
    }
    this.#running = true;
    this.#acceptingCommands = true;
  }

  /** Cancel all active Turns, wait for cleanup and close SQLite. */
  async stop(): Promise<void> {
    await this.beginShutdown();
    if (this.#storageAvailable) {
      this.#sessionStore.stop();
    }
    this.#running = false;
    this.#storageAvailable = false;
    this.#sessionsById.clear();
    this.#listeners.clear();
  }

  /** Reject new commands and settle active Turns while keeping Store/events alive. */
  async beginShutdown(): Promise<void> {
    if (!this.#running) return;
    this.#acceptingCommands = false;
    const activeTurns = [...this.#activeTurnsById.values()];
    for (const activeTurn of activeTurns) {
      activeTurn.abortController.abort(new DOMException('Agent Runtime stopped.', 'AbortError'));
    }
    await Promise.all(activeTurns.map((activeTurn) => activeTurn.completion));
  }

  /** Resume Session commands when an outer application shutdown is cancelled. */
  resumeAfterShutdownFailure(): void {
    if (this.#running) {
      this.#acceptingCommands = true;
    }
  }

  /** Subscribe to durable per-Session snapshots. */
  subscribe(listener: AgentRuntimeEventListener): () => void {
    this.#requireAcceptingCommands();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Return newest-first Session summaries and the current selection. */
  listSessions(): AgentSessionsSnapshot {
    this.#requireAcceptingCommands();
    if (!this.#storageAvailable) {
      return { currentSessionId: null, sessions: [] };
    }
    return {
      currentSessionId: this.#sessionStore.currentSessionId(),
      sessions: this.#sessionStore.list().map((session) => this.#summary(session)),
    };
  }

  /** Create an empty Session using the current default Provider. */
  createSession(): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    const models = this.#getModels();
    const providerId = models.defaultProviderId;
    const model = models.models.find((entry) => entry.providerId === providerId);
    if (providerId === null || model === undefined) {
      throw new Error('Configure an Agent Provider before creating a Session.');
    }
    const now = this.#now();
    const session: StoredAgentSession = {
      sessionId: this.#createId(),
      title: 'New chat',
      providerId,
      modelId: model.modelId,
      toolExecutionMode: 'ask',
      createdAt: now,
      updatedAt: now,
      sequence: 0,
      items: [],
      turns: [],
      modelCalls: [],
      contextUsage: {
        contextWindowTokens: model.contextWindowTokens,
        currentContextTokens: null,
        remainingContextTokens: null,
        maxOutputTokens: model.maximumOutputTokens,
        source: 'unavailable',
      },
    };
    this.#sessionStore.create(session);
    this.#sessionsById.set(session.sessionId, session);
    return this.#snapshot(session);
  }

  /** Persist the explicit current Chat selection. */
  selectSession(sessionId: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    this.#requireSession(sessionId);
    this.#sessionStore.select(sessionId);
    return this.#snapshot(this.#requireSession(sessionId));
  }

  /** Read one complete Session snapshot. */
  getSession(sessionId: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    return this.#snapshot(this.#requireSession(sessionId));
  }

  /** Rename one Session without changing selector order. */
  renameSession(sessionId: string, titleInput: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    const title = titleInput.trim();
    if (title.length === 0 || title.length > 80) {
      throw new Error('Agent Session title must contain 1 to 80 characters.');
    }
    return this.#commit(sessionId, null, (session) => {
      session.title = title;
    });
  }

  /** Delete one complete Session after cancelling its active Turn. */
  async deleteSession(sessionId: string): Promise<AgentSessionsSnapshot> {
    this.#requireAcceptingCommands();
    this.#requireSession(sessionId);
    const activeTurn = [...this.#activeTurnsById.values()]
      .find((entry) => entry.sessionId === sessionId);
    if (activeTurn !== undefined) {
      await this.cancelTurn(activeTurn.turnId);
    }
    this.#sessionStore.delete(sessionId);
    this.#sessionsById.delete(sessionId);
    return this.listSessions();
  }

  /** Select a configured Provider for future Turns in this Session. */
  setSessionModel(sessionId: string, providerId: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    const model = this.#getModels().models.find((entry) => entry.providerId === providerId);
    if (model === undefined) {
      throw new Error('Agent Provider does not exist.');
    }
    this.#requireNoActiveTurn(sessionId);
    return this.#commit(sessionId, null, (session) => {
      session.providerId = providerId;
      session.modelId = model.modelId;
      session.contextUsage = {
        contextWindowTokens: model.contextWindowTokens,
        currentContextTokens: null,
        remainingContextTokens: null,
        maxOutputTokens: model.maximumOutputTokens,
        source: 'unavailable',
      };
    });
  }

  /** Require approval for future change Tool calls in one Session. */
  requireToolApproval(sessionId: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    return this.#commit(sessionId, null, (session) => {
      session.toolExecutionMode = 'ask';
    });
  }

  /** Automatically execute future enabled change Tools in one Session. */
  automaticallyExecuteTools(sessionId: string): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    return this.#commit(sessionId, null, (session) => {
      session.toolExecutionMode = 'auto';
    });
  }

  /** Allow one pending change Tool call without changing later Session mode. */
  allowToolCall(approvalId: string): AgentSessionSnapshot {
    return this.#decideToolCall(approvalId, 'allow');
  }

  /** Deny one pending change Tool call without invoking its executor. */
  denyToolCall(approvalId: string): AgentSessionSnapshot {
    return this.#decideToolCall(approvalId, 'deny');
  }

  /** Reconcile persisted Session model references after Provider restore or mutation. */
  async reconcileModels(
    models: AgentModelsSnapshot,
  ): Promise<AgentSessionModelReconciliation> {
    this.#requireAcceptingCommands();
    const fallback = models.models.find((model) => model.providerId === models.defaultProviderId);
    for (const session of [...this.#sessionsById.values()]) {
      const model = models.models.find((entry) => entry.providerId === session.providerId);
      if (model !== undefined) continue;
      const activeTurn = [...this.#activeTurnsById.values()]
        .find((entry) => entry.sessionId === session.sessionId);
      if (activeTurn !== undefined) {
        await this.cancelTurn(activeTurn.turnId);
      }
    }
    const replacements: StoredAgentSession[] = [];
    const previousBindings: AgentSessionModelBinding[] = [];
    for (const currentSession of [...this.#sessionsById.values()]) {
      let model = models.models.find(
        (entry) => entry.providerId === currentSession.providerId,
      );
      if (model === undefined && fallback !== undefined) {
        model = fallback;
      }
      if (model === undefined
        || (currentSession.modelId === model.modelId
          && currentSession.contextUsage.contextWindowTokens === model.contextWindowTokens
          && currentSession.contextUsage.maxOutputTokens === model.maximumOutputTokens)) {
        continue;
      }
      previousBindings.push({
        sessionId: currentSession.sessionId,
        providerId: currentSession.providerId,
        modelId: currentSession.modelId,
        contextUsage: { ...currentSession.contextUsage },
      });
      const next = structuredClone(currentSession);
      next.providerId = model.providerId;
      next.modelId = model.modelId;
      next.contextUsage = {
        contextWindowTokens: model.contextWindowTokens,
        currentContextTokens: null,
        remainingContextTokens: null,
        maxOutputTokens: model.maximumOutputTokens,
        source: 'unavailable',
      };
      next.sequence += 1;
      next.updatedAt = this.#now();
      replacements.push(next);
    }
    this.#persistModelReplacements(replacements);
    return { previousBindings };
  }

  /** Block new model-bound commands while Provider metadata is being coordinated. */
  beginModelConfigurationChange(): void {
    this.#requireAcceptingCommands();
    this.#modelConfigurationChanging = true;
  }

  /** Reopen model-bound commands after Provider coordination settles. */
  endModelConfigurationChange(): void {
    this.#modelConfigurationChanging = false;
  }

  /** Restore exact model bindings when the coordinated Provider mutation fails. */
  restoreModelBindings(reconciliation: AgentSessionModelReconciliation): void {
    const replacements = reconciliation.previousBindings.map((binding) => {
      const next = structuredClone(this.#requireSession(binding.sessionId));
      next.providerId = binding.providerId;
      next.modelId = binding.modelId;
      next.contextUsage = { ...binding.contextUsage };
      next.sequence += 1;
      next.updatedAt = this.#now();
      return next;
    });
    this.#persistModelReplacements(replacements);
  }

  /** Persist model-only Session replacements together, then broadcast each snapshot. */
  #persistModelReplacements(replacements: readonly StoredAgentSession[]): void {
    if (replacements.length === 0) return;
    this.#sessionStore.replaceMany(replacements);
    for (const next of replacements) {
      this.#sessionsById.set(next.sessionId, next);
      this.#emit({
        type: 'session-updated',
        sessionId: next.sessionId,
        turnId: null,
        sequence: next.sequence,
        snapshot: this.#snapshot(next),
      });
    }
  }

  /** Append one user Item and start a background Streaming Turn. */
  sendMessage(sessionId: string, contentInput: string): AgentTurnSnapshot {
    this.#requireAcceptingCommands();
    this.#requireStableModelConfiguration();
    const content = contentInput.trim();
    if (content.length === 0 || content.length > 1_000_000) {
      throw new Error('Agent message must contain 1 to 1000000 characters.');
    }
    this.#requireNoActiveTurn(sessionId);
    const model = this.#resolveSessionModel(sessionId);
    const contextPlan = this.#planTurnContext(model, [
      ...this.#modelMessages(this.#requireSession(sessionId)),
      { role: 'user', content },
    ]);
    const now = this.#now();
    const turnId = this.#createId();
    const userItemId = this.#createId();
    const turn: AgentTurnSnapshot = {
      turnId,
      userItemId,
      status: 'running',
      retryOfTurnId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const abortController = new AbortController();
    const streamBuffer = this.#streamBuffer(
      sessionId,
      turn,
      abortController,
      contextPlan,
    );
    const runLoop = this.#createRunLoop(
      contextPlan.providerId,
      (event) => this.#recordModelEvent(streamBuffer, event),
      (request, context) => this.#authorizeToolCall(streamBuffer, request, context),
    );
    this.#commit(sessionId, turnId, (session) => {
      session.items.push({
        kind: 'user-message',
        itemId: userItemId,
        turnId,
        content,
        createdAt: now,
      });
      session.turns.push(turn);
      session.contextUsage = {
        contextWindowTokens: contextPlan.contextWindowTokens,
        currentContextTokens: contextPlan.estimatedInputTokens,
        remainingContextTokens: contextPlan.contextWindowTokens
          - contextPlan.estimatedInputTokens,
        maxOutputTokens: contextPlan.requestedOutputTokens,
        source: 'estimated',
      };
    });
    this.#startTurn(
      sessionId,
      turn,
      runLoop,
      contextPlan,
      abortController,
      streamBuffer,
    );
    return turn;
  }

  /** Cancel one active Turn and wait for its terminal durable state. */
  async cancelTurn(turnId: string): Promise<AgentTurnSnapshot> {
    this.#requireAcceptingCommands();
    const activeTurn = this.#activeTurnsById.get(turnId);
    if (activeTurn === undefined) {
      return this.#findTurn(turnId);
    }
    activeTurn.abortController.abort(new DOMException('Agent Turn cancelled.', 'AbortError'));
    await activeTurn.completion;
    return this.#findTurn(turnId);
  }

  /** Retry one failed/cancelled Turn without duplicating its user Item. */
  retryTurn(turnId: string): AgentTurnSnapshot {
    this.#requireAcceptingCommands();
    this.#requireStableModelConfiguration();
    const original = this.#findTurn(turnId);
    if (!['cancelled', 'failed'].includes(original.status)) {
      throw new Error('Only a cancelled or failed Agent Turn can be retried.');
    }
    const session = [...this.#sessionsById.values()]
      .find((entry) => entry.turns.some((turn) => turn.turnId === turnId));
    if (session === undefined) {
      throw new Error('Agent Session does not exist.');
    }
    this.#requireNoActiveTurn(session.sessionId);
    const model = this.#resolveSessionModel(session.sessionId);
    const contextPlan = this.#planTurnContext(model, this.#modelMessages(session));
    const now = this.#now();
    const retry: AgentTurnSnapshot = {
      turnId: this.#createId(),
      userItemId: original.userItemId,
      status: 'running',
      retryOfTurnId: original.turnId,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const abortController = new AbortController();
    const streamBuffer = this.#streamBuffer(
      session.sessionId,
      retry,
      abortController,
      contextPlan,
    );
    const runLoop = this.#createRunLoop(
      contextPlan.providerId,
      (event) => this.#recordModelEvent(streamBuffer, event),
      (request, context) => this.#authorizeToolCall(streamBuffer, request, context),
    );
    this.#commit(session.sessionId, retry.turnId, (next) => {
      next.turns.push(retry);
      next.contextUsage = {
        contextWindowTokens: contextPlan.contextWindowTokens,
        currentContextTokens: contextPlan.estimatedInputTokens,
        remainingContextTokens: contextPlan.contextWindowTokens
          - contextPlan.estimatedInputTokens,
        maxOutputTokens: contextPlan.requestedOutputTokens,
        source: 'estimated',
      };
    });
    this.#startTurn(
      session.sessionId,
      retry,
      runLoop,
      contextPlan,
      abortController,
      streamBuffer,
    );
    return retry;
  }

  /** Start one Provider-selected RunLoop and retain its cancellation lifecycle. */
  #startTurn(
    sessionId: string,
    turn: AgentTurnSnapshot,
    runLoop: AgentRunLoop,
    contextPlan: AgentTurnContextPlan,
    abortController: AbortController,
    streamBuffer: AgentTurnStreamBuffer,
  ): void {
    const completion = this.#executeTurn(
      sessionId,
      turn,
      runLoop,
      contextPlan,
      abortController,
      streamBuffer,
    ).catch(() => undefined)
      .finally(() => {
        if (streamBuffer.flushTimer !== null) {
          clearTimeout(streamBuffer.flushTimer);
          streamBuffer.flushTimer = null;
        }
        this.#activeTurnsById.delete(turn.turnId);
      });
    this.#activeTurnsById.set(turn.turnId, {
      sessionId,
      turnId: turn.turnId,
      abortController,
      completion,
    });
  }

  /** Execute one complete RunLoop and persist its terminal state. */
  async #executeTurn(
    sessionId: string,
    turn: AgentTurnSnapshot,
    runLoop: AgentRunLoop,
    contextPlan: AgentTurnContextPlan,
    abortController: AbortController,
    streamBuffer: AgentTurnStreamBuffer,
  ): Promise<void> {
    try {
      const result = await runLoop.run({
        messages: contextPlan.messages,
        maxOutputTokens: contextPlan.requestedOutputTokens,
        abortSignal: abortController.signal,
      });
      if (result.outcome !== 'completed') {
        throw new Error('Agent Turn reached an unsupported suspended state.');
      }
      this.#flushStreamBuffer(streamBuffer);
      this.#commit(sessionId, turn.turnId, (next) => {
        const nextTurn = this.#mutableTurn(next, turn.turnId);
        nextTurn.status = 'completed';
        nextTurn.updatedAt = this.#now();
      });
    } catch (error) {
      const cancelled = abortController.signal.reason instanceof DOMException
        && abortController.signal.reason.name === 'AbortError';
      let terminalError = error;
      try {
        this.#flushStreamBuffer(streamBuffer);
      } catch (flushError) {
        terminalError = flushError;
      }
      try {
        this.#commit(sessionId, turn.turnId, (session) => {
          this.#settleTurn(session, turn, cancelled, terminalError);
        });
      } catch {
        this.#settleTurnInMemory(sessionId, turn, cancelled, terminalError);
      }
    }
  }

  /** Persist each visible text/reasoning delta before broadcasting it. */
  async #recordModelEvent(
    streamBuffer: AgentTurnStreamBuffer,
    event: AgentRunEvent,
  ): Promise<void> {
    if (event.type === 'model-call-started') {
      this.#startModelCall(streamBuffer, event.maxOutputTokens);
      return;
    }
    if (event.type === 'response-completed') {
      this.#flushStreamBuffer(streamBuffer);
      this.#recordCompletedModelCall(streamBuffer);
      streamBuffer.currentAssistantItemId = null;
      streamBuffer.usage = null;
      return;
    }
    if (event.type === 'usage') {
      streamBuffer.usage = { ...event.usage };
      return;
    }
    if (event.type === 'tool-call') {
      this.#recordToolCall(streamBuffer, event.toolCall);
      return;
    }
    if (event.type === 'tool-result') {
      this.#recordToolResult(streamBuffer, event.toolCall, event.result);
      return;
    }
    if (event.type !== 'text-delta' && event.type !== 'reasoning-delta') return;
    if (event.type === 'text-delta') {
      streamBuffer.text += event.delta;
    } else {
      streamBuffer.reasoning += event.delta;
    }
    if (streamBuffer.flushTimer === null) {
      streamBuffer.flushTimer = setTimeout(() => {
        streamBuffer.flushTimer = null;
        try {
          this.#flushStreamBuffer(streamBuffer);
        } catch (error) {
          streamBuffer.abortController.abort(error);
        }
      }, STREAM_FLUSH_INTERVAL_MS);
    }
  }

  /** Create one isolated delta buffer before a running Turn is persisted. */
  #streamBuffer(
    sessionId: string,
    turn: AgentTurnSnapshot,
    abortController: AbortController,
    contextPlan: AgentTurnContextPlan,
  ): AgentTurnStreamBuffer {
    return {
      sessionId,
      turn,
      abortController,
      contextPlan,
      currentAssistantItemId: null,
      currentMaxOutputTokens: contextPlan.requestedOutputTokens,
      text: '',
      reasoning: '',
      usage: null,
      flushTimer: null,
    };
  }

  /** Persist the assistant item owned by one new Model Call. */
  #startModelCall(streamBuffer: AgentTurnStreamBuffer, maxOutputTokens: number): void {
    if (streamBuffer.currentAssistantItemId !== null) {
      throw new Error('Agent Model Call started before the previous response completed.');
    }
    const assistantItemId = this.#createId();
    const createdAt = this.#now();
    this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
      session.items.push({
        kind: 'assistant-message',
        itemId: assistantItemId,
        turnId: streamBuffer.turn.turnId,
        content: '',
        reasoningContent: '',
        partial: true,
        createdAt,
      });
    });
    streamBuffer.currentAssistantItemId = assistantItemId;
    streamBuffer.currentMaxOutputTokens = maxOutputTokens;
  }

  /** Persist one model-authored Tool Call after any preceding assistant text. */
  #recordToolCall(
    streamBuffer: AgentTurnStreamBuffer,
    toolCall: Extract<AgentRunEvent, { type: 'tool-call' }>['toolCall'],
  ): void {
    this.#flushStreamBuffer(streamBuffer);
    this.#requireCurrentAssistantItemId(streamBuffer);
    const createdAt = this.#now();
    this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
      if (session.items.some((item) =>
        item.kind === 'tool-call'
        && item.turnId === streamBuffer.turn.turnId
        && item.callId === toolCall.id)) {
        throw new Error(`Agent Tool Call "${toolCall.id}" already exists.`);
      }
      session.items.push({
        kind: 'tool-call',
        itemId: this.#createId(),
        turnId: streamBuffer.turn.turnId,
        callId: toolCall.id,
        name: toolCall.name,
        arguments: structuredClone(toolCall.arguments),
        status: 'running',
        approval: null,
        createdAt,
      });
    });
  }

  /** Wait for one Session-owned decision before a change Tool executor runs. */
  #authorizeToolCall(
    streamBuffer: AgentTurnStreamBuffer,
    request: AgentToolAuthorizationRequest,
    context: ToolExecutionContext,
  ): Promise<AgentToolAuthorizationDecision> {
    if (this.#requireSession(streamBuffer.sessionId).toolExecutionMode === 'auto') {
      return Promise.resolve('allow');
    }
    context.abortSignal.throwIfAborted();
    const approvalId = this.#createId();
    return new Promise<AgentToolAuthorizationDecision>((resolve, reject) => {
      const onAbort = (): void => {
        const active = this.#activeToolApprovalsById.get(approvalId);
        if (active === undefined) return;
        this.#releaseToolApproval(active);
        reject(context.abortSignal.reason ?? new DOMException(
          'Agent Tool approval was cancelled.',
          'AbortError',
        ));
      };
      const active: ActiveAgentToolApproval = {
        approvalId,
        sessionId: streamBuffer.sessionId,
        turnId: streamBuffer.turn.turnId,
        callId: request.toolCall.id,
        abortSignal: context.abortSignal,
        onAbort,
        resolve,
        reject,
      };
      this.#activeToolApprovalsById.set(approvalId, active);
      context.abortSignal.addEventListener('abort', onAbort, { once: true });
      try {
        this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
          const call = session.items.find((item) => (
            item.kind === 'tool-call'
            && item.turnId === streamBuffer.turn.turnId
            && item.callId === request.toolCall.id
          ));
          if (call?.kind !== 'tool-call' || call.status !== 'running' || call.approval !== null) {
            throw new Error(`Agent Tool Call "${request.toolCall.id}" cannot request approval.`);
          }
          call.approval = {
            approvalId,
            status: 'pending',
            description: request.description,
            effect: request.effect,
          };
          this.#mutableTurn(session, streamBuffer.turn.turnId).status =
            'waiting-for-tool-approval';
        });
      } catch (error) {
        this.#releaseToolApproval(active);
        reject(error);
      }
    });
  }

  /** Persist one explicit decision before releasing the waiting RunLoop. */
  #decideToolCall(
    approvalId: string,
    decision: AgentToolAuthorizationDecision,
  ): AgentSessionSnapshot {
    this.#requireAcceptingCommands();
    const active = this.#activeToolApprovalsById.get(approvalId);
    if (active === undefined) {
      throw new Error('Agent Tool approval is not pending.');
    }
    const snapshot = this.#commit(active.sessionId, active.turnId, (session) => {
      const call = session.items.find((item) => (
        item.kind === 'tool-call'
        && item.turnId === active.turnId
        && item.callId === active.callId
      ));
      if (call?.kind !== 'tool-call'
        || call.approval?.approvalId !== approvalId
        || call.approval.status !== 'pending') {
        throw new Error('Agent Tool approval is not pending.');
      }
      call.approval = {
        ...call.approval,
        status: decision === 'allow' ? 'allowed' : 'denied',
      };
      const turn = this.#mutableTurn(session, active.turnId);
      turn.status = 'running';
      turn.updatedAt = this.#now();
    });
    this.#releaseToolApproval(active);
    active.resolve(decision);
    return snapshot;
  }

  /** Remove one resolved or cancelled approval and its abort listener. */
  #releaseToolApproval(active: ActiveAgentToolApproval): void {
    if (this.#activeToolApprovalsById.get(active.approvalId) !== active) return;
    this.#activeToolApprovalsById.delete(active.approvalId);
    active.abortSignal.removeEventListener('abort', active.onAbort);
  }

  /** Complete one Tool Call and append its correlated durable result atomically. */
  #recordToolResult(
    streamBuffer: AgentTurnStreamBuffer,
    toolCall: Extract<AgentRunEvent, { type: 'tool-result' }>['toolCall'],
    result: Extract<AgentRunEvent, { type: 'tool-result' }>['result'],
  ): void {
    const createdAt = this.#now();
    this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
      const call = session.items.find((item) =>
        item.kind === 'tool-call'
        && item.turnId === streamBuffer.turn.turnId
        && item.callId === toolCall.id);
      if (call?.kind !== 'tool-call' || call.status !== 'running') {
        throw new Error(`Agent Tool Call "${toolCall.id}" is not running.`);
      }
      call.status = result.ok ? 'completed' : 'failed';
      session.items.push({
        kind: 'tool-result',
        itemId: this.#createId(),
        turnId: streamBuffer.turn.turnId,
        callId: toolCall.id,
        name: toolCall.name,
        result: structuredClone(result),
        createdAt,
      });
    });
  }

  /** Persist one completed Model Call before the RunLoop starts any subsequent call. */
  #recordCompletedModelCall(streamBuffer: AgentTurnStreamBuffer): void {
    const usage = streamBuffer.usage;
    const contextPlan = streamBuffer.contextPlan;
    const assistantItemId = this.#requireCurrentAssistantItemId(streamBuffer);
    this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
      this.#mutableAssistant(session, assistantItemId).partial = false;
      session.modelCalls.push({
        modelCallId: this.#createId(),
        turnId: streamBuffer.turn.turnId,
        providerId: contextPlan.providerId,
        modelId: contextPlan.modelId,
        usage: usage === null ? {} : { ...usage },
        contextWindowTokens: contextPlan.contextWindowTokens,
        maxOutputTokens: streamBuffer.currentMaxOutputTokens,
        createdAt: this.#now(),
      });
      const currentContextTokens = usage?.inputTokens ?? null;
      session.contextUsage = {
        contextWindowTokens: contextPlan.contextWindowTokens,
        currentContextTokens,
        remainingContextTokens: currentContextTokens === null
          ? null
          : Math.max(0, contextPlan.contextWindowTokens - currentContextTokens),
        maxOutputTokens: streamBuffer.currentMaxOutputTokens,
        source: currentContextTokens === null ? 'unavailable' : 'provider',
      };
    });
  }

  /** Atomically persist the currently buffered text and reasoning deltas. */
  #flushStreamBuffer(streamBuffer: AgentTurnStreamBuffer): void {
    if (streamBuffer.flushTimer !== null) {
      clearTimeout(streamBuffer.flushTimer);
      streamBuffer.flushTimer = null;
    }
    const text = streamBuffer.text;
    const reasoning = streamBuffer.reasoning;
    if (text === '' && reasoning === '') return;
    const assistantItemId = this.#requireCurrentAssistantItemId(streamBuffer);
    streamBuffer.text = '';
    streamBuffer.reasoning = '';
    try {
      const session = this.#requireSession(streamBuffer.sessionId);
      const assistant = this.#mutableAssistant(session, assistantItemId);
      const updatedAt = this.#now();
      const sequence = session.sequence + 1;
      this.#sessionStore.appendAssistantDelta({
        sessionId: session.sessionId,
        assistantItemId: assistant.itemId,
        textDelta: text,
        reasoningDelta: reasoning,
        updatedAt,
        sequence,
      });
      assistant.content += text;
      assistant.reasoningContent += reasoning;
      session.sequence = sequence;
      session.updatedAt = updatedAt;
      this.#emit({
        type: 'assistant-delta',
        sessionId: session.sessionId,
        turnId: streamBuffer.turn.turnId,
        assistantItemId,
        textDelta: text,
        reasoningDelta: reasoning,
        updatedAt,
        sequence,
      });
    } catch (error) {
      streamBuffer.text = text + streamBuffer.text;
      streamBuffer.reasoning = reasoning + streamBuffer.reasoning;
      throw error;
    }
  }

  /** Require the assistant currently owned by the active Model Call. */
  #requireCurrentAssistantItemId(streamBuffer: AgentTurnStreamBuffer): string {
    if (streamBuffer.currentAssistantItemId === null) {
      throw new Error('Agent Model event arrived without an active Model Call.');
    }
    return streamBuffer.currentAssistantItemId;
  }

  /** Apply one terminal Turn state to a mutable Session record. */
  #settleTurn(
    session: StoredAgentSession,
    turn: AgentTurnSnapshot,
    cancelled: boolean,
    error: unknown,
  ): void {
    const nextTurn = this.#mutableTurn(session, turn.turnId);
    nextTurn.status = cancelled ? 'cancelled' : 'failed';
    nextTurn.updatedAt = this.#now();
    nextTurn.error = cancelled ? null : {
      code: error instanceof Error ? error.name : 'AgentTurnError',
      message: error instanceof Error ? error.message : String(error),
    };
    this.#failRunningToolCalls(session, turn.turnId, cancelled
      ? {
          code: 'tool_cancelled',
          message: 'Tool execution was cancelled before a result was recorded.',
        }
      : {
          code: 'tool_failed',
          message: 'Tool execution failed before a result was recorded.',
        });
  }

  /** Settle in memory when storage is unavailable, without emitting a non-durable event. */
  #settleTurnInMemory(
    sessionId: string,
    turn: AgentTurnSnapshot,
    cancelled: boolean,
    error: unknown,
  ): void {
    const current = this.#sessionsById.get(sessionId);
    if (current === undefined) return;
    const next = structuredClone(current);
    this.#settleTurn(next, turn, cancelled, error);
    this.#sessionsById.set(sessionId, next);
  }

  /** Build Provider-neutral history without incomplete assistant attempts. */
  #modelMessages(session: StoredAgentSession): AgentMessage[] {
    const messages: AgentMessage[] = [];
    const includedToolCallIds = new Set<string>();
    for (let index = 0; index < session.items.length; index += 1) {
      const item = session.items[index]!;
      if (item.kind === 'user-message') {
        messages.push({ role: 'user', content: item.content });
        continue;
      }
      if (item.kind === 'assistant-message' && !item.partial) {
        const toolCalls = [];
        let nextIndex = index + 1;
        while (nextIndex < session.items.length) {
          const nextItem = session.items[nextIndex]!;
          if (nextItem.kind !== 'tool-call' || nextItem.turnId !== item.turnId) break;
          toolCalls.push(nextItem);
          nextIndex += 1;
        }
        const resultCallIds = new Set<string>();
        while (nextIndex < session.items.length) {
          const nextItem = session.items[nextIndex]!;
          if (nextItem.kind !== 'tool-result' || nextItem.turnId !== item.turnId) break;
          resultCallIds.add(nextItem.callId);
          nextIndex += 1;
        }
        if (toolCalls.some((toolCall) =>
          toolCall.status === 'running' || !resultCallIds.has(toolCall.callId))) {
          continue;
        }
        for (const toolCall of toolCalls) includedToolCallIds.add(toolCall.callId);
        messages.push({
          role: 'assistant',
          content: item.content,
          ...(item.reasoningContent === ''
            ? {}
            : { reasoningContent: item.reasoningContent }),
          toolCalls: toolCalls.map((toolCall) => ({
            id: toolCall.callId,
            name: toolCall.name,
            arguments: structuredClone(toolCall.arguments),
          })),
        });
        continue;
      }
      if (item.kind === 'tool-result' && includedToolCallIds.has(item.callId)) {
        messages.push({
          role: 'tool',
          toolCallId: item.callId,
          name: item.name,
          content: JSON.stringify(item.result),
        });
      }
    }
    return messages;
  }

  /** Resolve and freeze one Session's configured model before persisting a running Turn. */
  #resolveSessionModel(sessionId: string): ResolvedSessionModel {
    const session = this.#requireSession(sessionId);
    const model = this.#getModels().models.find((entry) => entry.providerId === session.providerId);
    if (model === undefined) {
      throw new Error('Agent Provider does not exist.');
    }
    return {
      providerId: model.providerId,
      modelId: model.modelId,
      contextWindowTokens: model.contextWindowTokens,
      maximumOutputTokens: model.maximumOutputTokens,
    };
  }

  /** Build a conservative Context budget before any running Turn is persisted. */
  #planTurnContext(
    model: ResolvedSessionModel,
    messages: readonly AgentMessage[],
  ): AgentTurnContextPlan {
    const estimatedInputTokens = messages.reduce((total, message) => {
      const contentBytes = message.role === 'assistant'
        ? Buffer.byteLength(message.content)
          + Buffer.byteLength(message.reasoningContent ?? '')
          + Buffer.byteLength(JSON.stringify(message.toolCalls))
        : message.role === 'tool'
          ? Buffer.byteLength(message.content) + Buffer.byteLength(message.name)
          : Buffer.byteLength(message.content);
      return total + contentBytes + 64;
    }, 0);
    const remainingContextTokens = model.contextWindowTokens - estimatedInputTokens;
    if (remainingContextTokens <= 0) {
      throw new Error('Agent message exceeds the model Context Window.');
    }
    return {
      ...model,
      messages: messages.map((message) => structuredClone(message)),
      estimatedInputTokens,
      requestedOutputTokens: Math.min(
        model.maximumOutputTokens,
        remainingContextTokens,
      ),
    };
  }

  /** Commit one mutation, sequence it, encrypt it and then emit its snapshot. */
  #commit(
    sessionId: string,
    turnId: string | null,
    mutate: (session: StoredAgentSession) => void,
  ): AgentSessionSnapshot {
    const session = structuredClone(this.#requireSession(sessionId));
    mutate(session);
    session.sequence += 1;
    session.updatedAt = this.#now();
    this.#sessionStore.replace(session);
    this.#sessionsById.set(sessionId, session);
    const snapshot = this.#snapshot(session);
    this.#emit({
      type: 'session-updated',
      sessionId,
      turnId,
      sequence: session.sequence,
      snapshot,
    });
    return snapshot;
  }

  /** Emit one already persisted event without letting listeners break Runtime. */
  #emit(event: AgentRuntimeEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        continue;
      }
    }
  }

  /** Produce a detached Renderer-safe Session snapshot. */
  #snapshot(session: StoredAgentSession): AgentSessionSnapshot {
    const turns = session.turns.map((turn) => structuredClone(turn));
    return {
      sessionId: session.sessionId,
      summary: this.#summary(session),
      items: session.items.map((item) => structuredClone(item)),
      turns,
      currentTurn: turns.at(-1) ?? null,
      usage: this.#usage(session.modelCalls),
      contextUsage: { ...session.contextUsage },
      toolExecutionMode: session.toolExecutionMode,
      sequence: session.sequence,
    };
  }

  /** Produce one detached Chat selector summary. */
  #summary(session: StoredAgentSession): AgentSessionSummary {
    return {
      sessionId: session.sessionId,
      title: session.title,
      providerId: session.providerId,
      modelId: session.modelId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      itemCount: session.items.length,
    };
  }

  /** Aggregate exact Provider Usage and weighted cache metrics. */
  #usage(modelCalls: readonly StoredAgentModelCall[]): AgentSessionUsage {
    const exactSum = (
      read: (modelCall: StoredAgentModelCall) => number | undefined,
    ): number | null => {
      if (modelCalls.length === 0) return 0;
      const values = modelCalls.map(read);
      return values.every((value) => value !== undefined)
        ? values.reduce<number>((total, value) => total + value!, 0)
        : null;
    };
    const inputTokens = exactSum((modelCall) => modelCall.usage.inputTokens);
    const cacheReportedCalls = modelCalls.filter((modelCall) =>
      modelCall.usage.cacheHitInputTokens !== undefined
      && modelCall.usage.cacheMissInputTokens !== undefined);
    const cacheHitInputTokens = modelCalls.length === 0
      ? 0
      : cacheReportedCalls.length === 0
        ? null
        : cacheReportedCalls.reduce(
            (total, modelCall) => total + modelCall.usage.cacheHitInputTokens!,
            0,
          );
    const cacheMissInputTokens = modelCalls.length === 0
      ? 0
      : cacheReportedCalls.length === 0
        ? null
        : cacheReportedCalls.reduce(
            (total, modelCall) => total + modelCall.usage.cacheMissInputTokens!,
            0,
          );
    const cacheReportedInputTokens = cacheHitInputTokens === null
      || cacheMissInputTokens === null
      ? null
      : cacheHitInputTokens + cacheMissInputTokens;
    return {
      modelCallCount: modelCalls.length,
      inputTokens,
      outputTokens: exactSum((modelCall) => modelCall.usage.outputTokens),
      totalTokens: exactSum((modelCall) => modelCall.usage.totalTokens),
      cacheHitInputTokens,
      cacheMissInputTokens,
      cacheHitRate: cacheReportedInputTokens === null || cacheReportedInputTokens === 0
        ? null
        : cacheHitInputTokens! / cacheReportedInputTokens,
      cacheMetricsCoverage: inputTokens === null
        || inputTokens === 0
        || cacheReportedInputTokens === null
        || cacheReportedInputTokens === 0
        ? null
        : cacheReportedInputTokens / inputTokens,
    };
  }

  /** Convert crash-left running Turns into durable retryable failures. */
  #settleInterruptedTurns(session: StoredAgentSession): StoredAgentSession {
    if (!session.turns.some((turn) => (
      turn.status === 'running' || turn.status === 'waiting-for-tool-approval'
    ))) {
      return session;
    }
    const next = structuredClone(session);
    const now = this.#now();
    for (const turn of next.turns) {
      if (turn.status !== 'running' && turn.status !== 'waiting-for-tool-approval') continue;
      turn.status = 'failed';
      turn.updatedAt = now;
      turn.error = {
        code: 'AgentTurnInterrupted',
        message: 'The application exited before this response completed.',
      };
      this.#failRunningToolCalls(next, turn.turnId, {
        code: 'tool_interrupted',
        message: 'The application exited before the Tool result was recorded.',
      });
    }
    next.sequence += 1;
    next.updatedAt = now;
    return next;
  }

  /** Complete Tool protocol pairs locally when their Turn terminates before a Result. */
  #failRunningToolCalls(
    session: StoredAgentSession,
    turnId: string,
    error: { readonly code: string; readonly message: string },
  ): void {
    const calls = session.items.filter((item): item is StoredAgentToolCallItem => (
      item.kind === 'tool-call' && item.turnId === turnId && item.status === 'running'
    ));
    for (const call of calls) {
      call.status = 'failed';
      if (call.approval?.status === 'pending') {
        call.approval = { ...call.approval, status: 'cancelled' };
      }
      session.items.push({
        kind: 'tool-result',
        itemId: this.#createId(),
        turnId,
        callId: call.callId,
        name: call.name,
        result: { ok: false, error: { ...error } },
        createdAt: this.#now(),
      });
    }
  }

  /** Return one mutable Turn inside a cloned Session. */
  #mutableTurn(session: StoredAgentSession, turnId: string): StoredAgentTurn {
    const turn = session.turns.find((entry) => entry.turnId === turnId);
    if (turn === undefined) {
      throw new Error('Agent Turn does not exist.');
    }
    return turn;
  }

  /** Return one mutable assistant Item inside a cloned Session. */
  #mutableAssistant(session: StoredAgentSession, itemId: string): StoredAgentAssistantItem {
    const item = session.items.find((entry) => entry.itemId === itemId);
    if (item?.kind !== 'assistant-message') {
      throw new Error('Agent assistant Item does not exist.');
    }
    return item;
  }

  /** Reject any second active Turn for the same Session. */
  #requireNoActiveTurn(sessionId: string): void {
    this.#requireSession(sessionId);
    if ([...this.#activeTurnsById.values()].some((turn) => turn.sessionId === sessionId)) {
      throw new Error('Agent Session already has an active Turn.');
    }
  }

  /** Find one Turn across the Runtime-owned Session set. */
  #findTurn(turnId: string): AgentTurnSnapshot {
    for (const session of this.#sessionsById.values()) {
      const turn = session.turns.find((entry) => entry.turnId === turnId);
      if (turn !== undefined) {
        return structuredClone(turn);
      }
    }
    throw new Error('Agent Turn does not exist.');
  }

  /** Require one Session from the live in-memory owner. */
  #requireSession(sessionId: string): StoredAgentSession {
    this.#requireRunning();
    if (!this.#storageAvailable) {
      throw new Error('OS secure storage is unavailable.');
    }
    const session = this.#sessionsById.get(sessionId);
    if (session === undefined) {
      throw new Error('Agent Session does not exist.');
    }
    return session;
  }

  /** Require the Session service lifecycle. */
  #requireRunning(): void {
    if (!this.#running) {
      throw new Error('Agent Session service is not running.');
    }
  }

  /** Reject new public commands after shutdown starts while internal cleanup continues. */
  #requireAcceptingCommands(): void {
    this.#requireRunning();
    if (!this.#acceptingCommands) {
      throw new Error('Agent Session service is not accepting commands.');
    }
  }

  #requireStableModelConfiguration(): void {
    if (this.#modelConfigurationChanging) {
      throw new Error('Agent model configuration is changing.');
    }
  }
}
