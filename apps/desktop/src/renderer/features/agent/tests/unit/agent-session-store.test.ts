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
  toolExecutionMode: 'ask',
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
    const current = {
      ...emptySession,
      sequence: 2,
      summary: { ...summary, title: 'Current title', updatedAt: 3 },
    };
    const recovered = { ...emptySession, sequence: 5 };
    const interceptor = {
      getAgentSession: vi.fn(async () => recovered),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({
      sessions: { ...sessions, sessions: [current.summary] },
      currentSession: current,
    });

    AgentSessionActions.acceptEvent(event({ ...emptySession, sequence: 1 }));
    expect(useAgentSessionStore.getState().currentSession?.sequence).toBe(2);
    expect(useAgentSessionStore.getState().sessions?.sessions[0]?.title)
      .toBe('Current title');
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

  it('keeps a target Session event that arrives before select resolves', async () => {
    let resolveSelect!: (session: AgentSessionSnapshot) => void;
    const selected = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveSelect = resolve;
    });
    const interceptor = {
      selectAgentSession: vi.fn(async () => selected),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({
      sessions: { currentSessionId: 'session-1', sessions: [summary, secondSummary] },
      currentSession: emptySession,
    });
    const selecting = AgentSessionActions.select('session-2');
    const streamed = {
      ...secondSession,
      sequence: 2,
      summary: { ...secondSummary, itemCount: 1, updatedAt: 3 },
    };

    AgentSessionActions.acceptEvent(event(streamed));
    resolveSelect({ ...secondSession, sequence: 1 });
    await selecting;

    expect(useAgentSessionStore.getState().currentSession).toEqual(streamed);
    expect(useAgentSessionStore.getState().sessions?.currentSessionId).toBe('session-2');
  });

  it('does not commit half of create when the refreshed Session list fails', async () => {
    const interceptor = {
      createAgentSession: vi.fn(async () => secondSession),
      listAgentSessions: vi.fn(async () => {
        throw new Error('list failed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({ sessions, currentSession: emptySession });

    await expect(AgentSessionActions.create()).rejects.toThrow('list failed');

    expect(useAgentSessionStore.getState()).toMatchObject({
      sessions,
      currentSession: emptySession,
      error: 'list failed',
    });
  });

  it('does not commit half of delete when the fallback snapshot fails', async () => {
    const fallbackSessions: AgentSessionsSnapshot = {
      currentSessionId: 'session-2',
      sessions: [secondSummary],
    };
    const interceptor = {
      deleteAgentSession: vi.fn(async () => fallbackSessions),
      getAgentSession: vi.fn(async () => {
        throw new Error('fallback failed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({ sessions, currentSession: emptySession });

    await expect(AgentSessionActions.deleteCurrent()).rejects.toThrow('fallback failed');

    expect(useAgentSessionStore.getState()).toMatchObject({
      sessions,
      currentSession: emptySession,
      error: 'fallback failed',
    });

    AgentSessionActions.acceptEvent(event({ ...secondSession, sequence: 1 }));
    expect(useAgentSessionStore.getState().currentSession).toEqual(emptySession);
  });

  it('ignores a failed initial load after the user selects another Chat', async () => {
    let rejectLoad!: (error: Error) => void;
    const delayedLoad = new Promise<AgentSessionSnapshot>((_resolve, reject) => {
      rejectLoad = reject;
    });
    const interceptor = {
      listAgentSessions: vi.fn(async () => ({
        currentSessionId: 'session-1',
        sessions: [summary, secondSummary],
      })),
      getAgentSession: vi.fn(async () => delayedLoad),
      selectAgentSession: vi.fn(async () => secondSession),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    const loading = AgentSessionActions.load().catch(() => undefined);
    await vi.waitFor(() => expect(interceptor.getAgentSession).toHaveBeenCalledOnce());

    await AgentSessionActions.select('session-2');
    rejectLoad(new Error('stale load failed'));
    await loading;

    expect(useAgentSessionStore.getState()).toMatchObject({
      currentSession: secondSession,
      loading: false,
      error: null,
    });
  });

  it('ignores a failed gap reload after the user selects another Chat', async () => {
    let rejectGap!: (error: Error) => void;
    const gap = new Promise<AgentSessionSnapshot>((_resolve, reject) => {
      rejectGap = reject;
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
    rejectGap(new Error('stale gap failed'));
    await gap.catch(() => undefined);
    await Promise.resolve();

    expect(useAgentSessionStore.getState()).toMatchObject({
      currentSession: secondSession,
      error: null,
    });
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

  it('routes mode, Allow and Deny through three semantic Session intents', async () => {
    const autoSession = { ...emptySession, toolExecutionMode: 'auto' as const };
    const interceptor = {
      automaticallyExecuteAgentTools: vi.fn(async () => autoSession),
      requireAgentToolApproval: vi.fn(async () => emptySession),
      allowAgentToolCall: vi.fn(async () => autoSession),
      denyAgentToolCall: vi.fn(async () => autoSession),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentSessionStore.setState({ sessions, currentSession: emptySession });

    await AgentSessionActions.automaticallyExecuteTools();
    await AgentSessionActions.requireToolApproval();
    await AgentSessionActions.allowToolCall('approval-allow');
    await AgentSessionActions.denyToolCall('approval-deny');

    expect(interceptor.automaticallyExecuteAgentTools).toHaveBeenCalledWith('session-1');
    expect(interceptor.requireAgentToolApproval).toHaveBeenCalledWith('session-1');
    expect(interceptor.allowAgentToolCall).toHaveBeenCalledWith('approval-allow');
    expect(interceptor.denyAgentToolCall).toHaveBeenCalledWith('approval-deny');
    expect(useAgentSessionStore.getState().currentSession).toEqual(autoSession);
  });

  it('does not let an Allow response overwrite a newer Tool Result event', async () => {
    let resolveAllow!: (session: AgentSessionSnapshot) => void;
    const allowResponse = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveAllow = resolve;
    });
    const interceptor = {
      allowAgentToolCall: vi.fn(async () => allowResponse),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    const pending = { ...emptySession, sequence: 3 };
    const decided = { ...emptySession, sequence: 4 };
    const completed = { ...emptySession, sequence: 5 };
    useAgentSessionStore.setState({ sessions, currentSession: pending });

    const allowing = AgentSessionActions.allowToolCall('approval-1');
    AgentSessionActions.acceptEvent(event(decided));
    AgentSessionActions.acceptEvent(event(completed));
    resolveAllow(decided);
    await allowing;

    expect(useAgentSessionStore.getState().currentSession).toEqual(completed);
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
