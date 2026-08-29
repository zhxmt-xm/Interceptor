import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentRuntimeEvent,
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  AgentTurnSnapshot,
  InterceptorDesktopApi,
} from '../../../../../shared/desktop-api';
import { AgentSessionActions, useAgentSessionStore } from '../../data/agentSessionStore';

const summary = {
  sessionId: 'session-1',
  title: 'New chat',
  providerId: 'provider-1',
  modelId: 'model-1',
  createdAt: 1,
  updatedAt: 1,
  itemCount: 0,
};

const emptySession: AgentSessionSnapshot = {
  sessionId: 'session-1',
  summary,
  items: [],
  turns: [],
  currentTurn: null,
  usage: {
    modelCallCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: 0,
    cacheHitRate: null,
    cacheMetricsCoverage: null,
  },
  contextUsage: {
    contextWindowTokens: 131_072,
    currentContextTokens: null,
    remainingContextTokens: null,
    maxOutputTokens: 8_192,
    source: 'unavailable',
  },
  sequence: 0,
};

const sessions: AgentSessionsSnapshot = {
  currentSessionId: 'session-1',
  sessions: [summary],
};

const secondSummary = { ...summary, sessionId: 'session-2', title: 'Second chat' };
const secondSession: AgentSessionSnapshot = {
  ...emptySession,
  sessionId: 'session-2',
  summary: secondSummary,
};

const runningTurn: AgentTurnSnapshot = {
  turnId: 'turn-1',
  userItemId: 'user-1',
  assistantItemId: 'assistant-1',
  status: 'running',
  retryOfTurnId: null,
  error: null,
  createdAt: 2,
  updatedAt: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
  useAgentSessionStore.setState({
    sessions: null,
    currentSession: null,
    loading: false,
    busy: false,
    error: null,
  });
});

describe('AgentSessionActions', () => {
  it('subscribes before loading and restores the current Session snapshot', async () => {
    let listener: (event: AgentRuntimeEvent) => void = () => undefined;
    const unsubscribe = vi.fn();
    const interceptor = {
      onAgentSessionEvent: vi.fn((nextListener) => {
        listener = nextListener;
        return unsubscribe;
      }),
      listAgentSessions: vi.fn(async () => sessions),
      getAgentSession: vi.fn(async () => emptySession),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    const stop = AgentSessionActions.subscribe();
    await vi.waitFor(() => {
      expect(useAgentSessionStore.getState().currentSession).toEqual(emptySession);
    });

    const streamed: AgentSessionSnapshot = {
      ...emptySession,
      sequence: 1,
      summary: { ...summary, itemCount: 2, updatedAt: 3 },
      items: [
        { kind: 'user-message', itemId: 'user-1', turnId: 'turn-1', content: 'hello', createdAt: 2 },
        { kind: 'assistant-message', itemId: 'assistant-1', turnId: 'turn-1', content: 'Hel', reasoningContent: '', partial: true, createdAt: 2 },
      ],
      turns: [runningTurn],
      currentTurn: runningTurn,
    };
    listener(event(streamed));

    expect(useAgentSessionStore.getState().currentSession).toEqual(streamed);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores stale events and reloads a complete snapshot after a sequence gap', async () => {
    const current = { ...emptySession, sequence: 2 };
    const recovered = { ...emptySession, sequence: 5 };
    const interceptor = {
      getAgentSession: vi.fn(async () => recovered),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({ sessions, currentSession: current });

    AgentSessionActions.acceptEvent(event({ ...emptySession, sequence: 1 }));
    expect(useAgentSessionStore.getState().currentSession?.sequence).toBe(2);
    AgentSessionActions.acceptEvent(event({ ...emptySession, sequence: 4 }));

    await vi.waitFor(() => {
      expect(useAgentSessionStore.getState().currentSession).toEqual(recovered);
    });
    expect(interceptor.getAgentSession).toHaveBeenCalledWith('session-1');
  });

  it('appends one persisted assistant delta without replacing the full snapshot', () => {
    const current: AgentSessionSnapshot = {
      ...emptySession,
      sequence: 1,
      items: [
        { kind: 'user-message', itemId: 'user-1', turnId: 'turn-1', content: 'hello', createdAt: 1 },
        { kind: 'assistant-message', itemId: 'assistant-1', turnId: 'turn-1', content: 'Hel', reasoningContent: 'Why', partial: true, createdAt: 2 },
      ],
    };
    useAgentSessionStore.setState({ sessions, currentSession: current });

    AgentSessionActions.acceptEvent({
      type: 'assistant-delta',
      sessionId: 'session-1',
      turnId: 'turn-1',
      assistantItemId: 'assistant-1',
      textDelta: 'lo',
      reasoningDelta: ' now',
      updatedAt: 3,
      sequence: 2,
    });

    expect(useAgentSessionStore.getState().currentSession).toMatchObject({
      sequence: 2,
      items: [
        { kind: 'user-message', content: 'hello' },
        { kind: 'assistant-message', content: 'Hello', reasoningContent: 'Why now' },
      ],
    });
  });

  it('does not let an older initial load overwrite a newer Runtime event', async () => {
    let listener: (event: AgentRuntimeEvent) => void = () => undefined;
    let resolveSession!: (session: AgentSessionSnapshot) => void;
    const loaded = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveSession = resolve;
    });
    const interceptor = {
      onAgentSessionEvent: vi.fn((nextListener) => {
        listener = nextListener;
        return () => undefined;
      }),
      listAgentSessions: vi.fn(async () => sessions),
      getAgentSession: vi.fn(async () => loaded),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    const stop = AgentSessionActions.subscribe();
    await vi.waitFor(() => expect(interceptor.getAgentSession).toHaveBeenCalledOnce());
    const newer = { ...emptySession, sequence: 2 };

    listener(event(newer));
    resolveSession({ ...emptySession, sequence: 1 });

    await vi.waitFor(() => {
      expect(useAgentSessionStore.getState().loading).toBe(false);
    });
    expect(useAgentSessionStore.getState().currentSession?.sequence).toBe(2);
    stop();
  });

  it('does not let an initial load switch back after the user selects another Chat', async () => {
    let resolveFirst!: (session: AgentSessionSnapshot) => void;
    const first = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveFirst = resolve;
    });
    const interceptor = {
      onAgentSessionEvent: vi.fn(() => () => undefined),
      listAgentSessions: vi.fn(async () => ({
        currentSessionId: 'session-1',
        sessions: [summary, secondSummary],
      })),
      getAgentSession: vi.fn(async () => first),
      selectAgentSession: vi.fn(async () => secondSession),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    const stop = AgentSessionActions.subscribe();
    await vi.waitFor(() => expect(interceptor.getAgentSession).toHaveBeenCalledOnce());

    await AgentSessionActions.select('session-2');
    resolveFirst(emptySession);
    await vi.waitFor(() => expect(useAgentSessionStore.getState().loading).toBe(false));

    expect(useAgentSessionStore.getState().currentSession?.sessionId).toBe('session-2');
    stop();
  });

  it('does not let a gap reload switch back after the user selects another Chat', async () => {
    let resolveGap!: (session: AgentSessionSnapshot) => void;
    const gap = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveGap = resolve;
    });
    const interceptor = {
      getAgentSession: vi.fn(async () => gap),
      selectAgentSession: vi.fn(async () => secondSession),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({
      sessions: { currentSessionId: 'session-1', sessions: [summary, secondSummary] },
      currentSession: { ...emptySession, sequence: 2 },
    });
    AgentSessionActions.acceptEvent(event({ ...emptySession, sequence: 4 }));

    await AgentSessionActions.select('session-2');
    resolveGap({ ...emptySession, sequence: 4 });
    await gap;
    await vi.waitFor(() => expect(interceptor.getAgentSession).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(useAgentSessionStore.getState().currentSession?.sessionId).toBe('session-2');
  });

  it('routes create, send, cancel and retry through one shared busy state', async () => {
    const interceptor = {
      createAgentSession: vi.fn(async () => emptySession),
      listAgentSessions: vi.fn(async () => sessions),
      sendAgentMessage: vi.fn(async () => runningTurn),
      cancelAgentTurn: vi.fn(async () => ({ ...runningTurn, status: 'cancelled' as const })),
      retryAgentTurn: vi.fn(async () => ({ ...runningTurn, turnId: 'turn-2' })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await AgentSessionActions.create();
    await AgentSessionActions.send('hello');
    await AgentSessionActions.cancel('turn-1');
    await AgentSessionActions.retry('turn-1');

    expect(interceptor.sendAgentMessage).toHaveBeenCalledWith('session-1', 'hello');
    expect(useAgentSessionStore.getState()).toMatchObject({
      sessions,
      currentSession: emptySession,
      busy: false,
      error: null,
    });
  });
});

function event(snapshot: AgentSessionSnapshot): AgentRuntimeEvent {
  return {
    type: 'session-updated',
    sessionId: snapshot.sessionId,
    turnId: snapshot.currentTurn?.turnId ?? null,
    sequence: snapshot.sequence,
    snapshot,
  };
}
