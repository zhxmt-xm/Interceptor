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
  capabilityId = 'capture',
): readonly AgentMessage[] {
  return [
    { role: 'user', content: 'Inspect the current feature.' },
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
  it('routes the six Settings queries through Main or Core and revokes disclosed calls', async () => {
    const fakeCoreRuntime = new FakeCoreRuntime();
    fakeCoreRuntime.results.set('tls.getInsecureHosts', {
      type: 'tls.insecureHosts', payload: { hosts: ['localhost'] },
    });
    fakeCoreRuntime.results.set('tls-passthrough.get', {
      type: 'tls-passthrough.settings', payload: { settings: { revision: 1, hosts: ['*.example.test'] } },
    });
    const fakeToolCapabilitySettingsService = new FakeToolCapabilitySettingsService();
    const invokeMain = vi.fn(async (command: { type: string }, _abortSignal: AbortSignal) => ({
      type: command.type,
      payload: { state: 'running', supported: true, present: false, containers: [] },
    }) as never);
    const agentToolService = new AgentToolService(
      fakeCoreRuntime,
      fakeToolCapabilitySettingsService,
      () => undefined,
      () => undefined,
      () => undefined,
      invokeMain,
    );
    const abortSignal = new AbortController().signal;
    const discovery = await tool(agentToolService.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'settings' }, { abortSignal },
    );
    const snapshot = agentToolService.snapshot(discoveredHistory(discovery, 'settings'));
    const names = [
      'settings_get_core_process_status',
      'settings_get_system_proxy_status',
      'settings_get_certificate_status',
      'settings_get_tls_insecure_hosts',
      'settings_get_tls_passthrough',
      'settings_list_app_containers',
    ];
    expect(snapshot.tools.map((candidate) => candidate.descriptor.name).filter((name) => names.includes(name)))
      .toEqual(names);
    for (const name of names) {
      const query = tool(snapshot, name);
      expect(query.kind).toBe('query');
      await expect(query.execute({}, { abortSignal })).resolves.toMatchObject({ ok: true });
    }
    expect(invokeMain).toHaveBeenCalledTimes(4);
    expect(invokeMain.mock.calls.every((call) => call[1] === abortSignal)).toBe(true);
    expect(fakeCoreRuntime.commands.map((command) => command.type))
      .toEqual(['tls.getInsecureHosts', 'tls-passthrough.get']);
    expect(fakeCoreRuntime.abortSignals).toEqual([abortSignal, abortSignal]);

    fakeToolCapabilitySettingsService.agentDisabledToolNames = names;
    expect(agentToolService.snapshot(discoveredHistory(discovery, 'settings')).tools
      .map((candidate) => candidate.descriptor.name).filter((name) => names.includes(name))).toEqual([]);
    for (const name of names) {
      await expect(tool(snapshot, name).execute({}, { abortSignal })).resolves.toMatchObject({
        ok: false, error: { code: 'unknown_tool' },
      });
    }
    expect(invokeMain).toHaveBeenCalledTimes(4);
    expect(fakeCoreRuntime.commands).toHaveLength(2);
  });

  it('initially exposes only enabled capabilities and discover_tools', () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );

    const snapshot = service.snapshot([{ role: 'user', content: 'Inspect Capture.' }]);

    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual(['discover_tools']);
    expect(snapshot.systemMessages).toHaveLength(1);
    expect(snapshot.systemMessages[0]?.content).toContain('- capture:');
    expect(snapshot.systemMessages[0]?.content).not.toContain('capture_get_proxy_status');
  });

  it('discovers and then discloses the connected Capture Tools in registry order', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );
    const initial = service.snapshot([]);

    const discovery = await tool(initial, 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: [
          { descriptor: { name: 'capture_get_proxy_status' } },
          { descriptor: { name: 'capture_get_storage_status' } },
          { descriptor: { name: 'capture_start_recording' } },
          { descriptor: { name: 'capture_stop_recording' } },
          { descriptor: { name: 'capture_clear' } },
          { descriptor: { name: 'capture_list_exchanges' } },
          { descriptor: { name: 'capture_get_exchange' } },
          { descriptor: { name: 'capture_get_exchange_body' } },
          { descriptor: { name: 'capture_list_websocket_messages' } },
          { descriptor: { name: 'capture_list_grpc_messages' } },
        ],
      },
    });

    const disclosed = service.snapshot(discoveredHistory(discovery));
    expect(disclosed.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'capture_get_proxy_status',
      'capture_get_storage_status',
      'capture_start_recording',
      'capture_stop_recording',
      'capture_clear',
      'capture_list_exchanges',
      'capture_get_exchange',
      'capture_get_exchange_body',
      'capture_list_websocket_messages',
      'capture_list_grpc_messages',
    ]);
    expect(tool(disclosed, 'capture_start_recording').kind).toBe('change');
    expect(tool(disclosed, 'capture_stop_recording').kind).toBe('change');
    expect(tool(disclosed, 'capture_clear').kind).toBe('change');
  });

  it('removes disabled capabilities and previously disclosed Tools on the next snapshot', async () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      settings,
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const history = discoveredHistory(discovery);

    settings.agentDisabledToolNames = ['capture_get_proxy_status'];

    const snapshot = service.snapshot(history);
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'capture_get_storage_status',
      'capture_start_recording',
      'capture_stop_recording',
      'capture_clear',
      'capture_list_exchanges',
      'capture_get_exchange',
      'capture_get_exchange_body',
      'capture_list_websocket_messages',
      'capture_list_grpc_messages',
    ]);
  });

  it('discovers and discloses exactly the five connected Rules Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );

    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: [
          { descriptor: { name: 'rules_get_tree' } },
          { descriptor: { name: 'rules_get_hits' } },
          { descriptor: { name: 'rules_replace_tree' } },
          { descriptor: { name: 'rules_export' } },
          { descriptor: { name: 'rules_import' } },
        ],
      },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'rules_get_tree',
      'rules_get_hits',
      'rules_replace_tree',
      'rules_export',
      'rules_import',
    ]);
    expect(tool(snapshot, 'rules_get_tree').kind).toBe('query');
    expect(tool(snapshot, 'rules_get_hits').kind).toBe('query');
    expect(tool(snapshot, 'rules_replace_tree').kind).toBe('change');
    expect(tool(snapshot, 'rules_export').kind).toBe('change');
    expect(tool(snapshot, 'rules_import').kind).toBe('change');
  });

  it('discovers and discloses exactly the eight connected Breakpoints Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const names = [
      'breakpoints_list',
      'breakpoints_enable_http',
      'breakpoints_disable_http',
      'breakpoints_enable_websocket',
      'breakpoints_disable_websocket',
      'breakpoints_continue',
      'breakpoints_forward_edited',
      'breakpoints_drop',
      'breakpoints_continue_queue',
      'breakpoints_drop_queue',
      'breakpoints_continue_rule',
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
    expect(tool(snapshot, 'breakpoints_list').kind).toBe('query');
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'breakpoints'));
    const abortController = new AbortController();

    await tool(snapshot, 'breakpoints_list').execute({}, { abortSignal: abortController.signal });
    await tool(snapshot, 'breakpoints_enable_http').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_disable_http').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_enable_websocket').execute(
      { exchangeId: 'exchange-ws', frames: ['message'] },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_disable_websocket').execute(
      {},
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_continue').execute(
      { breakpointId: 'bp-1' },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_forward_edited').execute(
      { breakpointId: 'bp-2', body: '' },
      { abortSignal: abortController.signal },
    );
    await tool(snapshot, 'breakpoints_drop').execute(
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

  it('discovers and discloses exactly the four connected Composer Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );

    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'composer' },
      { abortSignal: new AbortController().signal },
    );

    expect(discovery).toEqual({
      ok: true,
      value: {
        matches: expect.arrayContaining([
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_send_request' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_probe_connection' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_get_collection' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_replace_collection' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_export_collection' }) }),
          expect.objectContaining({ descriptor: expect.objectContaining({ name: 'composer_import_collection' }) }),
        ]),
      },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'composer'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'composer_send_request',
      'composer_probe_connection',
      'composer_get_collection',
      'composer_replace_collection',
      'composer_export_collection',
      'composer_import_collection',
    ]);
    expect(tool(snapshot, 'composer_send_request').kind).toBe('change');
    expect(tool(snapshot, 'composer_probe_connection').kind).toBe('change');
    expect(tool(snapshot, 'composer_get_collection').kind).toBe('query');
    expect(tool(snapshot, 'composer_replace_collection').kind).toBe('change');
    expect(tool(snapshot, 'composer_export_collection').kind).toBe('change');
    expect(tool(snapshot, 'composer_import_collection').kind).toBe('change');
  });

  it('discovers, discloses, and executes the Diagnostics query Tool', async () => {
    const page = {
      records: [{
        timestamp: '2026-09-05T00:00:00.000Z',
        sequence: 8,
        level: 'info' as const,
        process: 'core' as const,
        requestId: 'request-1',
        command: 'composer.send' as const,
        phase: 'command.completed',
        durationMs: 3,
        outcome: 'success' as const,
      }],
      hasMore: false,
      droppedCount: 0,
    };
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('diagnostics.query', {
      type: 'diagnostics.page',
      payload: page,
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
      () => undefined,
      () => undefined,
      vi.fn(),
    );

    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'diagnostics' },
      { abortSignal: new AbortController().signal },
    );
    expect(discovery).toMatchObject({
      ok: true,
      value: { matches: ['diagnostics_query', 'diagnostics_get_trace', 'diagnostics_get_recent', 'diagnostics_export']
        .map((name) => ({ descriptor: { name } })) },
    });
    const snapshot = service.snapshot(discoveredHistory(discovery, 'diagnostics'));
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'diagnostics_query',
      'diagnostics_get_trace',
      'diagnostics_get_recent',
      'diagnostics_export',
    ]);
    expect(tool(snapshot, 'diagnostics_query').kind).toBe('query');
    const abortController = new AbortController();
    await expect(tool(snapshot, 'diagnostics_query').execute({
      process: 'core',
      command: 'composer.send',
      outcome: 'success',
      limit: 10,
    }, { abortSignal: abortController.signal })).resolves.toEqual({ ok: true, value: page });
    expect(coreRuntime.commands).toEqual([{
      type: 'diagnostics.query',
      payload: {
        cursor: undefined,
        limit: 10,
        process: 'core',
        level: undefined,
        outcome: 'success',
        traceId: undefined,
        command: 'composer.send',
        minDurationMs: undefined,
        maxDurationMs: undefined,
      },
    }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes both Composer Tools through CoreRuntime with cancellation', async () => {
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'composer' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'composer'));
    const abortController = new AbortController();

    await tool(snapshot, 'composer_send_request').execute({
      method: 'POST',
      url: 'https://api.test/items',
      headers: [{ name: 'x-mode', value: 'agent' }],
      body: '',
      protocol: 'http/1.1',
      timeoutMs: 2_000,
    }, { abortSignal: abortController.signal });
    await tool(snapshot, 'composer_probe_connection').execute({
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const continueBreakpoint = tool(
      service.snapshot(discoveredHistory(discovery, 'breakpoints')),
      'breakpoints_continue',
    );

    settings.agentDisabledToolNames = ['breakpoints_continue'];
    const result = await continueBreakpoint.execute(
      { breakpointId: 'bp-1' },
      { abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unknown_tool',
        message: 'Unknown tool "breakpoints_continue".',
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'breakpoints' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'breakpoints'));
    const continueBreakpoint = tool(snapshot, 'breakpoints_continue');

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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();

    await expect(tool(snapshot, 'capture_get_exchange_body').execute(
      { exchangeId: 'exchange-http', bodyId: 'body-1', length: 32 },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { bodyId: 'body-1', end: true } });
    await expect(tool(snapshot, 'capture_list_websocket_messages').execute(
      { exchangeId: 'exchange-ws', direction: 'client-to-server', limit: 25 },
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { items: [{ seq: 1 }] } });
    await expect(tool(snapshot, 'capture_list_grpc_messages').execute(
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

  it('executes capture_get_storage_status through capture.status with the caller AbortSignal', async () => {
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();

    const result = await tool(snapshot, 'capture_get_storage_status').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'capture_get_proxy_status').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({ ok: true, value: { running: true, recording: true } });
    expect(coreRuntime.commands).toEqual([{ type: 'proxy.status', payload: {} }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes capture_stop_recording through the formal Core recording command', async () => {
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'capture_stop_recording').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();
    const clearCapture = tool(snapshot, 'capture_clear');

    await expect(clearCapture.describeEffect?.(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toEqual({
      text: 'Scope: all\nThis permanently deletes 7 exchange(s) and 3 body/bodies.',
      metadata: { scope: 'all', exchangeCount: 7, bodyCount: 3 },
    });
    await expect(tool(snapshot, 'capture_start_recording').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));
    const abortController = new AbortController();
    const applyRules = tool(snapshot, 'rules_replace_tree');

    await expect(tool(snapshot, 'rules_get_tree').execute(
      {},
      { abortSignal: abortController.signal },
    )).resolves.toMatchObject({ ok: true, value: { ruleSet: { revision: 4 } } });
    await expect(tool(snapshot, 'rules_get_hits').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'rules' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery, 'rules'));

    await expect(tool(snapshot, 'rules_replace_tree').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    await expect(tool(snapshot, 'capture_clear').execute(
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
      vi.fn(),
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'capture' },
      { abortSignal: new AbortController().signal },
    );
    const getStorageStatus = tool(
      service.snapshot(discoveredHistory(discovery)),
      'capture_get_storage_status',
    );

    settings.agentDisabledToolNames = ['capture_get_storage_status'];
    const result = await getStorageStatus.execute(
      {},
      { abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unknown_tool',
        message: 'Unknown tool "capture_get_storage_status".',
      },
    });
    expect(coreRuntime.commands).toHaveLength(0);
  });
});
