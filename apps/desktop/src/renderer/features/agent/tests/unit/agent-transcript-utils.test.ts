import { describe, expect, it } from 'vitest';

import type { AgentSessionSnapshot } from '../../../../../shared/desktop-api';
import {
  buildAgentTranscriptEntries,
  buildAgentTurnContentBlocks,
  formatAgentToolArguments,
  summarizeAgentToolResult,
} from '../../utils';

function session(): AgentSessionSnapshot {
  return {
    sessionId: 'session-1',
    toolExecutionMode: 'ask',
    summary: {
      sessionId: 'session-1',
      title: 'Traffic',
      providerId: 'provider-1',
      modelId: 'model-1',
      createdAt: 1,
      updatedAt: 5,
      itemCount: 5,
    },
    items: [
      { kind: 'user-message', itemId: 'user-1', turnId: 'turn-1', content: 'Inspect.', createdAt: 1 },
      { kind: 'assistant-message', itemId: 'assistant-1', turnId: 'turn-1', content: '', reasoningContent: '', partial: false, createdAt: 2 },
      { kind: 'tool-call', itemId: 'call-item', turnId: 'turn-1', callId: 'call-1', name: 'get_proxy_status', arguments: {}, status: 'completed', approval: null, createdAt: 3 },
      { kind: 'tool-result', itemId: 'result-item', turnId: 'turn-1', callId: 'call-1', name: 'get_proxy_status', result: { ok: true, value: { recording: true } }, createdAt: 4 },
      { kind: 'assistant-message', itemId: 'assistant-2', turnId: 'turn-1', content: 'Recording.', reasoningContent: '', partial: false, createdAt: 5 },
    ],
    turns: [{
      turnId: 'turn-1',
      userItemId: 'user-1',
      status: 'completed',
      retryOfTurnId: null,
      error: null,
      createdAt: 1,
      updatedAt: 5,
    }],
    currentTurn: null,
    usage: {
      modelCallCount: 2,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cacheHitInputTokens: null,
      cacheMissInputTokens: null,
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
    sequence: 5,
  };
}

describe('Agent transcript utilities', () => {
  it('groups all assistant and Tool items from one Turn into one response entry', () => {
    const entries = buildAgentTranscriptEntries(session());

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'user', item: { itemId: 'user-1' } });
    expect(entries[1]).toMatchObject({
      kind: 'turn',
      turn: { turnId: 'turn-1' },
      items: [
        { itemId: 'assistant-1' },
        { itemId: 'call-item' },
        { itemId: 'result-item' },
        { itemId: 'assistant-2' },
      ],
    });
  });

  it('formats empty and structured Tool arguments compactly', () => {
    expect(formatAgentToolArguments({})).toBeNull();
    expect(formatAgentToolArguments({ limit: 50, filter: { host: 'example.test' } }))
      .toBe('limit: 50 · filter: {"host":"example.test"}');
  });

  it('summarizes the connected Traffic Tool results', () => {
    expect(summarizeAgentToolResult('discover_tools', {
      ok: true,
      value: { matches: [{}, {}, {}] },
    })).toEqual({ kind: 'discovery', count: 3 });
    expect(summarizeAgentToolResult('get_proxy_status', {
      ok: true,
      value: { recording: true, host: '127.0.0.1', port: 8888 },
    })).toEqual({ kind: 'proxy', recording: true, address: '127.0.0.1:8888' });
    expect(summarizeAgentToolResult('get_storage_status', {
      ok: true,
      value: {
        sessionCount: 1,
        exchangeCount: 1,
        bodyCount: 2,
        databaseBytes: 0,
        blobBytes: 184,
        totalBytes: 184,
      },
    })).toEqual({ kind: 'storage', exchangeCount: 1, bodyCount: 2, totalBytes: 184 });
    expect(summarizeAgentToolResult('list_exchanges', {
      ok: true,
      value: { items: [{ id: 'exchange-1' }] },
    })).toEqual({ kind: 'exchanges', count: 1 });
    expect(summarizeAgentToolResult('get_exchange', {
      ok: true,
      value: { detail: { summary: { method: 'GET', path: '/traffic', statusCode: 200 } } },
    })).toEqual({ kind: 'exchange', method: 'GET', path: '/traffic', status: '200' });
    expect(summarizeAgentToolResult('get_exchange_body', {
      ok: true,
      value: {
        bodyId: 'body-1',
        offset: 0,
        end: true,
        decodeStatus: 'ok',
        text: '{"ready":true}',
        truncated: false,
        bytesRead: 14,
      },
    })).toEqual({ kind: 'body', bytesRead: 14, end: true, opaque: false });
    expect(summarizeAgentToolResult('list_websocket_messages', {
      ok: true,
      value: { items: [{ seq: 1 }, { seq: 2 }], hasMore: false, breakpoint: null },
    })).toEqual({ kind: 'websocket', count: 2, hasMore: false });
    expect(summarizeAgentToolResult('list_grpc_messages', {
      ok: true,
      value: { recognized: true, side: 'response', items: [{ index: 0 }], hasMore: true },
    })).toEqual({
      kind: 'grpc',
      count: 1,
      side: 'response',
      hasMore: true,
      recognized: true,
    });
    expect(summarizeAgentToolResult('list_grpc_messages', {
      ok: true,
      value: { recognized: false, side: 'response', items: [], hasMore: false },
    })).toEqual({ kind: 'not-grpc' });
  });

  it('keeps later Tool activity after visible assistant content', () => {
    const currentSession = session();
    const items = [
      currentSession.items[1]!,
      currentSession.items[2]!,
      currentSession.items[3]!,
      {
        kind: 'assistant-message' as const,
        itemId: 'assistant-between',
        turnId: 'turn-1',
        content: 'I need one more detail.',
        reasoningContent: '',
        partial: false,
        createdAt: 5,
      },
      {
        kind: 'tool-call' as const,
        itemId: 'call-second',
        turnId: 'turn-1',
        callId: 'call-2',
        name: 'get_exchange',
        arguments: { exchangeId: 'exchange-1' },
        status: 'completed' as const,
        approval: null,
        createdAt: 6,
      },
      {
        kind: 'tool-result' as const,
        itemId: 'result-second',
        turnId: 'turn-1',
        callId: 'call-2',
        name: 'get_exchange',
        result: { ok: true as const, value: { detail: null } },
        createdAt: 7,
      },
    ].filter((item) => item.kind !== 'user-message');

    expect(buildAgentTurnContentBlocks(items)).toMatchObject([
      { kind: 'tools', calls: [{ callId: 'call-1' }] },
      { kind: 'assistant', item: { itemId: 'assistant-between' } },
      { kind: 'tools', calls: [{ callId: 'call-2' }] },
    ]);
  });
});
