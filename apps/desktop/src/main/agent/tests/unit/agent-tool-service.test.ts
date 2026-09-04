import { describe, expect, it, vi } from 'vitest';

import type {
  AgentMessage,
  AgentTool,
  ToolExecutionResult,
} from '@interceptor/agent-runtime';
import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import { buildInterceptorToolSettingsGroups } from '@interceptor/tools';

import type { ToolCapabilitySettingsSnapshot } from '../../../../shared/desktop-api';
import { CoreRuntime } from '../../../core/core-runtime';
import type { CoreRequestOptions } from '../../../interfaces';
import { ToolCapabilitySettingsService } from '../../../tool-capabilities/entry';
import { AgentToolService } from '../../entry';

class FakeCoreRuntime extends CoreRuntime {
  readonly commands: CoreCommand[] = [];
  readonly abortSignals: Array<AbortSignal | undefined> = [];
  readonly results = new Map<string, unknown>();

  override async request<T extends CoreCommand>(
    command: T,
    options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    this.commands.push(command);
    this.abortSignals.push(options.abortSignal);
    const result = this.results.get(command.type);
    if (result === undefined) throw new Error(`No fake result for ${command.type}.`);
    return result as CoreResultForCommand<T>;
  }
}

class FakeToolCapabilitySettingsService extends ToolCapabilitySettingsService {
  agentDisabledToolNames: string[] = [];

  constructor() {
    super('unused');
  }

  override snapshot(): ToolCapabilitySettingsSnapshot {
    return {
      groups: buildInterceptorToolSettingsGroups(),
      agentDisabledToolNames: [...this.agentDisabledToolNames],
      mcpDisabledToolNames: [],
    };
  }
}

function tool(snapshot: { readonly tools: readonly AgentTool[] }, name: string): AgentTool {
  const result = snapshot.tools.find((candidate) => candidate.descriptor.name === name);
  if (result === undefined) throw new Error(`Missing Agent Tool ${name}.`);
  return result;
}

function discoveredHistory(
  result: ToolExecutionResult,
  capabilityId = 'traffic',
): readonly AgentMessage[] {
  return [
    { role: 'user', content: 'Inspect current traffic.' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{
        id: 'discover-1',
        name: 'discover_tools',
        arguments: { capabilityId },
      }],
    },
    {
      role: 'tool',
      toolCallId: 'discover-1',
      name: 'discover_tools',
      content: JSON.stringify(result),
    },
  ];
}

describe('AgentToolService', () => {
  it('initially exposes only enabled capabilities and discover_tools', () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
    );

    const snapshot = service.snapshot([{ role: 'user', content: 'Inspect traffic.' }]);

    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual(['discover_tools']);
    expect(snapshot.systemMessages).toHaveLength(1);
    expect(snapshot.systemMessages[0]?.content).toContain('traffic');
    expect(snapshot.systemMessages[0]?.content).not.toContain('get_proxy_status');
  });

  it('discovers and then discloses the connected Traffic query and change Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const initial = service.snapshot([]);

    const discovery = await tool(initial, 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: [
          { descriptor: { name: 'get_proxy_status' } },
          { descriptor: { name: 'get_storage_status' } },
          { descriptor: { name: 'list_exchanges' } },
          { descriptor: { name: 'get_exchange' } },
          { descriptor: { name: 'get_exchange_body' } },
          { descriptor: { name: 'list_websocket_messages' } },
          { descriptor: { name: 'list_grpc_messages' } },
          { descriptor: { name: 'start_recording' } },
          { descriptor: { name: 'stop_recording' } },
          { descriptor: { name: 'clear_capture' } },
        ],
      },
    });

    const disclosed = service.snapshot(discoveredHistory(discovery));
    expect(disclosed.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'get_proxy_status',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'start_recording',
      'stop_recording',
      'clear_capture',
    ]);
    expect(tool(disclosed, 'start_recording').kind).toBe('change');
    expect(tool(disclosed, 'stop_recording').kind).toBe('change');
    expect(tool(disclosed, 'clear_capture').kind).toBe('change');
  });

  it('removes disabled capabilities and previously disclosed Tools on the next snapshot', async () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const history = discoveredHistory(discovery);

    settings.agentDisabledToolNames = ['get_proxy_status'];

    const snapshot = service.snapshot(history);
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'get_exchange_body',
      'list_websocket_messages',
      'list_grpc_messages',
      'start_recording',
      'stop_recording',
      'clear_capture',
    ]);
  });

  it('discovers and discloses exactly the three connected Rules Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );

    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: [
          { descriptor: { name: 'get_rules' } },
          { descriptor: { name: 'get_rule_hits' } },
          { descriptor: { name: 'apply_rules' } },
        ],
      },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'get_rules',
      'get_rule_hits',
      'apply_rules',
    ]);
    expect(tool(snapshot, 'get_rules').kind).toBe('query');
    expect(tool(snapshot, 'get_rule_hits').kind).toBe('query');
    expect(tool(snapshot, 'apply_rules').kind).toBe('change');
  });

  it('discovers and discloses exactly the eight connected Breakpoints Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const names = [
      'list_breakpoints',
      'enable_http_breakpoints',
      'disable_http_breakpoints',
      'enable_websocket_breakpoint',
      'disable_websocket_breakpoint',
      'continue_breakpoint',
      'forward_edited_breakpoint',
      'drop_breakpoint',
    ];

    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: names.map((name) => ({ descriptor: { name } })),
      },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'breakpoints'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      ...names,
    ]);
    expect(tool(snapshot, 'list_breakpoints').kind).toBe('query');
    for (const name of names.slice(1)) {
      expect(tool(snapshot, name).kind).toBe('change');
    }
  });

  it('executes all eight Breakpoints Tools through CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('breakpoint.list', {
      type: 'breakpoint.pending',
      payload: {
        enabled: true,
        breakpoints: ['bp-1', 'bp-2'].map((id) => ({
          id,
          phase: 'request' as const,
          queueKey: 'http' as const,
          createdAt: 1,
          ruleName: 'Pause API',
          headers: [],
          bodyAvailable: false,
        })),
      },
    });
    coreRuntime.results.set('breakpoint.configure', {
      type: 'breakpoint.config',
      payload: { enabled: true },
    });
    coreRuntime.results.set('websocket.breakpoint.enable', {
      type: 'websocket.breakpoint.state',
      payload: { enabled: true, settings: null },
    });
    coreRuntime.results.set('websocket.breakpoint.disable', {
      type: 'websocket.breakpoint.state',
      payload: { enabled: false, settings: null },
    });
    coreRuntime.results.set('breakpoint.resolve', {
      type: 'breakpoint.resolution',
      payload: { breakpointId: 'bp-1', state: 'continued' },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'breakpoints'));
    const abortController = new AbortController();

    await tool(snapshot, 'list_breakpoints').execute({}, { abortSignal: abortController.signal });
    await tool(snapshot, 'enable_http_breakpoints').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'disable_http_breakpoints').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'enable_websocket_breakpoint').execute(
      { exchangeId: 'exchange-ws', frames: ['message'] },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'disable_websocket_breakpoint').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'continue_breakpoint').execute(
      { breakpointId: 'bp-1' },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'forward_edited_breakpoint').execute(
      { breakpointId: 'bp-2', body: '' },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'drop_breakpoint').execute(
      { breakpointId: 'bp-3' },
      { abortSignal: abortController.signal },
    );

    expect(coreRuntime.commands).toEqual([
      { type: 'breakpoint.list', payload: {} },
      { type: 'breakpoint.configure', payload: { enabled: true } },
      { type: 'breakpoint.configure', payload: { enabled: false } },
      {
        type: 'websocket.breakpoint.enable',
        payload: { exchangeId: 'exchange-ws', direction: 'both', frames: ['message'] },
      },
      { type: 'websocket.breakpoint.disable', payload: {} },
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-1', action: 'continue' } },
      { type: 'breakpoint.list', payload: {} },
      {
        type: 'breakpoint.resolve',
        payload: { breakpointId: 'bp-2', action: 'continue', edit: { body: '' } },
      },
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-3', action: 'drop' } },
    ]);
    expect(coreRuntime.abortSignals).toEqual(Array(9).fill(abortController.signal));
  });

  it('discovers and discloses exactly the two connected Requests Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );

    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'requests' },
      { abortSignal: new AbortController().signal },
    );

    expect(discovery).toEqual({
      ok: true,
      value: {
        matches: expect.arrayContaining([
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'send_request' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'probe_connection' }) }),
        ]),
      },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'requests'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'send_request',
      'probe_connection',
    ]);
    expect(tool(snapshot, 'send_request').kind).toBe('change');
    expect(tool(snapshot, 'probe_connection').kind).toBe('change');
  });

  it('executes both Requests Tools through CoreRuntime with cancellation', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('composer.send', {
      type: 'composer.response',
      payload: {
        ok: true,
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/1.1',
        headers: [],
        body: new Uint8Array(),
        totalBytes: 0,
        durationMs: 1,
        timing: {
          dnsMs: 0,
          tcpMs: 0,
          tlsMs: 0,
          requestMs: 0,
          waitingMs: 1,
          downloadMs: 0,
          totalMs: 1,
        },
        tls: null,
        remoteAddress: '127.0.0.1',
      },
    });
    coreRuntime.results.set('tls.probe', {
      type: 'tls.probed',
      payload: {
        ok: true,
        protocol: 'TLSv1.3',
        cipher: 'TLS_AES_256_GCM_SHA384',
        alpn: 'h2',
        authorized: false,
        certificates: [],
      },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'requests' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'requests'));
    const abortController = new AbortController();

    await tool(snapshot, 'send_request').execute({
      method: 'POST',
      url: 'https://api.test/items',
      headers: [{ name: 'x-mode', value: 'agent' }],
      body: '',
      protocol: 'http/1.1',
      timeoutMs: 2_000,
    }, { abortSignal: abortController.signal });
    await tool(snapshot, 'probe_connection').execute({
      host: 'api.test',
      port: 443,
      timeoutMs: 1_000,
    }, { abortSignal: abortController.signal });

    expect(coreRuntime.commands).toEqual([
      {
        type: 'composer.send',
        payload: {
          method: 'POST',
          url: 'https://api.test/items',
          headers: [{ name: 'x-mode', value: 'agent' }],
          body: '',
          protocol: 'http/1.1',
          timeoutMs: 2_000,
        },
      },
      {
        type: 'tls.probe',
        payload: { host: 'api.test', port: 443, timeoutMs: 1_000 },
      },
    ]);
    expect(coreRuntime.abortSignals).toEqual([
      abortController.signal,
      abortController.signal,
    ]);
  });

  it('rejects a Breakpoint Tool disabled after disclosure without invoking CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      coreRuntime,
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const continueBreakpoint = tool(
      service.snapshot(discoveredHistory(discovery, 'breakpoints')),
      'continue_breakpoint',
    );

    settings.agentDisabledToolNames = ['continue_breakpoint'];
    const result = await continueBreakpoint.execute(
      { breakpointId: 'bp-1' },
      { abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unknown_tool',
        message: 'Unknown tool "continue_breakpoint".',
      },
    });
    expect(coreRuntime.commands).toEqual([]);
  });

  it('describes one pending Breakpoint with bounded metadata and rejects stale IDs', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('breakpoint.list', {
      type: 'breakpoint.pending',
      payload: {
        enabled: true,
        breakpoints: [{
          id: 'bp-1',
          phase: 'request',
          queueKey: 'http',
          exchangeId: 'exchange-1',
          createdAt: 1,
          ruleName: 'Pause API',
          method: 'POST',
          url: 'http://api.test/items',
          headers: [],
          bodyAvailable: true,
          body: 'private-body',
        }],
      },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'breakpoints'));
    const continueBreakpoint = tool(snapshot, 'continue_breakpoint');

    const description = await continueBreakpoint.describeEffect?.(
      { breakpointId: 'bp-1' },
      { abortSignal: new AbortController().signal },
    );
    expect(description).toMatchObject({
      metadata: {
        breakpointId: 'bp-1',
        phase: 'request',
        queueKey: 'http',
        exchangeId: 'exchange-1',
      },
    });
    expect(description?.text).toContain('Target: POST http://api.test/items');
    expect(JSON.stringify(description)).not.toContain('private-body');

    coreRuntime.results.set('breakpoint.list', {
      type: 'breakpoint.pending',
      payload: { enabled: true, breakpoints: [] },
    });
    await expect(continueBreakpoint.describeEffect?.(
      { breakpointId: 'bp-1' },
      { abortSignal: new AbortController().signal },
    )).rejects.toThrow('is no longer pending');
  });

  it('executes body, WebSocket and gRPC queries through the shared registry', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('sessions.detail', {
      type: 'sessions.detail',
      payload: {
        detail: {
          responseBody: {
            bodyHash: 'body-1',
            mediaType: 'application/json',
          },
        },
      },
    });
    coreRuntime.results.set('body.read-range', {
      type: 'body.range',
      payload: {
        bodyId: 'body-1',
        offset: 0,
        data: new TextEncoder().encode('{"ready":true}'),
        end: true,
        decodeStatus: 'ok',
      },
    });
    coreRuntime.results.set('websocket.frames', {
      type: 'websocket.frames',
      payload: {
        items: [{
          seq: 1,
          direction: 'client-to-server',
          opcode: 1,
          timestamp: 1_000,
          payloadSize: 5,
        }],
        hasMore: false,
        breakpoint: null,
      },
    });
    coreRuntime.results.set('grpc.messages', {
      type: 'grpc.messages',
      payload: {
        recognized: true,
        side: 'response',
        contentType: 'application/grpc+json',
        bodySize: 24,
        items: [{
          index: 0,
          envelopeOffset: 0,
          payloadOffset: 5,
          payloadLength: 19,
          compressed: false,
          truncated: false,
        }],
        hasMore: false,
      },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();

    await expect(tool(snapshot, 'get_exchange_body').execute(
      { exchangeId: 'exchange-http', bodyId: 'body-1', length: 32 },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { bodyId: 'body-1', end: true } });
    await expect(tool(snapshot, 'list_websocket_messages').execute(
      { exchangeId: 'exchange-ws', direction: 'client-to-server', limit: 25 },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { items: [{ seq: 1 }] } });
    await expect(tool(snapshot, 'list_grpc_messages').execute(
      { exchangeId: 'exchange-grpc', side: 'response', limit: 30 },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { recognized: true, side: 'response' } });

    expect(coreRuntime.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-http' } },
      {
        type: 'body.read-range',
        payload: { bodyId: 'body-1', offset: 0, length: 32, decode: true },
      },
      {
        type: 'websocket.frames',
        payload: {
          exchangeId: 'exchange-ws',
          cursor: undefined,
          limit: 25,
          direction: 'client-to-server',
        },
      },
      {
        type: 'grpc.messages',
        payload: {
          exchangeId: 'exchange-grpc',
          side: 'response',
          cursor: undefined,
          limit: 30,
        },
      },
    ]);
    expect(coreRuntime.abortSignals).toEqual([
      abortController.signal,
      abortController.signal,
      abortController.signal,
      abortController.signal,
    ]);
  });

  it('executes get_storage_status through capture.status with the caller AbortSignal', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('capture.status', {
      type: 'capture.status',
      payload: {
        sessionCount: 1,
        exchangeCount: 2,
        bodyCount: 3,
        databaseBytes: 0,
        blobBytes: 184,
        totalBytes: 184,
      },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();

    const result = await tool(snapshot, 'get_storage_status').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        sessionCount: 1,
        exchangeCount: 2,
        bodyCount: 3,
        databaseBytes: 0,
        blobBytes: 184,
        totalBytes: 184,
      },
    });
    expect(coreRuntime.commands).toEqual([{ type: 'capture.status', payload: {} }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes disclosed Tools through the shared registry and CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('proxy.status', {
      type: 'proxy.status',
      payload: { running: true, recording: true },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'get_proxy_status').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({ ok: true, value: { running: true, recording: true } });
    expect(coreRuntime.commands).toEqual([{ type: 'proxy.status', payload: {} }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes stop_recording through the formal Core recording command', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('proxy.setRecording', {
      type: 'proxy.setRecording',
      payload: { recording: false },
    });
    const captureStatusChanged = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      captureStatusChanged,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'stop_recording').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({ ok: true, value: { recording: false } });
    expect(coreRuntime.commands).toEqual([{
      type: 'proxy.setRecording',
      payload: { recording: false },
    }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
    expect(captureStatusChanged).toHaveBeenCalledWith({ recording: false });
  });

  it('starts recording and clears Capture through formal Core commands', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_234);
    const coreRuntime = new FakeCoreRuntime();
    const captureStatus = {
      listening: true,
      recording: true,
      host: '127.0.0.1',
      port: 8_888,
      sessionId: 'session-1',
      capturedExchanges: 0,
    };
    const clearedUsage = {
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 4_096,
      blobBytes: 0,
      totalBytes: 4_096,
    };
    coreRuntime.results.set('capture.status', {
      type: 'capture.status',
      payload: { exchangeCount: 7, bodyCount: 3 },
    });
    coreRuntime.results.set('proxy.start', {
      type: 'proxy.status',
      payload: captureStatus,
    });
    coreRuntime.results.set('capture.cleanup', {
      type: 'capture.status',
      payload: clearedUsage,
    });
    const captureStatusChanged = vi.fn();
    const captureReset = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      captureStatusChanged,
      captureReset,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();
    const clearCapture = tool(snapshot, 'clear_capture');

    await expect(clearCapture.describeEffect?.(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toEqual({
      text: 'Scope: all\nThis permanently deletes 7 exchange(s) and 3 body/bodies.',
      metadata: { scope: 'all', exchangeCount: 7, bodyCount: 3 },
    });
    await expect(tool(snapshot, 'start_recording').execute(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toEqual({ ok: true, value: captureStatus });
    await expect(clearCapture.execute(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toEqual({ ok: true, value: clearedUsage });

    expect(coreRuntime.commands).toEqual([
      { type: 'capture.status', payload: {} },
      { type: 'proxy.start', payload: {} },
      { type: 'capture.cleanup', payload: { scope: 'all' } },
    ]);
    expect(coreRuntime.abortSignals).toEqual([
      abortController.signal,
      abortController.signal,
      abortController.signal,
    ]);
    expect(captureStatusChanged).toHaveBeenCalledWith(captureStatus);
    expect(captureReset).toHaveBeenCalledWith({ clearedBefore: 1_234 });
    now.mockRestore();
  });

  it('queries and replaces Rules through the shared registry', async () => {
    const coreRuntime = new FakeCoreRuntime();
    const nodes = [{
      kind: 'folder' as const,
      id: 'folder-1',
      name: 'API',
      children: [{
        kind: 'rule' as const,
        id: 'rule-1',
        name: 'Agent header',
        enabled: true,
        priority: 0,
        matchers: [{ type: 'host' as const, value: '127.0.0.1', mode: 'exact' as const }],
        actions: [{
          type: 'header' as const,
          phase: 'request' as const,
          op: 'set' as const,
          name: 'x-agent-rules',
          value: 'active',
        }],
      }],
    }];
    coreRuntime.results.set('rules.get', {
      type: 'rules.ruleset',
      payload: { ruleSet: { revision: 4, nodes } },
    });
    coreRuntime.results.set('rules.hits', {
      type: 'rules.hits',
      payload: { counts: [{ ruleId: 'rule-1', count: 2 }] },
    });
    coreRuntime.results.set('rules.replace', {
      type: 'rules.revision',
      payload: { revision: 5 },
    });
    const rulesChanged = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      rulesChanged,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));
    const abortController = new AbortController();
    const applyRules = tool(snapshot, 'apply_rules');

    await expect(tool(snapshot, 'get_rules').execute(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { ruleSet: { revision: 4 } } });
    await expect(tool(snapshot, 'get_rule_hits').execute(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toEqual({
      ok: true,
      value: { counts: [{ ruleId: 'rule-1', count: 2 }] },
    });
    await expect(applyRules.describeEffect?.(
      { baseRevision: 4, nodes },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({
      metadata: {
        baseRevision: 4,
        currentRuleCount: 1,
        nextRuleCount: 1,
        currentEnabledCount: 1,
        nextEnabledCount: 1,
      },
    });
    await expect(applyRules.execute(
      { baseRevision: 4, nodes },
      { abortSignal: abortController.signal },
    )).resolves.toEqual({ ok: true, value: { revision: 5 } });

    expect(coreRuntime.commands).toEqual([
      { type: 'rules.get', payload: {} },
      { type: 'rules.hits', payload: {} },
      { type: 'rules.get', payload: {} },
      { type: 'rules.get', payload: {} },
      { type: 'rules.replace', payload: { expectedRevision: 4, nodes } },
    ]);
    expect(coreRuntime.abortSignals).toEqual(Array(5).fill(abortController.signal));
    expect(rulesChanged).toHaveBeenCalledWith({ revision: 5 });
  });

  it('does not publish a Rules revision when replacement fails', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('rules.get', {
      type: 'rules.ruleset',
      payload: { ruleSet: { revision: 0, nodes: [] } },
    });
    const rulesChanged = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      rulesChanged,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));

    await expect(tool(snapshot, 'apply_rules').execute(
      { baseRevision: 0, nodes: [] },
      { abortSignal: new AbortController().signal },
    )).rejects.toThrow('No fake result for rules.replace.');
    expect(rulesChanged).not.toHaveBeenCalled();
  });

  it('does not reset Capture when cleanup fails', async () => {
    const coreRuntime = new FakeCoreRuntime();
    const captureReset = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      captureReset,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    await expect(tool(snapshot, 'clear_capture').execute(
      {},
      { abortSignal: new AbortController().signal },
    )).rejects.toThrow('No fake result for capture.cleanup.');
    expect(captureReset).not.toHaveBeenCalled();
  });

  it('rejects a Tool disabled after disclosure without invoking CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      coreRuntime,
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const getStorageStatus = tool(
      service.snapshot(discoveredHistory(discovery)),
      'get_storage_status',
    );

    settings.agentDisabledToolNames = ['get_storage_status'];
    const result = await getStorageStatus.execute(
      {},
      { abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unknown_tool',
        message: 'Unknown tool "get_storage_status".',
      },
    });
    expect(coreRuntime.commands).toHaveLength(0);
  });
});
