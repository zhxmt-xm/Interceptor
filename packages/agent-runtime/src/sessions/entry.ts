import type {
  AgentContextUsage,
  AgentMessage,
  AgentModelsSnapshot,
  AgentRuntimeEvent,
  AgentRuntimeEventListener,
  AgentSecureStore,
  AgentSessionSnapshot,
  AgentSessionSummary,
  AgentSessionsSnapshot,
  AgentSessionUsage,
  AgentTranscriptItem,
  AgentTurnSnapshot,
  ModelUsage,
  ModelStreamEvent,
} from '../interfaces';
import type { AgentRunLoop } from '../agent/entry';
import { AgentSessionStore } from './internal/session-store';
import { AgentSessionStoreCorruptionError } from './internal/errors';
import type {
  StoredAgentAssistantItem,
  StoredAgentModelCall,
  StoredAgentSession,
  StoredAgentTurn,
} from './interfaces';

interface ActiveAgentTurn {
  readonly sessionId: string;
  readonly turnId: string;
  readonly abortController: AbortController;
  readonly completion: Promise<void>;
}

interface AgentTurnStreamBuffer {
  readonly sessionId: string;
  readonly turn: AgentTurnSnapshot;
  readonly abortController: AbortController;
  readonly contextPlan: AgentTurnContextPlan;
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
    onModelStreamEvent: (event: ModelStreamEvent) => Promise<void>,
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
  readonly #listeners = new Set<AgentRuntimeEventListener>();
  #running = false;
  #acceptingCommands = false;
  #storageAvailable = false;

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
      version: 1,
      sessionId: this.#createId(),
      title: 'New chat',
      providerId,
      modelId: model.modelId,
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
    const assistantItemId = this.#createId();
    const turn: AgentTurnSnapshot = {
      turnId,
      userItemId,
      assistantItemId,
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
    );
    this.#commit(sessionId, turnId, (session) => {
      session.items.push({
        kind: 'user-message',
        itemId: userItemId,
        turnId,
        content,
        createdAt: now,
      });
      session.items.push({
        kind: 'assistant-message',
        itemId: assistantItemId,
        turnId,
        content: '',
        reasoningContent: '',
        partial: true,
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
      assistantItemId: this.#createId(),
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
    );
    this.#commit(session.sessionId, retry.turnId, (next) => {
      next.items.push({
        kind: 'assistant-message',
        itemId: retry.assistantItemId,
        turnId: retry.turnId,
        content: '',
        reasoningContent: '',
        partial: true,
        createdAt: now,
      });
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
      const session = this.#requireSession(sessionId);
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
        const assistant = this.#mutableAssistant(next, turn.assistantItemId);
        assistant.partial = false;
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
    event: ModelStreamEvent,
  ): Promise<void> {
    if (event.type === 'response-completed') {
      this.#flushStreamBuffer(streamBuffer);
      this.#recordCompletedModelCall(streamBuffer);
      streamBuffer.usage = null;
      return;
    }
    if (event.type === 'usage') {
      streamBuffer.usage = { ...event.usage };
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
      text: '',
      reasoning: '',
      usage: null,
      flushTimer: null,
    };
  }

  /** Persist one completed Model Call before the RunLoop starts any subsequent call. */
  #recordCompletedModelCall(streamBuffer: AgentTurnStreamBuffer): void {
    const usage = streamBuffer.usage;
    const contextPlan = streamBuffer.contextPlan;
    this.#commit(streamBuffer.sessionId, streamBuffer.turn.turnId, (session) => {
      session.modelCalls.push({
        modelCallId: this.#createId(),
        turnId: streamBuffer.turn.turnId,
        providerId: contextPlan.providerId,
        modelId: contextPlan.modelId,
        usage: usage === null ? {} : { ...usage },
        contextWindowTokens: contextPlan.contextWindowTokens,
        maxOutputTokens: contextPlan.requestedOutputTokens,
        createdAt: this.#now(),
      });
      const currentContextTokens = usage?.inputTokens ?? null;
      session.contextUsage = {
        contextWindowTokens: contextPlan.contextWindowTokens,
        currentContextTokens,
        remainingContextTokens: currentContextTokens === null
          ? null
          : Math.max(0, contextPlan.contextWindowTokens - currentContextTokens),
        maxOutputTokens: contextPlan.requestedOutputTokens,
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
    streamBuffer.text = '';
    streamBuffer.reasoning = '';
    try {
      const session = this.#requireSession(streamBuffer.sessionId);
      const assistant = this.#mutableAssistant(
        session,
        streamBuffer.turn.assistantItemId,
      );
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
        assistantItemId: streamBuffer.turn.assistantItemId,
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
    this.#mutableAssistant(session, turn.assistantItemId).partial = true;
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
    for (const item of session.items) {
      if (item.kind === 'user-message') {
        messages.push({ role: 'user', content: item.content });
        continue;
      }
      if (!item.partial) {
        messages.push({
          role: 'assistant',
          content: item.content,
          ...(item.reasoningContent === ''
            ? {}
            : { reasoningContent: item.reasoningContent }),
          toolCalls: [],
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
    if (!session.turns.some((turn) => turn.status === 'running')) {
      return session;
    }
    const next = structuredClone(session);
    const now = this.#now();
    for (const turn of next.turns) {
      if (turn.status !== 'running') continue;
      turn.status = 'failed';
      turn.updatedAt = now;
      turn.error = {
        code: 'AgentTurnInterrupted',
        message: 'The application exited before this response completed.',
      };
      this.#mutableAssistant(next, turn.assistantItemId).partial = true;
    }
    next.sequence += 1;
    next.updatedAt = now;
    return next;
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
}
