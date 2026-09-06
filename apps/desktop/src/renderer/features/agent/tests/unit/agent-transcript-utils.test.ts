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
      { kind: 'tool-call', itemId: 'call-item', turnId: 'turn-1', callId: 'call-1', name: 'capture_get_proxy_status', arguments: {}, status: 'completed', approval: null, createdAt: 3 },
      { kind: 'tool-result', itemId: 'result-item', turnId: 'turn-1', callId: 'call-1', name: 'capture_get_proxy_status', result: { ok: true, value: { recording: true } }, createdAt: 4 },
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
    expect(summarizeAgentToolResult('capture_get_proxy_status', {
      ok: true,
      value: { recording: true, host: '127.0.0.1', port: 8888 },
    })).toEqual({ kind: 'proxy', recording: true, address: '127.0.0.1:8888' });
    expect(summarizeAgentToolResult('capture_start_recording', {
      ok: true,
      value: { recording: true, host: '127.0.0.1', port: 8888 },
    })).toEqual({ kind: 'proxy', recording: true, address: '127.0.0.1:8888' });
    expect(summarizeAgentToolResult('capture_get_storage_status', {
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
    expect(summarizeAgentToolResult('capture_clear', {
      ok: true,
      value: {
        sessionCount: 0,
        exchangeCount: 0,
        bodyCount: 0,
        databaseBytes: 4_096,
        blobBytes: 0,
        totalBytes: 4_096,
      },
    })).toEqual({ kind: 'storage', exchangeCount: 0, bodyCount: 0, totalBytes: 4_096 });
    expect(summarizeAgentToolResult('capture_list_exchanges', {
      ok: true,
      value: { items: [{ id: 'exchange-1' }] },
    })).toEqual({ kind: 'exchanges', count: 1 });
    expect(summarizeAgentToolResult('capture_get_exchange', {
      ok: true,
      value: { detail: { summary: { method: 'GET', path: '/traffic', statusCode: 200 } } },
    })).toEqual({ kind: 'exchange', method: 'GET', path: '/traffic', status: '200' });
    expect(summarizeAgentToolResult('capture_get_exchange_body', {
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
    expect(summarizeAgentToolResult('capture_list_websocket_messages', {
      ok: true,
      value: { items: [{ seq: 1 }, { seq: 2 }], hasMore: false, breakpoint: null },
    })).toEqual({ kind: 'websocket', count: 2, hasMore: false });
    expect(summarizeAgentToolResult('capture_list_grpc_messages', {
      ok: true,
      value: { recognized: true, side: 'response', items: [{ index: 0 }], hasMore: true },
    })).toEqual({
      kind: 'grpc',
      count: 1,
      side: 'response',
      hasMore: true,
      recognized: true,
    });
    expect(summarizeAgentToolResult('capture_list_grpc_messages', {
      ok: true,
      value: { recognized: false, side: 'response', items: [], hasMore: false },
    })).toEqual({ kind: 'not-grpc' });
    expect(summarizeAgentToolResult('rules_get_tree', {
      ok: true,
      value: {
        ruleSet: {
          revision: 4,
          nodes: [{
            kind: 'folder',
            id: 'folder-1',
            name: 'API',
            children: [{
              kind: 'rule',
              id: 'rule-1',
              name: 'Header',
              enabled: true,
              priority: 0,
              matchers: [],
              actions: [],
            }],
          }],
        },
      },
    })).toEqual({ kind: 'rules', revision: 4, ruleCount: 1, enabledCount: 1 });
    expect(summarizeAgentToolResult('rules_get_hits', {
      ok: true,
      value: { counts: [{ ruleId: 'rule-1', count: 3 }, { ruleId: 'rule-2', count: 0 }] },
    })).toEqual({ kind: 'ruleHits', ruleCount: 2, totalHits: 3 });
    expect(summarizeAgentToolResult('rules_replace_tree', {
      ok: true,
      value: { revision: 5 },
    })).toEqual({ kind: 'rulesApplied', revision: 5 });
    expect(summarizeAgentToolResult('breakpoints_list', {
      ok: true,
      value: { enabled: true, breakpoints: [{ id: 'bp-1' }, { id: 'bp-2' }] },
    })).toEqual({ kind: 'breakpoints', count: 2, enabled: true });
    expect(summarizeAgentToolResult('breakpoints_disable_http', {
      ok: true,
      value: { enabled: false },
    })).toEqual({ kind: 'breakpointConfig', enabled: false });
    expect(summarizeAgentToolResult('breakpoints_continue', {
      ok: true,
      value: { breakpointId: 'bp-1', state: 'continued' },
    })).toEqual({
      kind: 'breakpointResolution',
      breakpointId: 'bp-1',
      state: 'continued',
    });
    expect(summarizeAgentToolResult('composer_send_request', {
      ok: true,
      value: {
        ok: true,
        method: 'POST',
        url: 'https://api.test/items?access_token=%3Credacted%3E',
        status: 201,
        totalBytes: 27,
      },
    })).toEqual({
      kind: 'request',
      ok: true,
      method: 'POST',
      path: '/items?access_token=%3Credacted%3E',
      status: 201,
      totalBytes: 27,
    });
    expect(summarizeAgentToolResult('composer_probe_connection', {
      ok: true,
      value: {
        ok: true,
        protocol: 'TLSv1.3',
        alpn: 'h2',
        certificates: [{ subject: 'CN=api.test' }],
      },
    })).toEqual({
      kind: 'probe',
      ok: true,
      protocol: 'TLSv1.3',
      alpn: 'h2',
      certificateCount: 1,
    });
    expect(summarizeAgentToolResult('composer_probe_connection', {
      ok: true,
      value: { ok: false, error: 'connect ECONNREFUSED', certificates: [] },
    })).toEqual({
      kind: 'probe',
      ok: false,
      error: 'connect ECONNREFUSED',
    });
    expect(summarizeAgentToolResult('diagnostics_query', {
      ok: true,
      value: {
        records: [{ sequence: 2 }, { sequence: 1 }],
        hasMore: false,
        droppedCount: 3,
      },
    })).toEqual({
      kind: 'diagnostics',
      count: 2,
      hasMore: false,
      droppedCount: 3,
    });
  });

  it.each([true, false])('summarizes Rules export completion without local paths: %s', (exported) => {
    expect(summarizeAgentToolResult('rules_export', {
      ok: true,
      value: { exported, path: 'C:\\private\\rules.json', nodes: ['private Rule content'] },
    })).toEqual({ kind: 'rulesExport', exported });
  });

  it.each([
    [{ imported: false }, { kind: 'importCanceled' }],
    [{ imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 },
      { kind: 'rulesImported', revision: 2, ruleCount: 2, folderCount: 1 }],
  ])('summarizes Rules import outcome without file content: %j', (value, expected) => {
    expect(summarizeAgentToolResult('rules_import', {
      ok: true, value: { ...value, path: 'C:\\private\\rules.json', nodes: ['private Rule content'] },
    })).toEqual(expected);
  });

  it.each([
    ['settings_get_core_process_status', { state: 'running', pid: 42 }, { kind: 'coreProcess', state: 'running', pid: 42 }],
    ['settings_get_system_proxy_status', { supported: true, owned: true, enabled: true }, { kind: 'systemProxy', supported: true, owned: true, enabled: true }],
    ['settings_enable_system_proxy', { supported: true, owned: true, enabled: true }, { kind: 'systemProxy', supported: true, owned: true, enabled: true }],
    ['settings_restore_system_proxy', { restored: true, status: { owned: false } }, { kind: 'systemProxyRestore', restored: true }],
    ['settings_restore_system_proxy', { restored: false, reason: 'not-owned', status: { owned: false } }, { kind: 'systemProxyRestore', restored: false, reason: 'not-owned' }],
    ['settings_get_certificate_status', { present: false, trusted: false, mitmEnabled: false }, { kind: 'certificateStatus', present: false, trusted: false, mitmEnabled: false }],
    ['settings_get_tls_insecure_hosts', { hosts: ['localhost'] }, { kind: 'tlsHosts', count: 1 }],
    ['settings_replace_tls_insecure_hosts', { hosts: ['localhost'] }, { kind: 'tlsHosts', count: 1 }],
    ['settings_get_tls_passthrough', { revision: 2, hosts: ['*.example.test'] }, { kind: 'tlsPassthrough', revision: 2, count: 1 }],
    ['settings_replace_tls_passthrough', { ok: true, settings: { revision: 2, hosts: ['*.example.test'] } }, { kind: 'tlsPassthrough', revision: 2, count: 1 }],
    ['settings_replace_tls_passthrough', { ok: false, reason: 'conflict', message: 'Read latest revision.' }, { kind: 'error', message: 'Read latest revision.' }],
    ['settings_enable_https_decryption', { trusted: false, mitmEnabled: true, decrypting: false }, { kind: 'decryption', trusted: false, mitmEnabled: true, decrypting: false }],
    ['settings_disable_https_decryption', { trusted: true, mitmEnabled: false, decrypting: false }, { kind: 'decryption', trusted: true, mitmEnabled: false, decrypting: false }],
    ['settings_list_app_containers', { supported: true, containers: [{ exempt: true }, { exempt: false }] }, { kind: 'appContainers', supported: true, count: 2, exemptCount: 1 }],
    ['settings_list_app_containers', { supported: false, containers: [] }, { kind: 'appContainers', supported: false, count: 0, exemptCount: 0 }],
  ])('summarizes %s as typed Settings state', (name, value, expected) => {
    expect(summarizeAgentToolResult(String(name), { ok: true, value })).toEqual(expected);
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
        name: 'capture_get_exchange',
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
        name: 'capture_get_exchange',
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
