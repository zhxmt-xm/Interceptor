import { describe, expect, it } from 'vitest';

import type { CoreCommand, RuleNode } from '@interceptor/core-protocol';

import {
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  TOOL_BODY_PREVIEW_MAX_BYTES,
  TOOL_PRESERVE_LOCAL_PATH,
  type InterceptorToolDefinition,
  type InterceptorToolHost,
} from '../../src';

const TOOL_NAMES = [
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
  'rules_get_tree',
  'rules_get_hits',
  'rules_replace_tree',
  'rules_export',
  'rules_import',
  'composer_send_request',
  'composer_probe_connection',
  'composer_get_collection',
  'composer_replace_collection',
  'composer_export_collection',
  'composer_import_collection',
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
  'diagnostics_query',
  'diagnostics_get_trace',
  'diagnostics_get_recent',
  'diagnostics_export',
  'settings_get_core_process_status',
  'settings_get_system_proxy_status',
  'settings_get_certificate_status',
  'settings_get_tls_insecure_hosts',
  'settings_get_tls_passthrough',
  'settings_list_app_containers',
  'settings_enable_system_proxy',
  'settings_restore_system_proxy',
  'settings_replace_tls_insecure_hosts',
  'settings_replace_tls_passthrough',
  'settings_enable_https_decryption',
  'settings_disable_https_decryption',
] as const;

class FakeToolHost implements InterceptorToolHost {
  readonly commands: CoreCommand[] = [];
  readonly #results: ReadonlyMap<string, unknown>;

  constructor(results: Readonly<Record<string, unknown>> = {}) {
    this.#results = new Map(Object.entries(results));
  }

  async invoke(command: CoreCommand): Promise<never> {
    this.commands.push(command);
    const result = this.#results.get(command.type);
    if (result === undefined) throw new Error(`no fake result for ${command.type}`);
    return result as never;
  }

  async invokeMain(): Promise<never> {
    throw new Error('Main queries use the Settings Tool fixture.');
  }
}

function definition(name: string): InterceptorToolDefinition {
  const result = buildInterceptorToolRegistry().find((tool) => tool.name === name);
  if (!result) throw new Error(`missing Tool ${name}`);
  return result;
}

function completeRuleTree(): RuleNode[] {
  return [{
    kind: 'folder',
    id: 'folder-1',
    name: 'API',
    children: [{
      kind: 'folder',
      id: 'folder-2',
      name: 'Version 1',
      children: [{
        kind: 'folder',
        id: 'folder-3',
        name: 'Users',
        children: [{
          kind: 'rule',
          id: 'rule-1',
          name: 'Rewrite user request',
          enabled: true,
          priority: 0,
          matchers: [
            { type: 'method', value: 'GET' },
            { type: 'host', value: 'api.test', mode: 'exact', caseSensitive: false },
            { type: 'path', value: '/v1/users', mode: 'contains' },
            { type: 'url', value: 'https://api.test/v1/users', mode: 'regex' },
            { type: 'query', key: 'active', mode: 'exact', value: 'true' },
            { type: 'header', phase: 'request', name: 'accept', mode: 'contains', value: 'json' },
            { type: 'status', min: 200, max: 299 },
            { type: 'mime', phase: 'response', value: 'application/json' },
          ],
          actions: [
            { type: 'header', phase: 'request', op: 'set', name: 'x-mode', value: 'active' },
            { type: 'query', op: 'set', name: 'source', value: 'agent' },
            { type: 'body', phase: 'request', format: 'json', content: '{}' },
            {
              type: 'synthetic',
              statusCode: 201,
              headers: [{ name: 'content-type', value: 'application/json' }],
              body: '{}',
            },
            { type: 'map-local', path: TOOL_PRESERVE_LOCAL_PATH },
            { type: 'map-remote', scheme: 'https', host: 'upstream.test', port: 443, path: '/v2' },
            { type: 'block', mode: 'reset' },
            { type: 'status', statusCode: 202 },
            { type: 'delay', phase: 'response', ms: 25 },
            { type: 'breakpoint', phase: 'request' },
          ],
        }],
      }],
    }],
  }];
}

function schemaConstants(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(schemaConstants);
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Readonly<Record<string, unknown>>;
  return [
    ...(typeof record['const'] === 'string' ? [record['const']] : []),
    ...(Array.isArray(record['enum'])
      ? record['enum'].filter((entry): entry is string => typeof entry === 'string')
      : []),
    ...Object.values(record).flatMap(schemaConstants),
  ];
}

async function execute(
  name: string,
  args: Readonly<Record<string, unknown>>,
  fakeToolHost: FakeToolHost,
): Promise<unknown> {
  return definition(name).execute(args, {
    host: fakeToolHost,
    abortSignal: new AbortController().signal,
  });
}

describe('Interceptor Tool registry', () => {
  it('registers the exact 40 transport-neutral Tools in stable order', () => {
    const tools = buildInterceptorToolRegistry();

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(new Set(tools.map((tool) => tool.name))).toHaveLength(48);
    expect(tools.every((tool) => tool.capabilityId.length > 0)).toBe(true);
    expect(tools.every((tool) => tool.name.startsWith(`${tool.capabilityId}_`))).toBe(true);
    expect(tools.every((tool) => tool.kind === 'query' || tool.kind === 'change')).toBe(true);
    expect(tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      'get_proxy_status',
      'apply_rules',
      'send_request',
      'list_breakpoints',
      'query_diagnostics',
      'set_recording',
      'configure_breakpoint',
      'resolve_breakpoint',
    ]));
  });

  it('projects progressive discovery descriptors from the same executable registry', () => {
    const registry = buildInterceptorToolRegistry();
    const catalog = buildInterceptorToolCatalog(registry);

    expect(catalog.listCapabilities().map((capability) => capability.id)).toEqual([
      'capture',
      'rules',
      'composer',
      'breakpoints',
      'diagnostics',
      'settings',
    ]);
    const discovered = catalog.discover({ capabilityId: 'capture' });
    expect(discovered.map((match) => match.descriptor.name)).toEqual(
      registry.filter((tool) => tool.capabilityId === 'capture').map((tool) => tool.name),
    );
    expect(discovered[0]?.descriptor).not.toHaveProperty('execute');
  });

  it('reads listener and recording state through the Capture proxy status Tool', async () => {
    const status = { host: '127.0.0.1', port: 8888, recording: true };
    const fakeToolHost = new FakeToolHost({
      'proxy.status': { type: 'proxy.status', payload: status },
    });

    await expect(execute('capture_get_proxy_status', {}, fakeToolHost)).resolves.toEqual(status);
    expect(fakeToolHost.commands).toEqual([{ type: 'proxy.status', payload: {} }]);
  });

  it('reads Capture usage without changing the stored counts', async () => {
    const usage = { sessionCount: 1, exchangeCount: 3, bodyCount: 2, totalBytes: 512 };
    const fakeToolHost = new FakeToolHost({
      'capture.status': { type: 'capture.status', payload: usage },
    });

    await expect(execute('capture_get_storage_status', {}, fakeToolHost)).resolves.toEqual(usage);
    expect(fakeToolHost.commands).toEqual([{ type: 'capture.status', payload: {} }]);
  });

  it('lists Capture exchanges with all filters and preserves pagination', async () => {
    const page = {
      items: [{ id: 'exchange-1', path: '/v1/items', host: 'api.test', method: 'POST' }],
      nextCursor: 'cursor-2',
      hasMore: true,
    };
    const filter = {
      host: 'api.test',
      method: 'POST',
      status: 201,
      mime: 'application/json',
      appName: 'client',
      search: 'items',
      protocol: 'h2',
    };
    const fakeToolHost = new FakeToolHost({
      'sessions.query': { type: 'sessions.page', payload: page },
    });

    await expect(execute('capture_list_exchanges', {
      cursor: 'cursor-1',
      limit: 25,
      sort: 'started_asc',
      ...filter,
    }, fakeToolHost)).resolves.toEqual(page);
    expect(fakeToolHost.commands).toEqual([{
      type: 'sessions.query',
      payload: { cursor: 'cursor-1', limit: 25, sort: 'started_asc', filter },
    }]);
  });

  it('queries Diagnostics with every supported filter and preserves the Core page', async () => {
    const page = {
      records: [{
        timestamp: '2026-09-05T00:00:00.000Z',
        sequence: 12,
        level: 'info',
        process: 'core',
        requestId: 'request-1',
        command: 'composer.send',
        phase: 'command.completed',
        durationMs: 4,
        outcome: 'success',
        attributes: { resultType: 'composer.response' },
      }],
      nextCursor: 'cursor-1',
      hasMore: true,
      droppedCount: 2,
    } as const;
    const fakeToolHost = new FakeToolHost({
      'diagnostics.query': { type: 'diagnostics.page', payload: page },
    });
    const abortController = new AbortController();

    await expect(definition('diagnostics_query').execute({
      cursor: 'cursor-0',
      limit: 25,
      process: 'core',
      level: 'info',
      outcome: 'success',
      traceId: 'trace-1',
      command: 'composer.send',
      minDurationMs: 1,
      maxDurationMs: 50,
    }, {
      host: fakeToolHost,
      abortSignal: abortController.signal,
    })).resolves.toEqual(page);
    expect(fakeToolHost.commands).toEqual([{
      type: 'diagnostics.query',
      payload: {
        cursor: 'cursor-0',
        limit: 25,
        process: 'core',
        level: 'info',
        outcome: 'success',
        traceId: 'trace-1',
        command: 'composer.send',
        minDurationMs: 1,
        maxDurationMs: 50,
      },
    }]);
  });

  it('maps recording and HTTP breakpoint intents to separate Core commands', async () => {
    const fakeToolHost = new FakeToolHost({
      'proxy.start': { type: 'proxy.status', payload: {} },
      'proxy.setRecording': { type: 'proxy.status', payload: {} },
      'breakpoint.configure': { type: 'breakpoint.configuration', payload: {} },
    });

    await execute('capture_start_recording', {}, fakeToolHost);
    await execute('capture_stop_recording', {}, fakeToolHost);
    await execute('breakpoints_enable_http', {}, fakeToolHost);
    await execute('breakpoints_disable_http', {}, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'proxy.start', payload: {} },
      { type: 'proxy.setRecording', payload: { recording: false } },
      { type: 'breakpoint.configure', payload: { enabled: true } },
      { type: 'breakpoint.configure', payload: { enabled: false } },
    ]);
    expect(definition('capture_stop_recording').effectDescription)
      .toBe('New traffic will continue through the proxy but will not be captured.');
  });

  it('maps continue, edited forward, and drop to distinct breakpoint actions', async () => {
    const fakeToolHost = new FakeToolHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: 'bp-2',
            phase: 'request',
            queueKey: 'http',
            createdAt: 1,
            ruleName: 'Pause request',
            headers: [],
            bodyAvailable: false,
          }],
        },
      },
      'breakpoint.resolve': { type: 'breakpoint.resolution', payload: {} },
    });

    await execute('breakpoints_continue', { breakpointId: 'bp-1' }, fakeToolHost);
    await execute('breakpoints_forward_edited', { breakpointId: 'bp-2', body: '' }, fakeToolHost);
    await execute('breakpoints_drop', { breakpointId: 'bp-3' }, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-1', action: 'continue' } },
      { type: 'breakpoint.list', payload: {} },
      {
        type: 'breakpoint.resolve',
        payload: { breakpointId: 'bp-2', action: 'continue', edit: { body: '' } },
      },
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-3', action: 'drop' } },
    ]);
    await expect(execute('breakpoints_forward_edited', { breakpointId: 'bp-4' }, fakeToolHost))
      .rejects.toThrow('at least one edit');
  });

  it('describes HTTP breakpoint configuration from current Core state', async () => {
    const fakeToolHost = new FakeToolHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: { enabled: false, breakpoints: [{ id: 'bp-1' }, { id: 'bp-2' }] },
      },
    });
    const context = {
      host: fakeToolHost,
      abortSignal: new AbortController().signal,
    };

    await expect(definition('breakpoints_enable_http').describeChange?.({}, context))
      .resolves.toEqual({
        lines: ['HTTP breakpoints: disabled → enabled', 'Currently pending: 2'],
        metadata: { currentEnabled: false, nextEnabled: true, pendingCount: 2 },
      });
    await expect(definition('breakpoints_disable_http').describeChange?.({}, context))
      .resolves.toEqual({
        lines: ['HTTP breakpoints: disabled → disabled', 'Currently pending: 2'],
        metadata: { currentEnabled: false, nextEnabled: false, pendingCount: 2 },
      });
    expect(fakeToolHost.commands).toEqual([
      { type: 'breakpoint.list', payload: {} },
      { type: 'breakpoint.list', payload: {} },
    ]);
  });

  it('describes one current pending identity without exposing its body', async () => {
    const fakeToolHost = new FakeToolHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: 'bp-1',
            phase: 'request',
            queueKey: 'http',
            ruleId: 'rule-1',
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
      },
    });
    const context = {
      host: fakeToolHost,
      abortSignal: new AbortController().signal,
    };

    const continuation = await definition('breakpoints_continue').describeChange?.(
      { breakpointId: 'bp-1' },
      context,
    );
    const edited = await definition('breakpoints_forward_edited').describeChange?.(
      { breakpointId: 'bp-1', method: 'PUT', body: '' },
      context,
    );
    const dropped = await definition('breakpoints_drop').describeChange?.(
      { breakpointId: 'bp-1' },
      context,
    );

    expect(continuation).toEqual({
      lines: [
        'Breakpoint: bp-1',
        'Phase: request',
        'Queue: http',
        'Target: POST http://api.test/items',
      ],
      metadata: {
        breakpointId: 'bp-1',
        phase: 'request',
        queueKey: 'http',
        ruleId: 'rule-1',
        exchangeId: 'exchange-1',
        target: 'POST http://api.test/items',
      },
    });
    expect(edited?.lines).toEqual([
      'Breakpoint: bp-1',
      'Phase: request',
      'Queue: http',
      'Target: POST http://api.test/items',
      'method → PUT',
      'body → ',
    ]);
    expect(dropped).toEqual(continuation);
    expect(JSON.stringify([continuation, edited, dropped])).not.toContain('private-body');
    expect(fakeToolHost.commands).toEqual(Array(3).fill({
      type: 'breakpoint.list',
      payload: {},
    }));
  });

  it.each([
    ['request', { statusCode: 204 }, 'statusCode'],
    ['response', { method: 'PUT' }, 'method'],
    ['websocket', { url: 'ws://other.test/socket' }, 'url'],
  ] as const)(
    'rejects fields that do not apply to a %s breakpoint before approval or execution',
    async (phase, invalidEdit, field) => {
      const result = {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: `bp-${phase}`,
            phase,
            queueKey: phase === 'websocket' ? 'ws:exchange-1' : 'http',
            createdAt: 1,
            ruleName: `Pause ${phase}`,
            headers: [],
            bodyAvailable: false,
          }],
        },
      };
      const args = { breakpointId: `bp-${phase}`, ...invalidEdit };
      const descriptionHost = new FakeToolHost({ 'breakpoint.list': result });
      const executionHost = new FakeToolHost({ 'breakpoint.list': result });

      await expect(definition('breakpoints_forward_edited').describeChange?.(
        args,
        { host: descriptionHost, abortSignal: new AbortController().signal },
      )).rejects.toThrow(`"${field}" cannot edit a ${phase} breakpoint`);
      await expect(execute('breakpoints_forward_edited', args, executionHost))
        .rejects.toThrow(`"${field}" cannot edit a ${phase} breakpoint`);
      expect(descriptionHost.commands).toEqual([{ type: 'breakpoint.list', payload: {} }]);
      expect(executionHost.commands).toEqual([{ type: 'breakpoint.list', payload: {} }]);
    },
  );

  it.each([
    ['request', { method: 'PUT', url: 'http://api.test/next', body: 'request' }],
    ['response', { statusCode: 204, body: 'response' }],
    ['websocket', { body: 'frame' }],
  ] as const)('forwards fields that apply to a %s breakpoint', async (phase, edit) => {
    const breakpointId = `bp-${phase}`;
    const fakeToolHost = new FakeToolHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: breakpointId,
            phase,
            queueKey: phase === 'websocket' ? 'ws:exchange-1' : 'http',
            createdAt: 1,
            ruleName: `Pause ${phase}`,
            headers: [],
            bodyAvailable: false,
          }],
        },
      },
      'breakpoint.resolve': {
        type: 'breakpoint.resolution',
        payload: { breakpointId, state: 'edited' },
      },
    });

    await expect(execute('breakpoints_forward_edited', {
      breakpointId,
      ...edit,
    }, fakeToolHost)).resolves.toEqual({ breakpointId, state: 'edited' });
    expect(fakeToolHost.commands.at(-1)).toEqual({
      type: 'breakpoint.resolve',
      payload: { breakpointId, action: 'continue', edit },
    });
  });

  it('rejects an empty WebSocket frame selection before approval or execution', async () => {
    const descriptionHost = new FakeToolHost();
    const executionHost = new FakeToolHost();
    const args = { exchangeId: 'exchange-1', frames: [] };

    await expect(definition('breakpoints_enable_websocket').describeChange?.(
      args,
      { host: descriptionHost, abortSignal: new AbortController().signal },
    )).rejects.toThrow('"frames" must be a non-empty array');
    await expect(execute('breakpoints_enable_websocket', args, executionHost))
      .rejects.toThrow('"frames" must be a non-empty array');
    expect(descriptionHost.commands).toEqual([]);
    expect(executionHost.commands).toEqual([]);
  });

  it('rejects a stale breakpoint identity before approval', async () => {
    const fakeToolHost = new FakeToolHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: { enabled: true, breakpoints: [] },
      },
    });

    await expect(definition('breakpoints_drop').describeChange?.(
      { breakpointId: 'bp-stale' },
      { host: fakeToolHost, abortSignal: new AbortController().signal },
    )).rejects.toThrow('is no longer pending');
    expect(fakeToolHost.commands).toEqual([{ type: 'breakpoint.list', payload: {} }]);
  });

  it('describes WebSocket breakpoint enable and disable without local paths', async () => {
    const description = await definition('breakpoints_enable_websocket').describeChange?.({
      exchangeId: 'exchange-ws',
      direction: 'server-to-client',
      frames: ['message', 'close'],
    }, {
      host: new FakeToolHost(),
      abortSignal: new AbortController().signal,
    });

    expect(description).toEqual({
      lines: [
        'Connection: exchange-ws',
        'Direction: server-to-client',
        'Frames: message, close',
      ],
      metadata: {
        exchangeId: 'exchange-ws',
        direction: 'server-to-client',
        frameCount: 2,
      },
    });
    expect(definition('breakpoints_disable_websocket').effectDescription)
      .toBe('The active WebSocket breakpoint configuration will be disabled.');
    expect(JSON.stringify(description)).not.toContain('path');
  });

  it('clears only the complete Capture and rejects the obsolete session scope', async () => {
    const fakeToolHost = new FakeToolHost({
      'capture.cleanup': { type: 'capture.status', payload: {} },
    });

    await execute('capture_clear', {}, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'capture.cleanup', payload: { scope: 'all' } },
    ]);
    await expect(execute('capture_clear', { scope: 'session', sessionId: 's1' }, fakeToolHost))
      .rejects.toThrow('unknown argument');
  });

  it('describes the current Capture cleanup effect with structured counts', async () => {
    const fakeToolHost = new FakeToolHost({
      'capture.status': {
        type: 'capture.status',
        payload: { exchangeCount: 7, bodyCount: 3 },
      },
    });

    const description = await definition('capture_clear').describeChange?.({}, {
      host: fakeToolHost,
      abortSignal: new AbortController().signal,
    });

    expect(description).toEqual({
      lines: [
        'Scope: all',
        'This permanently deletes 7 exchange(s) and 3 body/bodies.',
      ],
      metadata: { scope: 'all', exchangeCount: 7, bodyCount: 3 },
    });
  });

  it('preserves the complete Rule tree and enabled state during compare-and-replace', async () => {
    const nodes = completeRuleTree();
    const persistedNodes = structuredClone(nodes);
    const persistedRule = (persistedNodes[0] as { children: Array<{ children: Array<{ children: Array<{ actions: Array<Record<string, unknown>> }> }> }> })
      .children[0]!.children[0]!.children[0]!;
    persistedRule.actions[4] = { type: 'map-local', path: 'C:\\fixtures\\response.json' };
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 7, nodes: persistedNodes } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 8 } },
    });

    await execute('rules_replace_tree', { baseRevision: 7, nodes }, fakeToolHost);

    expect(fakeToolHost.commands.at(-1)).toEqual({
      type: 'rules.replace',
      payload: { expectedRevision: 7, nodes: persistedNodes },
    });
  });

  it('redacts Map Local paths and only preserves an unchanged Rule across folder moves', async () => {
    const persistedRule = {
      kind: 'rule' as const,
      id: 'rule-local',
      name: 'Local response',
      enabled: true,
      priority: 0,
      matchers: [{ type: 'method' as const, value: 'GET' }],
      actions: [{ type: 'map-local' as const, path: 'C:\\Users\\me\\secret.txt' }],
    };
    const persistedNodes: RuleNode[] = [{
      kind: 'folder',
      id: 'folder-before',
      name: 'Before',
      children: [persistedRule],
    }];
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 3, nodes: persistedNodes } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 4 } },
    });

    const result = await execute('rules_get_tree', {}, fakeToolHost) as { ruleSet: { nodes: RuleNode[] } };
    const returnedFolder = result.ruleSet.nodes[0];
    if (returnedFolder?.kind !== 'folder' || returnedFolder.children[0]?.kind !== 'rule') {
      throw new Error('Expected the redacted Map Local Rule inside its folder.');
    }
    const redactedRule = returnedFolder.children[0];
    expect(redactedRule.actions[0]).toMatchObject({
      type: 'map-local',
      path: TOOL_PRESERVE_LOCAL_PATH,
    });
    expect(JSON.stringify(result)).not.toContain('secret.txt');

    const movedNodes: RuleNode[] = [{
      kind: 'folder',
      id: 'folder-after',
      name: 'After',
      children: [{ ...redactedRule, priority: -0 }],
    }];
    await execute('rules_replace_tree', {
      baseRevision: 3,
      nodes: movedNodes,
    }, fakeToolHost);
    expect(fakeToolHost.commands.at(-1)).toEqual({
      type: 'rules.replace',
      payload: {
        expectedRevision: 3,
        nodes: [{
          kind: 'folder',
          id: 'folder-after',
          name: 'After',
          children: [{ ...persistedRule, priority: -0 }],
        }],
      },
    });

    await expect(execute('rules_replace_tree', {
      baseRevision: 3,
      nodes: [{
        ...movedNodes[0],
        children: [{
          ...redactedRule,
          matchers: [{ type: 'method', value: 'POST' }],
        }],
      }],
    }, fakeToolHost)).rejects.toThrow('only be preserved while its Rule remains unchanged');
    expect(fakeToolHost.commands.filter((command) => command.type === 'rules.replace')).toHaveLength(1);
  });

  it('rejects a Model-authored Map Local path before Core access', async () => {
    const nodes = [{
      kind: 'rule', id: 'rule-local', name: 'Read secret', enabled: true, priority: 0,
      matchers: [{ type: 'method', value: 'GET' }],
      actions: [{ type: 'map-local', path: 'C:\\Users\\me\\secret.txt' }],
    }];
    const fakeToolHost = new FakeToolHost();

    await expect(execute('rules_replace_tree', { baseRevision: 0, nodes }, fakeToolHost))
      .rejects.toThrow('invalid Rule tree');
    expect(fakeToolHost.commands).toEqual([]);
  });

  it('does not let the Map Local placeholder create a new file action', async () => {
    const nodes = [{
      kind: 'rule', id: 'rule-local', name: 'New local action', enabled: true, priority: 0,
      matchers: [{ type: 'method', value: 'GET' }],
      actions: [{ type: 'map-local', path: TOOL_PRESERVE_LOCAL_PATH }],
    }];
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 0, nodes: [] } } },
    });

    await expect(execute('rules_replace_tree', { baseRevision: 0, nodes }, fakeToolHost))
      .rejects.toThrow('can only preserve an existing path in place');
    expect(fakeToolHost.commands.map((command) => command.type)).toEqual(['rules.get']);
  });

  it('reads Rule hit counts through the formal Core command', async () => {
    const counts = [{ ruleId: 'rule-1', count: 3 }, { ruleId: 'rule-2', count: 0 }];
    const fakeToolHost = new FakeToolHost({
      'rules.hits': { type: 'rules.hits', payload: { counts } },
    });

    await expect(execute('rules_get_hits', {}, fakeToolHost))
      .resolves.toEqual({ counts });
    expect(fakeToolHost.commands).toEqual([{ type: 'rules.hits', payload: {} }]);
  });

  it('describes rules_replace_tree counts and name changes from current Core state', async () => {
    const currentNodes = [{
      kind: 'rule' as const,
      id: 'rule-1',
      name: 'Before',
      enabled: true,
      priority: 0,
      matchers: [{ type: 'method' as const, value: 'GET' }],
      actions: [{ type: 'status' as const, statusCode: 200 }],
    }];
    const nextNodes = [{ ...currentNodes[0]!, name: 'After', enabled: false }];
    const fakeToolHost = new FakeToolHost({
      'rules.get': {
        type: 'rules.ruleset',
        payload: { ruleSet: { revision: 2, nodes: currentNodes } },
      },
    });

    await expect(definition('rules_replace_tree').describeChange?.(
      { baseRevision: 1, nodes: nextNodes },
      { host: fakeToolHost, abortSignal: new AbortController().signal },
    )).rejects.toThrow('rule set moved from revision 1 to 2');

    await expect(definition('rules_replace_tree').describeChange?.(
      { baseRevision: 2, nodes: nextNodes },
      { host: fakeToolHost, abortSignal: new AbortController().signal },
    )).resolves.toEqual({
      lines: [
        'Rule count: 1 → 1',
        'Removed: Before',
        'Added: After',
      ],
      metadata: {
        baseRevision: 2,
        currentRuleCount: 1,
        nextRuleCount: 1,
        currentEnabledCount: 1,
        nextEnabledCount: 0,
        removedNames: 'Before',
        addedNames: 'After',
      },
    });
  });

  it('publishes the complete recursive Rule union in rules_replace_tree schema', () => {
    const inputSchema = definition('rules_replace_tree').inputSchema as unknown as Readonly<
      Record<string, unknown>
    >;
    const constants = schemaConstants(inputSchema);

    expect(inputSchema).toHaveProperty('$defs');
    expect(inputSchema).toHaveProperty('properties.nodes.items.$ref');
    expect(constants).toEqual(expect.arrayContaining([
      'folder', 'rule',
      'method', 'host', 'path', 'url', 'query', 'header', 'status', 'mime',
      'body', 'synthetic', 'map-local', 'map-remote', 'block', 'delay', 'breakpoint',
      'request', 'response', 'contains', 'exact', 'regex',
    ]));
  });

  it.each([
    ['extra folder field', [{ kind: 'folder', id: 'folder-1', name: 'A', children: [], extra: true }]],
    ['incomplete rule', [{ kind: 'rule', id: 'rule-1', name: 'A', enabled: true }]],
    ['unknown matcher', [{
      kind: 'rule', id: 'rule-1', name: 'A', enabled: true, priority: 0,
      matchers: [{ type: 'unknown' }], actions: [{ type: 'status', statusCode: 200 }],
    }]],
    ['unknown action', [{
      kind: 'rule', id: 'rule-1', name: 'A', enabled: true, priority: 0,
      matchers: [{ type: 'method', value: 'GET' }], actions: [{ type: 'unknown' }],
    }]],
    ['four nested folders', [{
      kind: 'folder', id: 'folder-1', name: '1', children: [{
        kind: 'folder', id: 'folder-2', name: '2', children: [{
          kind: 'folder', id: 'folder-3', name: '3', children: [{
            kind: 'folder', id: 'folder-4', name: '4', children: [],
          }],
        }],
      }],
    }]],
    ['duplicate node ids', [{
      kind: 'folder', id: 'duplicate', name: 'Folder', children: [{
        kind: 'rule', id: 'duplicate', name: 'Rule', enabled: true, priority: 0,
        matchers: [{ type: 'method', value: 'GET' }],
        actions: [{ type: 'status', statusCode: 200 }],
      }],
    }]],
  ])('rejects an invalid rules_replace_tree tree before Core access: %s', async (_name, nodes) => {
    const fakeToolHost = new FakeToolHost();

    await expect(execute('rules_replace_tree', { baseRevision: 0, nodes }, fakeToolHost))
      .rejects.toThrow('invalid Rule tree');
    expect(fakeToolHost.commands).toEqual([]);
  });

  it('preserves finite numeric Rule values accepted by the product model', async () => {
    const nodes = [{
      kind: 'rule', id: 'rule-numbers', name: 'Numeric values', enabled: true, priority: 0.5,
      matchers: [{ type: 'status', min: 700, max: 99 }],
      actions: [
        { type: 'synthetic', statusCode: 700, headers: [{ name: '', value: '' }] },
        { type: 'map-remote', port: 0 },
        { type: 'status', statusCode: 99 },
        { type: 'delay', phase: 'request', ms: -1 },
      ],
    }];
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 0, nodes: [] } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 1 } },
    });

    await execute('rules_replace_tree', { baseRevision: 0, nodes }, fakeToolHost);

    expect(fakeToolHost.commands.at(-1)).toEqual({
      type: 'rules.replace',
      payload: { expectedRevision: 0, nodes },
    });
  });

  it('does not replace Rules when the base revision moved', async () => {
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 9, nodes: [] } } },
    });

    await expect(execute('rules_replace_tree', { baseRevision: 7, nodes: [] }, fakeToolHost))
      .rejects.toThrow('rule set moved from revision 7 to 9');
    expect(fakeToolHost.commands.map((command) => command.type)).not.toContain('rules.replace');
  });

  it('derives body media type and encoding from the owning exchange', async () => {
    const mediaHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            requestBody: {
              bodyHash: 'media-body',
              mediaType: 'video/mp4',
              contentEncoding: 'gzip',
            },
          },
        },
      },
    });

    const media = await execute('capture_get_exchange_body', {
      exchangeId: 'exchange-1',
      bodyId: 'media-body',
    }, mediaHost);

    expect(media).toMatchObject({ bodyId: 'media-body', opaque: true, mimeType: 'video/mp4' });
    expect(mediaHost.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-1' } },
    ]);

    const textHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            responseBody: {
              bodyHash: 'text-body',
              mediaType: 'text/plain',
              contentEncoding: 'br',
            },
          },
        },
      },
      'body.read-range': {
        type: 'body.range',
        payload: {
          bodyId: 'text-body',
          offset: 0,
          end: 5,
          decodeStatus: 'decoded',
          data: new TextEncoder().encode('hello'),
        },
      },
    });

    await execute('capture_get_exchange_body', {
      exchangeId: 'exchange-2',
      bodyId: 'text-body',
    }, textHost);

    expect(textHost.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-2' } },
      {
        type: 'body.read-range',
        payload: {
          bodyId: 'text-body',
          offset: 0,
          length: 64 * 1024,
          decode: true,
          encoding: 'br',
        },
      },
    ]);
    expect(definition('capture_get_exchange_body').inputSchema).toMatchObject({
      required: ['exchangeId', 'bodyId'],
      properties: { exchangeId: { type: 'string' }, bodyId: { type: 'string' } },
    });
    expect(definition('capture_get_exchange_body').inputSchema.properties).not.toHaveProperty('mimeType');
  });

  it('maps WebSocket and gRPC message pagination to their formal Core commands', async () => {
    const webSocketPage = {
      items: [{
        seq: 2,
        direction: 'server-to-client',
        opcode: 1,
        timestamp: 1_000,
        payloadSize: 5,
      }],
      nextCursor: 'ws-next',
      hasMore: true,
      breakpoint: null,
    };
    const grpcPage = {
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
    };
    const fakeToolHost = new FakeToolHost({
      'websocket.frames': { type: 'websocket.frames', payload: webSocketPage },
      'grpc.messages': { type: 'grpc.messages', payload: grpcPage },
    });

    await expect(execute('capture_list_websocket_messages', {
      exchangeId: 'exchange-ws',
      cursor: 'ws-cursor',
      limit: 25,
      direction: 'server-to-client',
    }, fakeToolHost)).resolves.toEqual(webSocketPage);
    await expect(execute('capture_list_grpc_messages', {
      exchangeId: 'exchange-grpc',
      side: 'response',
      cursor: 'grpc-cursor',
      limit: 30,
    }, fakeToolHost)).resolves.toEqual(grpcPage);

    expect(fakeToolHost.commands).toEqual([
      {
        type: 'websocket.frames',
        payload: {
          exchangeId: 'exchange-ws',
          cursor: 'ws-cursor',
          limit: 25,
          direction: 'server-to-client',
        },
      },
      {
        type: 'grpc.messages',
        payload: {
          exchangeId: 'exchange-grpc',
          side: 'response',
          cursor: 'grpc-cursor',
          limit: 30,
        },
      },
    ]);
  });

  it('redacts sensitive request and response trailers with headers', async () => {
    const fakeToolHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            url: 'https://example.test/',
            summary: { path: '/' },
            requestHeaders: [{ name: 'authorization', value: 'request-secret' }],
            responseHeaders: [{ name: 'set-cookie', value: 'response-secret' }],
            requestTrailers: [{ name: 'x-api-key', value: 'trailer-secret' }],
            responseTrailers: [{ name: 'x-auth-token', value: 'trailer-secret' }],
          },
        },
      },
    });

    const result = await execute('capture_get_exchange', { exchangeId: 'exchange-1' }, fakeToolHost);

    expect(result).toMatchObject({
      detail: {
        requestHeaders: [{ value: '<redacted>' }],
        responseHeaders: [{ value: '<redacted>' }],
        requestTrailers: [{ value: '<redacted>' }],
        responseTrailers: [{ value: '<redacted>' }],
      },
    });
  });

  it('rejects declared numeric bounds before invoking a product command', async () => {
    const fakeToolHost = new FakeToolHost();

    await expect(execute('composer_probe_connection', { host: 'example.com', port: 0 }, fakeToolHost))
      .rejects.toThrow('"port" must be at least 1');
    await expect(execute('composer_probe_connection', { host: 'example.com', port: 65_536 }, fakeToolHost))
      .rejects.toThrow('"port" must be at most 65535');
    await expect(execute(
      'composer_probe_connection',
      { host: 'example.com', port: 443, timeoutMs: 0 },
      fakeToolHost,
    )).rejects.toThrow('"timeoutMs" must be at least 1');
    await expect(execute(
      'breakpoints_forward_edited',
      { breakpointId: 'bp-1', statusCode: 99 },
      fakeToolHost,
    )).rejects.toThrow('"statusCode" must be at least 100');
    await expect(execute('capture_list_exchanges', { limit: 0 }, fakeToolHost))
      .rejects.toThrow('"limit" must be at least 1');
    await expect(execute('capture_list_exchanges', { limit: 201 }, fakeToolHost))
      .rejects.toThrow('"limit" must be at most 200');
    await expect(execute(
      'capture_get_exchange_body',
      { exchangeId: 'exchange-1', bodyId: 'body-1', length: 0 },
      fakeToolHost,
    )).rejects.toThrow('"length" must be at least 1');
    await expect(execute(
      'capture_get_exchange_body',
      { exchangeId: 'exchange-1', bodyId: 'body-1', length: TOOL_BODY_PREVIEW_MAX_BYTES + 1 },
      fakeToolHost,
    )).rejects.toThrow(`"length" must be at most ${TOOL_BODY_PREVIEW_MAX_BYTES}`);
    expect(fakeToolHost.commands).toHaveLength(0);
  });

  it('publishes the exact Composer header schema', () => {
    expect(definition('composer_send_request').inputSchema.properties['headers']).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          value: { type: 'string' },
        },
        required: ['name', 'value'],
        additionalProperties: false,
      },
    });
  });

  it.each([
    ['composer_send_request', {
      method: 'POST',
      url: 'https://api.test/items',
      protocol: 'ftp',
    }, '"protocol" must be one of'],
    ['composer_send_request', {
      method: 'POST',
      url: 'https://api.test/items',
      headers: [{ name: '', value: 'x' }],
    }, '"name" must be a non-empty string'],
    ['composer_send_request', {
      method: 'POST',
      url: 'https://api.test/items',
      headers: [{ name: ':method', value: 'DELETE' }],
    }, 'must not contain an HTTP/2 pseudo-header'],
    ['composer_probe_connection', {
      host: 'api.test',
      port: 0,
    }, '"port" must be at least 1'],
    ['composer_send_request', {
      method: 'GET',
      url: 'ftp://api.test/items',
    }, '"url" must use http or https'],
    ['composer_send_request', {
      method: 'GET',
      url: 'not-an-absolute-url',
    }, '"url" must be an absolute http or https URL'],
  ])('rejects invalid %s arguments before approval', async (name, args, message) => {
    const fakeToolHost = new FakeToolHost();

    await expect(definition(name).describeChange?.(
      args,
      { host: fakeToolHost, abortSignal: new AbortController().signal },
    )).rejects.toThrow(message);
    expect(fakeToolHost.commands).toEqual([]);
  });

  it('preserves an empty Composer body and redacts its bounded response', async () => {
    const timing = {
      dnsMs: 1,
      tcpMs: 2,
      tlsMs: 3,
      requestMs: 4,
      waitingMs: 5,
      downloadMs: 6,
      totalMs: 21,
    };
    const tls = {
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      alpn: 'h2',
      subject: 'example.test',
      issuer: 'Test CA',
      validFrom: '2026-01-01',
      validTo: '2027-01-01',
    };
    const fakeToolHost = new FakeToolHost({
      'composer.send': {
        type: 'composer.response',
        payload: {
          ok: true,
          status: 200,
          statusText: 'OK',
          httpVersion: '2.0',
          headers: [
            { name: 'content-type', value: 'text/plain' },
            { name: 'set-cookie', value: 'session=secret' },
          ],
          body: new TextEncoder().encode('x'.repeat(TOOL_BODY_PREVIEW_MAX_BYTES + 1)),
          totalBytes: TOOL_BODY_PREVIEW_MAX_BYTES + 1,
          durationMs: 1,
          timing,
          tls,
          remoteAddress: '127.0.0.1',
        },
      },
    });

    const result = await execute('composer_send_request', {
      method: 'POST',
      url: 'https://user:password@example.test/?access_token=request-secret',
      body: '',
    }, fakeToolHost);

    expect(fakeToolHost.commands[0]).toMatchObject({
      type: 'composer.send',
      payload: {
        body: '',
        url: 'https://user:password@example.test/?access_token=request-secret',
      },
    });
    expect(result).toMatchObject({
      method: 'POST',
      url: 'https://%3Credacted%3E:%3Credacted%3E@example.test/?access_token=%3Credacted%3E',
      headers: [
        { name: 'content-type', value: 'text/plain' },
        { name: 'set-cookie', value: '<redacted>' },
      ],
      timing,
      tls,
      body: { truncated: true, bytesRead: TOOL_BODY_PREVIEW_MAX_BYTES },
    });
    expect(result).not.toHaveProperty('bodyText');
  });

  it('maps a connection probe to the formal TLS command and returns its result', async () => {
    const probe = {
      ok: true,
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      alpn: 'h2',
      authorized: false,
      certificates: [{
        subject: 'CN=example.test',
        issuer: 'CN=example.test',
        validFrom: '2026-01-01',
        validTo: '2027-01-01',
        serialNumber: '01',
        fingerprint256: 'AA:BB',
      }],
    };
    const fakeToolHost = new FakeToolHost({
      'tls.probe': { type: 'tls.probed', payload: probe },
    });

    await expect(execute('composer_probe_connection', {
      host: 'example.test',
      port: 443,
      timeoutMs: 2_000,
    }, fakeToolHost)).resolves.toEqual(probe);
    expect(fakeToolHost.commands).toEqual([{
      type: 'tls.probe',
      payload: { host: 'example.test', port: 443, timeoutMs: 2_000 },
    }]);
  });
});