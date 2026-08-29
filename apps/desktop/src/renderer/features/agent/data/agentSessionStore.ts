import { create } from 'zustand';

import type {
  AgentRuntimeEvent,
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
} from '../../../../shared/desktop-api';

interface AgentSessionState {
  readonly sessions: AgentSessionsSnapshot | null;
  readonly currentSession: AgentSessionSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  setSessions(sessions: AgentSessionsSnapshot): void;
  setCurrentSession(session: AgentSessionSnapshot | null): void;
  setLoading(loading: boolean): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
}

/** Owns Renderer-visible Session list, current Transcript and command state. */
export const useAgentSessionStore = create<AgentSessionState>((set) => ({
  sessions: null,
  currentSession: null,
  loading: false,
  busy: false,
  error: null,
  setSessions: (sessions) => set({ sessions, error: null }),
  setCurrentSession: (currentSession) => set({ currentSession, error: null }),
  setLoading: (loading) => set({ loading }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

/** Routes Session intents and reconciles ordered Runtime snapshots. */
export class AgentSessionActions {
  static #selectionGeneration = 0;

  /** Subscribe before initial load so no durable Runtime event can be missed. */
  static subscribe(): () => void {
    let active = true;
    const unsubscribe = window.interceptor.onAgentSessionEvent((event) => {
      if (active) {
        this.acceptEvent(event);
      }
    });
    void this.load().catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }

  /** Load Session selector state and its current complete Transcript. */
  static async load(): Promise<void> {
    const selectionGeneration = ++this.#selectionGeneration;
    const store = useAgentSessionStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const sessions = await window.interceptor.listAgentSessions();
      if (selectionGeneration !== this.#selectionGeneration) return;
      store.setSessions(sessions);
      const currentSession = sessions.currentSessionId === null
        ? null
        : await window.interceptor.getAgentSession(sessions.currentSessionId);
      if (selectionGeneration !== this.#selectionGeneration
        || useAgentSessionStore.getState().sessions?.currentSessionId
          !== sessions.currentSessionId) {
        return;
      }
      const latest = useAgentSessionStore.getState().currentSession;
      if (currentSession === null
        || latest === null
        || latest.sessionId !== currentSession.sessionId
        || latest.sequence <= currentSession.sequence) {
        useAgentSessionStore.getState().setCurrentSession(currentSession);
      }
    } catch (error) {
      store.setError(this.describeError(error));
      throw error;
    } finally {
      useAgentSessionStore.getState().setLoading(false);
    }
  }

  /** Accept one ordered durable event or reload after a detected sequence gap. */
  static acceptEvent(event: AgentRuntimeEvent): void {
    const store = useAgentSessionStore.getState();
    const current = store.currentSession;
    if (event.type === 'session-updated') {
      this.mergeSummary(event.snapshot);
    }
    if (store.sessions?.currentSessionId !== event.sessionId
      && current?.sessionId !== event.sessionId) {
      return;
    }
    if (current === null || current.sessionId !== event.sessionId) {
      if (event.type === 'session-updated') {
        store.setCurrentSession(event.snapshot);
      } else {
        this.reloadAfterSequenceGap(event.sessionId);
      }
      return;
    }
    if (event.sequence <= current.sequence) {
      return;
    }
    if (event.sequence === current.sequence + 1) {
      if (event.type === 'session-updated') {
        store.setCurrentSession(event.snapshot);
      } else {
        const assistant = current.items.find(
          (item) => item.kind === 'assistant-message'
            && item.itemId === event.assistantItemId,
        );
        if (assistant?.kind !== 'assistant-message') {
          this.reloadAfterSequenceGap(event.sessionId);
          return;
        }
        const snapshot = {
          ...current,
          sequence: event.sequence,
          summary: { ...current.summary, updatedAt: event.updatedAt },
          items: current.items.map((item) =>
            item.kind === 'assistant-message' && item.itemId === event.assistantItemId
              ? {
                  ...item,
                  content: item.content + event.textDelta,
                  reasoningContent: item.reasoningContent + event.reasoningDelta,
                }
              : item),
        };
        store.setCurrentSession(snapshot);
        this.mergeSummary(snapshot);
      }
      return;
    }
    this.reloadAfterSequenceGap(event.sessionId);
  }

  /** Reload one complete snapshot after a missing or unapplicable incremental event. */
  private static reloadAfterSequenceGap(sessionId: string): void {
    const selectionGeneration = this.#selectionGeneration;
    void window.interceptor.getAgentSession(sessionId)
      .then((snapshot) => {
        if (selectionGeneration !== this.#selectionGeneration
          || useAgentSessionStore.getState().sessions?.currentSessionId
            !== sessionId) {
          return;
        }
        const latest = useAgentSessionStore.getState().currentSession;
        if (latest?.sessionId === snapshot.sessionId
          && latest.sequence > snapshot.sequence) {
          return;
        }
        useAgentSessionStore.getState().setCurrentSession(snapshot);
        this.mergeSummary(snapshot);
      })
      .catch((error: unknown) => {
        useAgentSessionStore.getState().setError(this.describeError(error));
      });
  }

  /** Create and select one empty Chat. */
  static async create(): Promise<void> {
    const selectionGeneration = ++this.#selectionGeneration;
    await this.run(async () => {
      const session = await window.interceptor.createAgentSession();
      if (selectionGeneration !== this.#selectionGeneration) return;
      useAgentSessionStore.getState().setCurrentSession(session);
      useAgentSessionStore.getState().setSessions(await window.interceptor.listAgentSessions());
    });
  }

  /** Select one existing Chat and load its complete snapshot. */
  static async select(sessionId: string): Promise<void> {
    const selectionGeneration = ++this.#selectionGeneration;
    await this.run(async () => {
      const session = await window.interceptor.selectAgentSession(sessionId);
      if (selectionGeneration !== this.#selectionGeneration) return;
      useAgentSessionStore.getState().setCurrentSession(session);
      const sessions = useAgentSessionStore.getState().sessions;
      if (sessions !== null) {
        useAgentSessionStore.getState().setSessions({
          ...sessions,
          currentSessionId: sessionId,
        });
      }
    });
  }

  /** Rename the current Chat. */
  static async rename(title: string): Promise<void> {
    const sessionId = this.requireCurrentSessionId();
    await this.run(async () => {
      const session = await window.interceptor.renameAgentSession(sessionId, title);
      useAgentSessionStore.getState().setCurrentSession(session);
      this.mergeSummary(session);
    });
  }

  /** Delete the current Chat and load Runtime's fallback selection. */
  static async deleteCurrent(): Promise<void> {
    const sessionId = this.requireCurrentSessionId();
    const selectionGeneration = ++this.#selectionGeneration;
    await this.run(async () => {
      const sessions = await window.interceptor.deleteAgentSession(sessionId);
      if (selectionGeneration !== this.#selectionGeneration) return;
      useAgentSessionStore.getState().setSessions(sessions);
      const session = sessions.currentSessionId === null
        ? null
        : await window.interceptor.getAgentSession(sessions.currentSessionId);
      useAgentSessionStore.getState().setCurrentSession(session);
    });
  }

  /** Select a configured model for future Turns in the current Chat. */
  static async setModel(providerId: string): Promise<void> {
    const sessionId = this.requireCurrentSessionId();
    await this.run(async () => {
      const session = await window.interceptor.setAgentSessionModel(sessionId, providerId);
      useAgentSessionStore.getState().setCurrentSession(session);
      this.mergeSummary(session);
    });
  }

  /** Send one user-authored message; Streaming snapshots arrive through events. */
  static async send(content: string): Promise<void> {
    const sessionId = this.requireCurrentSessionId();
    await this.run(async () => {
      await window.interceptor.sendAgentMessage(sessionId, content);
    });
  }

  /** Stop one active Turn after Runtime persists cancellation. */
  static async cancel(turnId: string): Promise<void> {
    await this.run(async () => {
      await window.interceptor.cancelAgentTurn(turnId);
    });
  }

  /** Retry one failed/cancelled Turn without appending another user Item. */
  static async retry(turnId: string): Promise<void> {
    await this.run(async () => {
      await window.interceptor.retryAgentTurn(turnId);
    });
  }

  /** Execute one Session command under the shared intent busy state. */
  private static async run(operation: () => Promise<void>): Promise<void> {
    const store = useAgentSessionStore.getState();
    if (store.busy) {
      throw new Error('Another Agent Session operation is already running.');
    }
    store.setBusy(true);
    store.setError(null);
    try {
      await operation();
    } catch (error) {
      store.setError(this.describeError(error));
      throw error;
    } finally {
      useAgentSessionStore.getState().setBusy(false);
    }
  }

  /** Merge one Session summary without reordering Runtime's selector list. */
  private static mergeSummary(snapshot: AgentSessionSnapshot): void {
    const sessions = useAgentSessionStore.getState().sessions;
    if (sessions === null) return;
    useAgentSessionStore.getState().setSessions({
      ...sessions,
      sessions: sessions.sessions.map((summary) =>
        summary.sessionId === snapshot.sessionId ? snapshot.summary : summary),
    });
  }

  /** Require the explicit current Session for a Chat command. */
  private static requireCurrentSessionId(): string {
    const sessionId = useAgentSessionStore.getState().currentSession?.sessionId;
    if (sessionId === undefined) {
      throw new Error('No Agent Session is selected.');
    }
    return sessionId;
  }

  /** Convert unknown IPC failures to bounded UI text. */
  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
